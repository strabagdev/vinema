import "fake-indexeddb/auto";
import { deleteDB } from "idb";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { KnowledgeResetResponse } from "@vinema/sync-contracts";
import { saveCaptureDraft } from "@/features/capture/capture-draft";
import {
  KNOWLEDGE_RESET_CONFIRMATION,
  clearLocalKnowledge,
  resetKnowledge,
  summarizeLocalKnowledge,
} from "@/features/knowledge-reset/knowledge-reset";
import { subscribeToSyncDataChanged } from "@/features/sync/sync-data-events";
import {
  IndexedDbSyncMetadataRepository,
  IndexedDbSyncOutboxRepository,
} from "@/features/sync/sync-outbox-repository";
import {
  APP_SETTINGS_STORE,
  CONTEXTS_STORE,
  NODE_CONTEXT_RELATIONS_STORE,
  NODES_STORE,
  SYNC_METADATA_STORE,
  SYNC_MUTATIONS_STORE,
  VINEMA_DB_NAME,
  getVinemaDb,
  resetVinemaDbConnectionForTests,
} from "@/infrastructure/storage/vinema-db";
import type { StorageAdapter } from "@/infrastructure/storage/storage-adapter";

const workspaceId = "11111111-1111-4111-8111-111111111111";
const otherWorkspaceId = "22222222-2222-4222-8222-222222222222";
const deviceId = "33333333-3333-4333-8333-333333333333";
const otherDeviceId = "44444444-4444-4444-8444-444444444444";
const nodeId = "55555555-5555-4555-8555-555555555555";
const contextId = "66666666-6666-4666-8666-666666666666";
const relationId = "77777777-7777-4777-8777-777777777777";
const otherNodeId = "88888888-8888-4888-8888-888888888888";
const otherContextId = "99999999-9999-4999-8999-999999999999";
const otherRelationId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const now = "2026-08-01T12:00:00.000Z";
const resetOccurredAt = "2026-08-01T12:30:00.000Z";
const resetVersion = "42";

describe("knowledge reset", () => {
  beforeEach(async () => {
    await resetVinemaDbConnectionForTests();
    await deleteDB(VINEMA_DB_NAME);
  });

  afterEach(async () => {
    await resetVinemaDbConnectionForTests();
    await deleteDB(VINEMA_DB_NAME);
  });

  it("requires the explicit VACIAR confirmation before contacting the API", async () => {
    const remoteClient = { reset: vi.fn() };

    await expect(
      resetKnowledge({
        workspaceId,
        confirmation: "BORRAR",
        storage: createMemoryStorage(),
        remoteClient,
      }),
    ).rejects.toMatchObject({
      code: "INVALID_CONFIRMATION",
    });
    expect(remoteClient.reset).not.toHaveBeenCalled();
  });

  it("does not clear local knowledge when the remote reset fails", async () => {
    const storage = createMemoryStorage();
    await seedKnowledge();
    await saveCaptureDraft(storage, "Borrador importante");

    await expect(
      resetKnowledge({
        workspaceId,
        confirmation: KNOWLEDGE_RESET_CONFIRMATION,
        storage,
        remoteClient: {
          reset: vi.fn(async () => {
            throw new Error("remote unavailable");
          }),
        },
      }),
    ).rejects.toThrow("remote unavailable");

    await expect(summarizeLocalKnowledge(workspaceId)).resolves.toEqual({
      nodes: 1,
      contexts: 1,
      relations: 1,
    });
    await expect(storage.get("vinema:capture-draft:v1")).resolves.toMatchObject({
      content: "Borrador importante",
    });
  });

  it("clears only workspace knowledge, old outbox records and draft after remote success", async () => {
    const storage = createMemoryStorage();
    const events: unknown[] = [];
    const unsubscribe = subscribeToSyncDataChanged((detail) => {
      events.push(detail);
    });
    await seedKnowledge();
    await seedOtherWorkspaceKnowledge();
    await seedOutbox();
    await seedMetadata();
    await saveCaptureDraft(storage, "Texto en progreso");

    const result = await resetKnowledge({
      workspaceId,
      confirmation: KNOWLEDGE_RESET_CONFIRMATION,
      storage,
      remoteClient: { reset: vi.fn(async () => remoteResponse()) },
    });
    const db = await getVinemaDb();

    expect(result).toMatchObject({
      local: { nodes: 1, contexts: 1, relations: 1 },
      remote: { resetVersion },
    });
    await expect(summarizeLocalKnowledge(workspaceId)).resolves.toEqual({
      nodes: 0,
      contexts: 0,
      relations: 0,
    });
    await expect(db.get(NODES_STORE, otherNodeId)).resolves.toBeDefined();
    await expect(db.get(CONTEXTS_STORE, otherContextId)).resolves.toBeDefined();
    await expect(
      db.get(NODE_CONTEXT_RELATIONS_STORE, otherRelationId),
    ).resolves.toBeDefined();
    await expect(
      db.get(SYNC_MUTATIONS_STORE, "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb"),
    ).resolves.toBeUndefined();
    await expect(
      db.get(SYNC_MUTATIONS_STORE, "cccccccc-cccc-4ccc-8ccc-cccccccccccc"),
    ).resolves.toBeDefined();
    await expect(storage.get("vinema:capture-draft:v1")).resolves.toBeNull();
    await expect(db.get(SYNC_METADATA_STORE, [workspaceId, deviceId])).resolves.toMatchObject({
      pullCursor: resetVersion,
      lastSuccessfulPullAt: resetOccurredAt,
      lastSyncErrorCode: null,
      lastSyncErrorMessage: null,
    });
    await expect(
      db.get(SYNC_METADATA_STORE, [otherWorkspaceId, otherDeviceId]),
    ).resolves.toMatchObject({
      pullCursor: "5",
    });
    expect(events).toEqual([
      {
        workspaceId,
        entityTypes: ["capture", "concept", "captureConcept"],
        changedAt: expect.any(String),
      },
    ]);
    unsubscribe();
  });

  it("blocks concurrent reset attempts in the same runtime", async () => {
    const storage = createMemoryStorage();
    const releaseRemote: { current: (() => void) | null } = { current: null };
    const remoteClient = {
      reset: vi.fn(
        () =>
          new Promise<KnowledgeResetResponse>((resolve) => {
            releaseRemote.current = () => resolve(remoteResponse());
          }),
      ),
    };

    const firstReset = resetKnowledge({
      workspaceId,
      confirmation: KNOWLEDGE_RESET_CONFIRMATION,
      storage,
      remoteClient,
    });
    await waitFor(() => releaseRemote.current !== null);

    await expect(
      resetKnowledge({
        workspaceId,
        confirmation: KNOWLEDGE_RESET_CONFIRMATION,
        storage,
        remoteClient,
      }),
    ).rejects.toMatchObject({ code: "RESET_IN_PROGRESS" });

    releaseRemote.current?.();
    await expect(firstReset).resolves.toMatchObject({
      remote: { resetVersion },
    });
  });

  it("can clear local knowledge idempotently after a remote reset event", async () => {
    const storage = createMemoryStorage();
    await seedKnowledge();

    await expect(
      clearLocalKnowledge({
        workspaceId,
        storage,
        resetVersion,
        occurredAt: resetOccurredAt,
      }),
    ).resolves.toEqual({ nodes: 1, contexts: 1, relations: 1 });
    await expect(
      clearLocalKnowledge({
        workspaceId,
        storage,
        resetVersion,
        occurredAt: resetOccurredAt,
      }),
    ).resolves.toEqual({ nodes: 0, contexts: 0, relations: 0 });
  });
});

function createMemoryStorage(): StorageAdapter {
  const values = new Map<string, unknown>();

  return {
    async get<T>(key: string) {
      return (values.get(key) as T | undefined) ?? null;
    },
    async set<T>(key: string, value: T) {
      values.set(key, value);
    },
    async remove(key: string) {
      values.delete(key);
    },
  };
}

function remoteResponse(): KnowledgeResetResponse {
  return {
    workspaceId,
    resetVersion,
    occurredAt: resetOccurredAt,
    deleted: {
      captures: 1,
      concepts: 1,
      relations: 1,
    },
  };
}

async function seedKnowledge() {
  const db = await getVinemaDb();
  await db.put(NODES_STORE, nodeFixture());
  await db.put(CONTEXTS_STORE, contextFixture());
  await db.put(NODE_CONTEXT_RELATIONS_STORE, relationFixture());
  await db.put(APP_SETTINGS_STORE, { theme: "system" }, "vinema:preference");
}

async function seedOtherWorkspaceKnowledge() {
  const db = await getVinemaDb();
  await db.put(NODES_STORE, nodeFixture({ id: otherNodeId, workspaceId: otherWorkspaceId }));
  await db.put(
    CONTEXTS_STORE,
    contextFixture({ id: otherContextId, workspaceId: otherWorkspaceId }),
  );
  await db.put(
    NODE_CONTEXT_RELATIONS_STORE,
    relationFixture({
      id: otherRelationId,
      workspaceId: otherWorkspaceId,
      nodeId: otherNodeId,
      contextId: otherContextId,
    }),
  );
}

async function seedOutbox() {
  const outbox = new IndexedDbSyncOutboxRepository(() => now);
  await outbox.enqueue({
    workspaceId,
    deviceId,
    mutation: {
      mutationId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
      entityType: "capture",
      operation: "upsert",
      entityId: nodeId,
      baseVersion: null,
      payload: {
        content: "Local pending",
        createdAt: now,
        updatedAt: now,
        archivedAt: null,
      },
    },
  });
  await outbox.enqueue({
    workspaceId: otherWorkspaceId,
    deviceId: otherDeviceId,
    mutation: {
      mutationId: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
      entityType: "capture",
      operation: "upsert",
      entityId: otherNodeId,
      baseVersion: null,
      payload: {
        content: "Other pending",
        createdAt: now,
        updatedAt: now,
        archivedAt: null,
      },
    },
  });
}

async function seedMetadata() {
  const repository = new IndexedDbSyncMetadataRepository(() => now);
  await repository.upsert({
    workspaceId,
    deviceId,
    pullCursor: "1",
    lastSyncErrorCode: "SERVER_ERROR",
    lastSyncErrorMessage: "Fallo previo",
  });
  await repository.upsert({
    workspaceId: otherWorkspaceId,
    deviceId: otherDeviceId,
    pullCursor: "5",
  });
}

function nodeFixture(input: Partial<{
  id: string;
  workspaceId: string;
}> = {}) {
  return {
    id: input.id ?? nodeId,
    workspaceId: input.workspaceId ?? workspaceId,
    type: "NOTE" as const,
    content: "Captura local",
    status: "ACTIVE" as const,
    organizationStatus: "ORGANIZED" as const,
    metadata: {},
    version: 1,
    createdAt: now,
    contentUpdatedAt: now,
    archivedAt: null,
    restoredAt: null,
    updatedAt: now,
    deletedAt: null,
    createdByDeviceId: deviceId,
    lastModifiedByDeviceId: deviceId,
  };
}

function contextFixture(input: Partial<{
  id: string;
  workspaceId: string;
}> = {}) {
  return {
    id: input.id ?? contextId,
    workspaceId: input.workspaceId ?? workspaceId,
    type: "AREA" as const,
    name: "Reuniones",
    description: null,
    version: 1,
    createdAt: now,
    updatedAt: now,
    archivedAt: null,
  };
}

function relationFixture(input: Partial<{
  id: string;
  workspaceId: string;
  nodeId: string;
  contextId: string;
}> = {}) {
  return {
    id: input.id ?? relationId,
    workspaceId: input.workspaceId ?? workspaceId,
    nodeId: input.nodeId ?? nodeId,
    contextId: input.contextId ?? contextId,
    relationType: "CONTEXT" as const,
    version: 1,
    createdAt: now,
  };
}

async function waitFor(condition: () => boolean) {
  for (let index = 0; index < 20; index += 1) {
    if (condition()) {
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 0));
  }

  throw new Error("Condition was not met.");
}
