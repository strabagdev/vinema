import "fake-indexeddb/auto";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { deleteDB } from "idb";
import type { Node } from "@/domain/node/node";
import {
  NODES_STORE,
  SYNC_MUTATIONS_STORE,
  VINEMA_DB_NAME,
  getVinemaDb,
  resetVinemaDbConnectionForTests,
} from "@/infrastructure/storage/vinema-db";
import {
  listCaptureConflicts,
  resolveCaptureConflict,
} from "@/features/sync/conflict-resolution";
import type { SyncMutationOutboxRecord } from "@/features/sync/sync-outbox-repository";

const workspaceId = "11111111-1111-4111-8111-111111111111";
const deviceId = "22222222-2222-4222-8222-222222222222";
const nodeId = "33333333-3333-4333-8333-333333333333";
const now = "2026-08-03T12:00:00.000Z";

describe("conflict resolution", () => {
  beforeEach(async () => {
    await resetVinemaDbConnectionForTests();
    await deleteDB(VINEMA_DB_NAME);
  });

  afterEach(async () => {
    await resetVinemaDbConnectionForTests();
    await deleteDB(VINEMA_DB_NAME);
  });

  it("lists capture conflicts by logical entity", async () => {
    const db = await getVinemaDb();
    await db.put(NODES_STORE, node({ content: "Local actual", version: 57 }));
    await db.put(SYNC_MUTATIONS_STORE, conflictRecord({
      mutationId: "44444444-4444-4444-8444-444444444444",
      localContent: "Local anterior",
      localVersion: 56,
    }));
    await db.put(SYNC_MUTATIONS_STORE, conflictRecord({
      mutationId: "55555555-5555-4555-8555-555555555555",
      localContent: "Local actual",
      localVersion: 57,
    }));

    await expect(listCaptureConflicts(workspaceId)).resolves.toMatchObject([
      {
        entityId: nodeId,
        localContent: "Local actual",
        remoteContent: "Remoto",
        localVersion: 57,
        remoteVersion: 11,
        occurrenceCount: 2,
      },
    ]);
  });

  it("keeping local creates one pending mutation based on the remote version", async () => {
    const db = await getVinemaDb();
    await db.put(NODES_STORE, node({ content: "Local actual", version: 57 }));
    await db.put(SYNC_MUTATIONS_STORE, conflictRecord({
      mutationId: "44444444-4444-4444-8444-444444444444",
      localContent: "Local anterior",
      localVersion: 56,
    }));
    await db.put(SYNC_MUTATIONS_STORE, conflictRecord({
      mutationId: "55555555-5555-4555-8555-555555555555",
      localContent: "Local actual",
      localVersion: 57,
    }));

    await expect(resolveCaptureConflict({
      workspaceId,
      deviceId,
      entityId: nodeId,
      strategy: "KEEP_LOCAL",
      now,
    })).resolves.toEqual({ resolved: true, mutationCreated: true });

    const records = await db.getAll(SYNC_MUTATIONS_STORE);
    expect(records).toHaveLength(1);
    expect(records[0]).toMatchObject({
      mutationId: "55555555-5555-4555-8555-555555555555",
      status: "PENDING",
      mutation: {
        baseVersion: 11,
        payload: { content: "Local actual" },
      },
    });
  });

  it("keeping remote applies the remote capture and clears the conflict", async () => {
    const db = await getVinemaDb();
    await db.put(NODES_STORE, node({ content: "Local actual", version: 57 }));
    await db.put(SYNC_MUTATIONS_STORE, conflictRecord({
      mutationId: "55555555-5555-4555-8555-555555555555",
      localContent: "Local actual",
      localVersion: 57,
    }));

    await expect(resolveCaptureConflict({
      workspaceId,
      deviceId,
      entityId: nodeId,
      strategy: "KEEP_REMOTE",
      now,
    })).resolves.toEqual({ resolved: true, mutationCreated: false });

    await expect(db.getAll(SYNC_MUTATIONS_STORE)).resolves.toEqual([]);
    await expect(db.get(NODES_STORE, nodeId)).resolves.toMatchObject({
      content: "Remoto",
      version: 11,
    });
  });

  it("manual merge creates one pending mutation with the merged content", async () => {
    const db = await getVinemaDb();
    await db.put(NODES_STORE, node({ content: "Local actual", version: 57 }));
    await db.put(SYNC_MUTATIONS_STORE, conflictRecord({
      mutationId: "55555555-5555-4555-8555-555555555555",
      localContent: "Local actual",
      localVersion: 57,
    }));

    await resolveCaptureConflict({
      workspaceId,
      deviceId,
      entityId: nodeId,
      strategy: "MERGE_MANUALLY",
      mergedContent: "Contenido fusionado",
      now,
    });

    await expect(db.getAll(SYNC_MUTATIONS_STORE)).resolves.toMatchObject([
      {
        status: "PENDING",
        mutation: {
          baseVersion: 11,
          payload: { content: "Contenido fusionado" },
        },
      },
    ]);
  });
});

function node(overrides: Partial<Node> = {}): Node {
  return {
    id: nodeId,
    workspaceId,
    type: "NOTE",
    content: "Local",
    status: "ACTIVE",
    organizationStatus: "ORGANIZED",
    metadata: {},
    version: 1,
    createdAt: now,
    updatedAt: now,
    deletedAt: null,
    createdByDeviceId: deviceId,
    lastModifiedByDeviceId: deviceId,
    ...overrides,
  };
}

function conflictRecord({
  mutationId,
  localContent,
  localVersion,
}: {
  mutationId: string;
  localContent: string;
  localVersion: number;
}): SyncMutationOutboxRecord {
  return {
    mutationId,
    workspaceId,
    deviceId,
    mutation: {
      mutationId,
      entityType: "capture",
      operation: "upsert",
      entityId: nodeId,
      baseVersion: localVersion - 1,
      payload: {
        content: localContent,
        createdAt: now,
        updatedAt: now,
        archivedAt: null,
      },
    },
    localVersion,
    status: "CONFLICT",
    attemptCount: 1,
    createdAt: now,
    updatedAt: now,
    conflictData: {
      reason: "VERSION_CONFLICT",
      serverEntity: {
        id: nodeId,
        workspaceId,
        content: "Remoto",
        createdAt: now,
        updatedAt: now,
        archivedAt: null,
        version: 11,
      },
    },
  };
}
