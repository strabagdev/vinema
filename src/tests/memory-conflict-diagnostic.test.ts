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
import { loadMemoryConflictDiagnostic } from "@/features/sync/observability/memory-conflict-diagnostic";
import type { SyncMutationOutboxRecord } from "@/features/sync/sync-outbox-repository";

const workspaceId = "11111111-1111-4111-8111-111111111111";
const deviceId = "22222222-2222-4222-8222-222222222222";
const nodeId = "33333333-3333-4333-8333-333333333333";
const otherNodeId = "44444444-4444-4444-8444-444444444444";
const now = "2026-08-03T12:00:00.000Z";

describe("memory conflict diagnostic", () => {
  beforeEach(async () => {
    await resetVinemaDbConnectionForTests();
    await deleteDB(VINEMA_DB_NAME);
  });

  afterEach(async () => {
    await resetVinemaDbConnectionForTests();
    await deleteDB(VINEMA_DB_NAME);
  });

  it("reads all CONFLICT mutations directly from IndexedDB and groups them by cause", async () => {
    const db = await getVinemaDb();
    await db.put(NODES_STORE, node({ id: nodeId, content: "Memoria local" }));
    await db.put(NODES_STORE, node({ id: otherNodeId, content: "Otra memoria" }));
    await db.put(SYNC_MUTATIONS_STORE, conflictRecord({
      mutationId: "55555555-5555-4555-8555-555555555555",
      entityId: nodeId,
      content: "Memoria local",
      remoteContent: "Memoria remota distinta",
      remoteVersion: 7,
    }));
    await db.put(SYNC_MUTATIONS_STORE, conflictRecord({
      mutationId: "66666666-6666-4666-8666-666666666666",
      entityId: nodeId,
      content: "Memoria local",
      remoteContent: "Memoria remota distinta",
      remoteVersion: 8,
    }));
    await db.put(SYNC_MUTATIONS_STORE, conflictRecord({
      mutationId: "77777777-7777-4777-8777-777777777777",
      entityId: otherNodeId,
      content: "Otra memoria",
      remoteContent: "Otra memoria",
      remoteVersion: 2,
    }));

    const diagnostic = await loadMemoryConflictDiagnostic(workspaceId);

    expect(diagnostic.totalConflicts).toBe(3);
    expect(diagnostic.logicalConflicts).toBe(2);
    expect(diagnostic.distinctMutationIds).toBe(3);
    expect(diagnostic.distinctEntityIds).toBe(2);
    expect(diagnostic.distinctNodeIds).toBe(2);
    expect(diagnostic.groupedByCause).toMatchObject({
      hash: 2,
      version: 1,
    });
    expect(diagnostic.groupedByNodeId[0]).toEqual({ nodeId, count: 2 });
    expect(diagnostic.conflicts).toEqual([
      expect.objectContaining({
        id: "55555555-5555-4555-8555-555555555555",
        entity: "capture",
        entityId: nodeId,
        nodeId,
        mutationId: "55555555-5555-4555-8555-555555555555",
        reason: "VERSION_CONFLICT",
        localVersion: 1,
        remoteVersion: 7,
        conflictType: "hash",
      }),
      expect.objectContaining({
        id: "66666666-6666-4666-8666-666666666666",
        nodeId,
        conflictType: "hash",
      }),
      expect.objectContaining({
        id: "77777777-7777-4777-8777-777777777777",
        nodeId: otherNodeId,
        conflictType: "version",
      }),
    ]);
    expect(diagnostic.conflicts[0]?.localHash).toMatch(/^h[0-9a-f]{8}$/);
    expect(diagnostic.conflicts[0]?.remoteHash).toMatch(/^h[0-9a-f]{8}$/);
    expect(diagnostic.conflicts[0]?.payloadSummary.local).toMatchObject({
      content: {
        length: 13,
        preview: "Memoria local",
      },
    });
  });

  it("represents repeated mutation conflicts as logical entity conflicts", async () => {
    const db = await getVinemaDb();
    await db.put(NODES_STORE, node({ id: nodeId, content: "Memoria local" }));
    await db.put(NODES_STORE, node({ id: otherNodeId, content: "Otra memoria" }));

    for (let index = 0; index < 46; index += 1) {
      await db.put(SYNC_MUTATIONS_STORE, conflictRecord({
        mutationId: uuidFromIndex(index),
        entityId: nodeId,
        content: `Memoria local ${index}`,
        remoteContent: "Memoria remota",
        remoteVersion: 11,
      }));
    }

    for (let index = 46; index < 49; index += 1) {
      await db.put(SYNC_MUTATIONS_STORE, conflictRecord({
        mutationId: uuidFromIndex(index),
        entityId: otherNodeId,
        content: `Otra memoria ${index}`,
        remoteContent: "Otra memoria remota",
        remoteVersion: 3,
      }));
    }

    const diagnostic = await loadMemoryConflictDiagnostic(workspaceId);

    expect(diagnostic.totalConflicts).toBe(49);
    expect(diagnostic.logicalConflicts).toBe(2);
    expect(diagnostic.distinctEntityIds).toBe(2);
    expect(diagnostic.groupedByNodeId).toEqual([
      { nodeId, count: 46 },
      { nodeId: otherNodeId, count: 3 },
    ]);
  });
});

function node(overrides: Partial<Node>): Node {
  return {
    id: nodeId,
    workspaceId,
    type: "NOTE",
    content: "Memoria local",
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

function uuidFromIndex(index: number) {
  return `99999999-9999-4999-8999-${String(index).padStart(12, "0")}`;
}

function conflictRecord({
  mutationId,
  entityId,
  content,
  remoteContent,
  remoteVersion,
}: {
  mutationId: string;
  entityId: string;
  content: string;
  remoteContent: string;
  remoteVersion: number;
}): SyncMutationOutboxRecord {
  return {
    mutationId,
    workspaceId,
    deviceId,
    mutation: {
      mutationId,
      entityType: "capture",
      operation: "upsert",
      entityId,
      baseVersion: 1,
      payload: {
        content,
        createdAt: now,
        updatedAt: now,
        archivedAt: null,
      },
    },
    localVersion: 1,
    status: "CONFLICT",
    attemptCount: 1,
    createdAt: now,
    updatedAt: now,
    conflictData: {
      reason: "VERSION_CONFLICT",
      serverEntity: {
        id: entityId,
        workspaceId,
        content: remoteContent,
        createdAt: now,
        updatedAt: now,
        archivedAt: null,
        version: remoteVersion,
      },
    },
  };
}
