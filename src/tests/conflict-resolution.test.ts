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
type CaptureMutationPayload = Extract<
  SyncMutationOutboxRecord["mutation"],
  { entityType: "capture" }
>["payload"];

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

  it("lists conflicts with a local-only snapshot when the remote payload was not persisted", async () => {
    const db = await getVinemaDb();
    await db.put(NODES_STORE, node({ content: "Local actual", version: 48 }));
    await db.put(SYNC_MUTATIONS_STORE, conflictRecord({
      mutationId: "44444444-4444-4444-8444-444444444444",
      localContent: "Local actual",
      localVersion: 48,
      conflictData: {
        reason: "REMOTE_CHANGE_CONFLICT",
        remoteChange: {
          sequence: "342",
          entityType: "capture",
          entityId: nodeId,
          version: 26,
        },
      },
    }));

    await expect(listCaptureConflicts(workspaceId)).resolves.toMatchObject([
      {
        entityId: nodeId,
        localContent: "Local actual",
        remoteContent: null,
        localVersion: 48,
        remoteVersion: 26,
        occurrenceCount: 1,
      },
    ]);
  });

  it("loads a remote snapshot from the server when the conflict only has a remote change marker", async () => {
    const db = await getVinemaDb();
    await db.put(NODES_STORE, node({ content: "Local actual", version: 48 }));
    await db.put(SYNC_MUTATIONS_STORE, conflictRecord({
      mutationId: "44444444-4444-4444-8444-444444444444",
      localContent: "Local actual",
      localVersion: 48,
      conflictData: {
        reason: "REMOTE_CHANGE_CONFLICT",
        remoteChange: {
          sequence: "342",
          entityType: "capture",
          entityId: nodeId,
          version: 26,
        },
      },
    }));
    const calls: unknown[] = [];

    await expect(listCaptureConflicts(workspaceId, {
      loadRemoteSnapshot: async (input) => {
        calls.push(input);
        return {
          entityType: "capture",
          entityId: nodeId,
          version: 31,
          content: "Remoto actual",
          archivedAt: null,
          updatedAt: "2026-08-03T13:00:00.000Z",
        };
      },
    })).resolves.toMatchObject([
      {
        entityId: nodeId,
        localContent: "Local actual",
        remoteContent: "Remoto actual",
        localVersion: 48,
        remoteVersion: 31,
        remoteLoadStatus: "LOADED",
      },
    ]);
    expect(calls).toEqual([
      {
        workspaceId,
        entityId: nodeId,
        requestedRemoteVersion: 26,
      },
    ]);

    const records = await db.getAll(SYNC_MUTATIONS_STORE);
    expect(records[0]?.conflictData).toMatchObject({
      remoteChange: { version: 26 },
      serverEntity: {
        id: nodeId,
        content: "Remoto actual",
        version: 31,
      },
    });
    await expect(db.get(NODES_STORE, nodeId)).resolves.toMatchObject({
      content: "Local actual",
      version: 48,
    });
  });

  it("keeps local content using the current remote version loaded from the server", async () => {
    const db = await getVinemaDb();
    await db.put(NODES_STORE, node({ content: "Local actual", version: 48 }));
    await db.put(SYNC_MUTATIONS_STORE, conflictRecord({
      mutationId: "44444444-4444-4444-8444-444444444444",
      localContent: "Local actual",
      localVersion: 48,
      conflictData: {
        reason: "REMOTE_CHANGE_CONFLICT",
        remoteChange: {
          sequence: "342",
          entityType: "capture",
          entityId: nodeId,
          version: 26,
        },
      },
    }));

    await listCaptureConflicts(workspaceId, {
      loadRemoteSnapshot: async () => ({
        entityType: "capture",
        entityId: nodeId,
        version: 31,
        content: "Remoto actual",
        archivedAt: null,
        updatedAt: "2026-08-03T13:00:00.000Z",
      }),
    });

    await expect(resolveCaptureConflict({
      workspaceId,
      deviceId,
      entityId: nodeId,
      strategy: "KEEP_LOCAL",
      now,
    })).resolves.toEqual({ resolved: true, mutationCreated: true });

    await expect(db.getAll(SYNC_MUTATIONS_STORE)).resolves.toMatchObject([
      {
        status: "PENDING",
        mutation: {
          baseVersion: 31,
          payload: { content: "Local actual" },
        },
      },
    ]);
  });

  it("reports remote load failures without resolving or deleting local content", async () => {
    const db = await getVinemaDb();
    await db.put(NODES_STORE, node({ content: "Local actual", version: 48 }));
    await db.put(SYNC_MUTATIONS_STORE, conflictRecord({
      mutationId: "44444444-4444-4444-8444-444444444444",
      localContent: "Local actual",
      localVersion: 48,
      conflictData: {
        reason: "REMOTE_CHANGE_CONFLICT",
        remoteChange: {
          sequence: "342",
          entityType: "capture",
          entityId: nodeId,
          version: 26,
        },
      },
    }));

    await expect(listCaptureConflicts(workspaceId, {
      loadRemoteSnapshot: async () => {
        throw Object.assign(new Error("No encontrada"), {
          status: 404,
          code: "UNKNOWN_ERROR",
        });
      },
    })).resolves.toMatchObject([
      {
        remoteContent: null,
        remoteVersion: 26,
        remoteLoadStatus: "ENTITY_NOT_FOUND",
        remoteLoadDiagnostic: {
          status: 404,
          errorCode: "UNKNOWN_ERROR",
        },
      },
    ]);
    await expect(db.getAll(SYNC_MUTATIONS_STORE)).resolves.toHaveLength(1);
    await expect(db.get(NODES_STORE, nodeId)).resolves.toMatchObject({
      content: "Local actual",
      version: 48,
    });
  });

  it("lists conflicts even when both snapshots are unavailable", async () => {
    const db = await getVinemaDb();
    await db.put(SYNC_MUTATIONS_STORE, conflictRecord({
      mutationId: "44444444-4444-4444-8444-444444444444",
      localContent: null,
      localVersion: 48,
      conflictData: {
        reason: "REMOTE_CHANGE_CONFLICT",
        remoteChange: {
          sequence: "342",
          entityType: "capture",
          entityId: nodeId,
          version: 26,
        },
      },
    }));

    await expect(listCaptureConflicts(workspaceId)).resolves.toMatchObject([
      {
        entityId: nodeId,
        localContent: null,
        remoteContent: null,
        localVersion: 48,
        remoteVersion: 26,
        occurrenceCount: 1,
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
  conflictData = {
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
}: {
  mutationId: string;
  localContent: string | null;
  localVersion: number;
  conflictData?: SyncMutationOutboxRecord["conflictData"];
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
      payload: createMutationPayload(localContent),
    },
    localVersion,
    status: "CONFLICT",
    attemptCount: 1,
    createdAt: now,
    updatedAt: now,
    conflictData,
  };
}

function createMutationPayload(
  localContent: string | null,
): CaptureMutationPayload {
  if (localContent === null) {
    return {
      createdAt: now,
      updatedAt: now,
      archivedAt: null,
    } as CaptureMutationPayload;
  }

  return {
    content: localContent,
    createdAt: now,
    updatedAt: now,
    archivedAt: null,
  };
}
