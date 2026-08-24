import "fake-indexeddb/auto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { deleteDB } from "idb";
import type {
  CaptureConceptEntity,
  CaptureEntity,
  ConceptEntity,
  SyncEntityResponse,
  SyncInventoryItem,
  SyncInventoryResponse,
} from "@vinema/sync-contracts";
import {
  reconcileServerAuthoritativeMemory,
} from "@/features/sync/server-authoritative-memory-reconciliation";
import type { ServerAuthoritativeMemorySyncClient } from "@/features/sync/server-authoritative-memory-reconciliation";
import {
  CONTEXTS_STORE,
  NODE_CONTEXT_RELATIONS_STORE,
  NODES_STORE,
  SYNC_METADATA_STORE,
  VINEMA_DB_NAME,
  getVinemaDb,
  resetVinemaDbConnectionForTests,
} from "@/infrastructure/storage/vinema-db";
import { IndexedDbSyncOutboxRepository } from "@/features/sync/sync-outbox-repository";

const workspaceId = "11111111-1111-4111-8111-111111111111";
const otherWorkspaceId = "99999999-9999-4999-8999-999999999999";
const deviceId = "22222222-2222-4222-8222-222222222222";
const recoveredCaptureId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const now = "2026-08-24T12:00:00.000Z";

describe("server-authoritative memory reconciliation", () => {
  beforeEach(async () => {
    await resetVinemaDbConnectionForTests();
    await deleteDB(VINEMA_DB_NAME);
  });

  afterEach(async () => {
    await resetVinemaDbConnectionForTests();
    await deleteDB(VINEMA_DB_NAME);
  });

  it("recovers seven missing captures when the backend has eleven and the client has four", async () => {
    const captures = Array.from({ length: 11 }, (_, index) =>
      captureEntity({
        id: index === 10 ? recoveredCaptureId : uuid(index + 1),
        content: index === 10
          ? "Durante las ultimas semanas me cuesta conciliar el sueno."
          : `Captura remota ${index + 1}`,
      }),
    );
    await seedLocalCaptures(captures.slice(0, 4));
    await setLocalCursor("1057");
    const client = memoryClient(captures.map((entity) => ({
      entityType: "capture" as const,
      entity,
    })), "1057");

    const result = await reconcileServerAuthoritativeMemory({
      workspaceId,
      deviceId,
      syncClient: client,
      pageSize: 3,
    });
    const db = await getVinemaDb();
    const localCaptures = (await db.getAll(NODES_STORE)).filter(
      (node) => node.workspaceId === workspaceId,
    );

    expect(result.status).toBe("REPAIRED");
    expect(result.localCursor).toBe("1057");
    expect(result.remoteCursor).toBe("1057");
    expect(result.remoteCounts.captures.active).toBe(11);
    expect(result.missing.captures.active).toBe(7);
    expect(localCaptures).toHaveLength(11);
    await expect(db.get(NODES_STORE, recoveredCaptureId)).resolves.toMatchObject({
      id: recoveredCaptureId,
      content: "Durante las ultimas semanas me cuesta conciliar el sueno.",
    });
  });

  it("detects a missing capture even when the local cursor already equals the remote cursor", async () => {
    await setLocalCursor("1057");
    const remote = captureEntity({ id: recoveredCaptureId });
    const client = memoryClient([{ entityType: "capture", entity: remote }], "1057");

    const result = await reconcileServerAuthoritativeMemory({
      workspaceId,
      deviceId,
      syncClient: client,
    });

    expect(result.status).toBe("REPAIRED");
    expect(result.missing.captures.active).toBe(1);
    expect(result.localCursor).toBe("1057");
  });

  it("recovers captures, concepts and relations in dependency-safe order", async () => {
    const capture = captureEntity({ id: uuid(1) });
    const concept = conceptEntity({ id: uuid(2), label: "Descanso" });
    const relation = relationEntity({
      id: uuid(3),
      captureId: capture.id,
      conceptId: concept.id,
    });
    const client = memoryClient([
      { entityType: "captureConcept", entity: relation },
      { entityType: "concept", entity: concept },
      { entityType: "capture", entity: capture },
    ]);

    const result = await reconcileServerAuthoritativeMemory({
      workspaceId,
      deviceId,
      syncClient: client,
    });
    const db = await getVinemaDb();

    expect(result.status).toBe("REPAIRED");
    await expect(db.get(NODES_STORE, capture.id)).resolves.toMatchObject({ id: capture.id });
    await expect(db.get(CONTEXTS_STORE, concept.id)).resolves.toMatchObject({
      id: concept.id,
      name: "Descanso",
    });
    await expect(db.get(NODE_CONTEXT_RELATIONS_STORE, relation.id)).resolves.toMatchObject({
      id: relation.id,
      nodeId: capture.id,
      contextId: concept.id,
    });
  });

  it("preserves archived entity state and treats absent archived relations as already satisfied", async () => {
    const archivedAt = "2026-08-24T12:30:00.000Z";
    const capture = captureEntity({ id: uuid(1), archivedAt });
    const relation = relationEntity({
      id: uuid(2),
      captureId: capture.id,
      conceptId: uuid(3),
      archivedAt,
    });
    const client = memoryClient([
      { entityType: "capture", entity: capture },
      { entityType: "captureConcept", entity: relation },
    ]);

    const result = await reconcileServerAuthoritativeMemory({
      workspaceId,
      deviceId,
      syncClient: client,
    });
    const db = await getVinemaDb();

    expect(result.status).toBe("REPAIRED");
    await expect(db.get(NODES_STORE, capture.id)).resolves.toMatchObject({
      archivedAt,
    });
    await expect(db.get(NODE_CONTEXT_RELATIONS_STORE, relation.id)).resolves.toBeUndefined();
  });

  it("does not declare success when a relation dependency cannot be recovered", async () => {
    const relation = relationEntity({
      id: uuid(1),
      captureId: uuid(2),
      conceptId: uuid(3),
    });
    const client = memoryClient([{ entityType: "captureConcept", entity: relation }]);

    const result = await reconcileServerAuthoritativeMemory({
      workspaceId,
      deviceId,
      syncClient: {
        ...client,
        getEntity: vi.fn(async (input) => {
          if (input.entityType === "captureConcept") {
            return { entityType: "captureConcept" as const, entity: relation };
          }
          throw new Error("missing dependency");
        }),
      },
    });

    expect(result.status).toBe("INCOMPLETE");
    expect(result.errors[0]).toMatchObject({ code: "REMOTE_ENTITY_UNAVAILABLE" });
  });

  it("does not overwrite an entity with a pending local mutation", async () => {
    const capture = captureEntity({ id: uuid(1), content: "Remote v2", version: 2 });
    await seedLocalCaptures([captureEntity({ id: capture.id, content: "Local v1", version: 1 })]);
    await new IndexedDbSyncOutboxRepository(() => now).enqueue({
      workspaceId,
      deviceId,
      mutation: {
        mutationId: uuid(90),
        entityType: "capture",
        operation: "upsert",
        entityId: capture.id,
        baseVersion: 1,
        payload: {
          content: "Local pending",
          createdAt: now,
          updatedAt: now,
          archivedAt: null,
        },
      },
    });
    const client = memoryClient([{ entityType: "capture", entity: capture }]);

    const result = await reconcileServerAuthoritativeMemory({
      workspaceId,
      deviceId,
      syncClient: client,
    });
    const db = await getVinemaDb();

    expect(result.status).toBe("INCOMPLETE");
    expect(result.blockedByLocalMutations).toBe(1);
    await expect(db.get(NODES_STORE, capture.id)).resolves.toMatchObject({
      content: "Local v1",
      version: 1,
    });
  });

  it("reports local entities absent from the remote inventory without deleting them", async () => {
    const localOnly = captureEntity({ id: uuid(1), content: "Local only" });
    await seedLocalCaptures([localOnly]);
    const client = memoryClient([]);

    const result = await reconcileServerAuthoritativeMemory({
      workspaceId,
      deviceId,
      syncClient: client,
    });
    const db = await getVinemaDb();

    expect(result.status).toBe("INCOMPLETE");
    expect(result.extraLocal.captures.active).toBe(1);
    expect(result.errors[0]).toMatchObject({
      code: "LOCAL_ENTITY_NOT_IN_REMOTE_INVENTORY",
    });
    await expect(db.get(NODES_STORE, localOnly.id)).resolves.toMatchObject({
      content: "Local only",
    });
  });

  it("aborts when inventory pages do not belong to the same remote cursor", async () => {
    const first = captureEntity({ id: uuid(1) });
    const second = captureEntity({ id: uuid(2) });
    const client = memoryClient([{
      entityType: "capture",
      entity: first,
    }, {
      entityType: "capture",
      entity: second,
    }]);
    vi.mocked(client.inventory)
      .mockResolvedValueOnce({
        items: [toInventoryItem({ entityType: "capture", entity: first })],
        nextCursor: "1",
        hasMore: true,
        remoteCursor: "10",
        counts: countInventory([
          toInventoryItem({ entityType: "capture", entity: first }),
          toInventoryItem({ entityType: "capture", entity: second }),
        ]),
      })
      .mockResolvedValueOnce({
        items: [toInventoryItem({ entityType: "capture", entity: second })],
        nextCursor: "2",
        hasMore: false,
        remoteCursor: "11",
        counts: countInventory([
          toInventoryItem({ entityType: "capture", entity: first }),
          toInventoryItem({ entityType: "capture", entity: second }),
        ]),
      });

    await expect(
      reconcileServerAuthoritativeMemory({
        workspaceId,
        deviceId,
        syncClient: client,
        pageSize: 1,
      }),
    ).rejects.toThrow("cambio durante la paginacion");
  });

  it("aborts on duplicate inventory entities instead of mixing pages", async () => {
    const capture = captureEntity({ id: uuid(1) });
    const item = toInventoryItem({ entityType: "capture", entity: capture });
    const client = memoryClient([{ entityType: "capture", entity: capture }]);
    vi.mocked(client.inventory)
      .mockResolvedValueOnce({
        items: [item],
        nextCursor: "1",
        hasMore: true,
        remoteCursor: "10",
        counts: countInventory([item]),
      })
      .mockResolvedValueOnce({
        items: [item],
        nextCursor: "2",
        hasMore: false,
        remoteCursor: "10",
        counts: countInventory([item]),
      });

    await expect(
      reconcileServerAuthoritativeMemory({
        workspaceId,
        deviceId,
        syncClient: client,
        pageSize: 1,
      }),
    ).rejects.toThrow("duplicadas");
  });

  it("is idempotent after a successful repair", async () => {
    const capture = captureEntity({ id: uuid(1) });
    const client = memoryClient([{ entityType: "capture", entity: capture }]);

    const first = await reconcileServerAuthoritativeMemory({
      workspaceId,
      deviceId,
      syncClient: client,
    });
    const second = await reconcileServerAuthoritativeMemory({
      workspaceId,
      deviceId,
      syncClient: client,
    });

    expect(first.status).toBe("REPAIRED");
    expect(second.status).toBe("COMPLETE");
    expect(second.missing.captures.total).toBe(0);
  });

  it("rejects inventory pages that contain another workspace", async () => {
    const capture = captureEntity({ id: uuid(1), workspaceId: otherWorkspaceId });
    const client = memoryClient([{ entityType: "capture", entity: capture }]);

    await expect(
      reconcileServerAuthoritativeMemory({ workspaceId, deviceId, syncClient: client }),
    ).rejects.toThrow("otro workspace");
  });
});

function memoryClient(
  entities: SyncEntityResponse[],
  remoteCursor = "42",
): ServerAuthoritativeMemorySyncClient {
  const byKey = new Map(
    entities.map((entity) => [`${entity.entityType}:${entity.entity.id}`, entity]),
  );
  return {
    inventory: vi.fn(async (input) => {
      const items = entities.map(toInventoryItem)
        .filter((item) => item.workspaceId === workspaceId || item.workspaceId === otherWorkspaceId)
        .sort(compareInventoryItems);
      const offset = Number(input.cursor ?? "0");
      const limit = input.limit ?? 100;
      const page = items.slice(offset, offset + limit);
      const nextCursor = String(offset + page.length);
      return {
        items: page,
        nextCursor,
        hasMore: offset + page.length < items.length,
        remoteCursor,
        counts: countInventory(items),
      } satisfies SyncInventoryResponse;
    }),
    getEntity: vi.fn(async (input) => {
      const entity = byKey.get(`${input.entityType}:${input.entityId}`);
      if (!entity || entity.entity.workspaceId !== input.workspaceId) {
        throw new Error("not found");
      }
      return entity;
    }),
  };
}

async function seedLocalCaptures(captures: CaptureEntity[]) {
  const db = await getVinemaDb();
  for (const capture of captures) {
    await db.put(NODES_STORE, {
      id: capture.id,
      workspaceId: capture.workspaceId,
      type: "NOTE",
      content: capture.content,
      status: capture.archivedAt ? "ARCHIVED" : "ACTIVE",
      organizationStatus: "ORGANIZED",
      metadata: {},
      version: capture.version,
      createdAt: capture.createdAt,
      contentUpdatedAt: capture.updatedAt,
      archivedAt: capture.archivedAt,
      restoredAt: null,
      updatedAt: capture.updatedAt,
      deletedAt: null,
      createdByDeviceId: deviceId,
      lastModifiedByDeviceId: deviceId,
    });
  }
}

async function setLocalCursor(cursor: string) {
  const db = await getVinemaDb();
  await db.put(SYNC_METADATA_STORE, {
    workspaceId,
    deviceId,
    pullCursor: cursor,
    lastPullAttemptAt: now,
    lastSuccessfulPushAt: null,
    lastSuccessfulPullAt: now,
    lastSyncAttemptAt: null,
    lastSyncErrorCode: null,
    lastSyncErrorMessage: null,
    lastMemoryVerificationAt: null,
    lastMemoryVerificationStatus: null,
    lastMemoryVerificationError: null,
    createdAt: now,
    updatedAt: now,
  });
}

function captureEntity(input: {
  id: string;
  content?: string;
  workspaceId?: string;
  version?: number;
  archivedAt?: string | null;
}): CaptureEntity {
  return {
    id: input.id,
    workspaceId: input.workspaceId ?? workspaceId,
    content: input.content ?? "Remote capture",
    createdAt: now,
    updatedAt: now,
    archivedAt: input.archivedAt ?? null,
    version: input.version ?? 1,
  };
}

function conceptEntity(input: {
  id: string;
  label: string;
  version?: number;
  archivedAt?: string | null;
}): ConceptEntity {
  return {
    id: input.id,
    workspaceId,
    label: input.label,
    normalizedKey: input.label.toLocaleLowerCase("es"),
    aliases: [],
    normalizedAliases: [],
    createdAt: now,
    updatedAt: now,
    archivedAt: input.archivedAt ?? null,
    mergedIntoId: null,
    version: input.version ?? 1,
  };
}

function relationEntity(input: {
  id: string;
  captureId: string;
  conceptId: string;
  version?: number;
  archivedAt?: string | null;
}): CaptureConceptEntity {
  return {
    id: input.id,
    workspaceId,
    captureId: input.captureId,
    conceptId: input.conceptId,
    source: "USER_CONFIRMED",
    createdAt: now,
    updatedAt: now,
    archivedAt: input.archivedAt ?? null,
    version: input.version ?? 1,
  };
}

function toInventoryItem(entity: SyncEntityResponse): SyncInventoryItem {
  return {
    workspaceId: entity.entity.workspaceId,
    entityType: entity.entityType,
    entityId: entity.entity.id,
    version: entity.entity.version,
    updatedAt: entity.entity.updatedAt,
    archivedAt: entity.entity.archivedAt ?? null,
  };
}

function countInventory(items: SyncInventoryItem[]) {
  return {
    captures: countType(items, "capture"),
    concepts: countType(items, "concept"),
    captureConcepts: countType(items, "captureConcept"),
  };
}

function countType(items: SyncInventoryItem[], entityType: SyncInventoryItem["entityType"]) {
  const scoped = items.filter((item) => item.entityType === entityType);
  const archived = scoped.filter((item) => item.archivedAt !== null).length;
  return {
    active: scoped.length - archived,
    archived,
    total: scoped.length,
  };
}

function compareInventoryItems(left: SyncInventoryItem, right: SyncInventoryItem) {
  const byType = left.entityType.localeCompare(right.entityType);
  return byType === 0 ? left.entityId.localeCompare(right.entityId) : byType;
}

function uuid(index: number) {
  const value = String(index).padStart(12, "0");
  return `00000000-0000-4000-8000-${value}`;
}
