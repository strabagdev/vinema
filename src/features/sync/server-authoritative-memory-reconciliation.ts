import type {
  SyncEntityResponse,
  SyncInventoryCounts,
  SyncInventoryItem,
  SyncInventoryResponse,
} from "@vinema/sync-contracts";
import type { Node } from "@/domain/node/node";
import type { Context } from "@/domain/context/context";
import type { NodeContextRelation } from "@/domain/context/node-context-relation";
import {
  CONTEXTS_STORE,
  NODE_CONTEXT_RELATIONS_STORE,
  NODES_STORE,
  SYNC_ENTITY_ACKS_STORE,
  SYNC_METADATA_STORE,
  SYNC_MUTATIONS_STORE,
  getVinemaDb,
} from "@/infrastructure/storage/vinema-db";
import {
  createRemoteChangeApplier,
  type RemoteChangeApplierTransaction,
  type RemoteSyncChange,
} from "@/features/sync/remote-change-applier";
import type { SyncClient } from "@/features/sync/sync-client";
import type { SyncMutationOutboxRecord } from "@/features/sync/sync-outbox-repository";
import { emitSyncDataChanged } from "@/features/sync/sync-data-events";
import type { SyncDataEntityType } from "@/features/sync/sync-data-events";

export const DEFAULT_MEMORY_INVENTORY_PAGE_SIZE = 100;

export type ServerAuthoritativeMemoryStatus =
  | "COMPLETE"
  | "REPAIRED"
  | "INCOMPLETE";

export type ServerAuthoritativeMemoryReconciliationResult = {
  status: ServerAuthoritativeMemoryStatus;
  remoteCursor: string | null;
  localCursor: string | null;
  localCounts: MemoryInventoryCounts;
  remoteCounts: MemoryInventoryCounts;
  missing: MemoryInventoryCounts;
  outdated: MemoryInventoryCounts;
  extraLocal: MemoryInventoryCounts;
  recovered: MemoryInventoryCounts;
  blockedByLocalMutations: number;
  conflicts: number;
  errors: Array<{ code: string; message: string }>;
};

export type MemoryInventoryCounts = {
  captures: { active: number; archived: number; total: number };
  concepts: { active: number; archived: number; total: number };
  captureConcepts: { active: number; archived: number; total: number };
};

export type ServerAuthoritativeMemorySyncClient = Pick<
  SyncClient,
  "inventory" | "getEntity"
>;

export async function reconcileServerAuthoritativeMemory({
  workspaceId,
  deviceId,
  syncClient,
  pageSize = DEFAULT_MEMORY_INVENTORY_PAGE_SIZE,
}: {
  workspaceId: string;
  deviceId: string;
  syncClient: ServerAuthoritativeMemorySyncClient;
  pageSize?: number;
}): Promise<ServerAuthoritativeMemoryReconciliationResult> {
  const remote = await loadRemoteInventory({ workspaceId, syncClient, pageSize });
  const db = await getVinemaDb();
  const [nodes, contexts, relations, mutations] = await Promise.all([
    db.getAll(NODES_STORE),
    db.getAll(CONTEXTS_STORE),
    db.getAll(NODE_CONTEXT_RELATIONS_STORE),
    db.getAll(SYNC_MUTATIONS_STORE),
  ]);
  const localInventory = createLocalInventory({
    workspaceId,
    nodes,
    contexts,
    relations,
  });
  const pending = collectPendingLocalEntityKeys(workspaceId, mutations);
  const plan = createRepairPlan({
    remoteItems: remote.items,
    localItems: localInventory.items,
    pending,
  });
  const extraLocal = countExtraLocalItems({
    remoteItems: remote.items,
    localItems: localInventory.items,
  });

  if (hasAny(extraLocal)) {
    return incompleteResult({
      remoteCursor: remote.remoteCursor,
      localCursor: await readLocalCursor(workspaceId, deviceId),
      localCounts: localInventory.counts,
      remoteCounts: normalizeCounts(remote.counts),
      missing: plan.missing,
      outdated: plan.outdated,
      extraLocal,
      blockedByLocalMutations: plan.blockedByLocalMutations.length,
      conflicts: 0,
      error: {
        code: "LOCAL_ENTITY_NOT_IN_REMOTE_INVENTORY",
        message: "La memoria local contiene entidades que no existen en el inventario remoto.",
      },
    });
  }

  if (plan.blockedByLocalMutations.length > 0) {
    return incompleteResult({
      remoteCursor: remote.remoteCursor,
      localCursor: await readLocalCursor(workspaceId, deviceId),
      localCounts: localInventory.counts,
      remoteCounts: normalizeCounts(remote.counts),
      missing: plan.missing,
      outdated: plan.outdated,
      extraLocal,
      blockedByLocalMutations: plan.blockedByLocalMutations.length,
      conflicts: 0,
      error: {
        code: "LOCAL_MUTATION_PENDING",
        message: "Hay cambios locales pendientes sobre entidades remotas faltantes o desactualizadas.",
      },
    });
  }

  if (plan.itemsToRecover.length === 0) {
    return {
      status: "COMPLETE",
      remoteCursor: remote.remoteCursor,
      localCursor: await readLocalCursor(workspaceId, deviceId),
      localCounts: localInventory.counts,
      remoteCounts: normalizeCounts(remote.counts),
      missing: emptyCounts(),
      outdated: emptyCounts(),
      extraLocal,
      recovered: emptyCounts(),
      blockedByLocalMutations: 0,
      conflicts: 0,
      errors: [],
    };
  }

  const fetched = await fetchRepairEntities({
    workspaceId,
    syncClient,
    items: plan.itemsToRecover,
    localItems: localInventory.items,
    pending,
  });

  if (fetched.errors.length > 0) {
    return incompleteResult({
      remoteCursor: remote.remoteCursor,
      localCursor: await readLocalCursor(workspaceId, deviceId),
      localCounts: localInventory.counts,
      remoteCounts: normalizeCounts(remote.counts),
      missing: plan.missing,
      outdated: plan.outdated,
      extraLocal,
      blockedByLocalMutations: 0,
      conflicts: 0,
      error: fetched.errors[0],
    });
  }

  const applied = await applyFetchedEntities({
    workspaceId,
    deviceId,
    entities: fetched.entities,
  });
  const refreshedLocal = createLocalInventory({
    workspaceId,
    nodes: await db.getAll(NODES_STORE),
    contexts: await db.getAll(CONTEXTS_STORE),
    relations: await db.getAll(NODE_CONTEXT_RELATIONS_STORE),
  });
  const remaining = createRepairPlan({
    remoteItems: remote.items,
    localItems: refreshedLocal.items,
    pending,
  });

  if (remaining.itemsToRecover.length > 0 || applied.conflicts > 0) {
    return incompleteResult({
      remoteCursor: remote.remoteCursor,
      localCursor: await readLocalCursor(workspaceId, deviceId),
      localCounts: refreshedLocal.counts,
      remoteCounts: normalizeCounts(remote.counts),
      missing: remaining.missing,
      outdated: remaining.outdated,
      extraLocal: countExtraLocalItems({
        remoteItems: remote.items,
        localItems: refreshedLocal.items,
      }),
      blockedByLocalMutations: remaining.blockedByLocalMutations.length,
      conflicts: applied.conflicts,
      error: {
        code: "INVENTORY_REPAIR_INCOMPLETE",
        message: "No fue posible completar la memoria local frente al inventario remoto.",
      },
    });
  }

  if (applied.changedEntityTypes.length > 0) {
    emitSyncDataChanged({
      workspaceId,
      entityTypes: applied.changedEntityTypes,
      changedAt: new Date().toISOString(),
    });
  }

  return {
    status: "REPAIRED",
    remoteCursor: remote.remoteCursor,
    localCursor: await readLocalCursor(workspaceId, deviceId),
    localCounts: refreshedLocal.counts,
    remoteCounts: normalizeCounts(remote.counts),
    missing: plan.missing,
    outdated: plan.outdated,
    extraLocal,
    recovered: countItems(fetched.entities.map((entity) => ({
      workspaceId,
      entityType: entity.entityType,
      entityId: entity.entity.id,
      version: entity.entity.version,
      updatedAt: entity.entity.updatedAt,
      archivedAt: entity.entity.archivedAt ?? null,
    }))),
    blockedByLocalMutations: 0,
    conflicts: 0,
    errors: [],
  };
}

async function loadRemoteInventory({
  workspaceId,
  syncClient,
  pageSize,
}: {
  workspaceId: string;
  syncClient: ServerAuthoritativeMemorySyncClient;
  pageSize: number;
}) {
  const items: SyncInventoryItem[] = [];
  let cursor = "0";
  let remoteCursor: string | null = null;
  let counts: SyncInventoryCounts | null = null;
  const seenCursors = new Set<string>();
  const seenItems = new Set<string>();

  for (;;) {
    if (seenCursors.has(cursor)) {
      throw new Error("El inventario remoto repitio un cursor de paginacion.");
    }

    seenCursors.add(cursor);
    const page = await syncClient.inventory({
      workspaceId,
      cursor,
      limit: pageSize,
    });
    assertInventoryPage(page, workspaceId);
    if (remoteCursor !== null && page.remoteCursor !== remoteCursor) {
      throw new Error("El inventario remoto cambio durante la paginacion.");
    }

    if (page.hasMore && page.nextCursor === cursor) {
      throw new Error("El inventario remoto no avanzo el cursor de paginacion.");
    }

    for (const item of page.items) {
      const key = keyOf(item.entityType, item.entityId);
      if (seenItems.has(key)) {
        throw new Error("El inventario remoto devolvio entidades duplicadas.");
      }

      seenItems.add(key);
    }

    items.push(...page.items);
    remoteCursor = page.remoteCursor;
    counts = page.counts;

    if (!page.hasMore) {
      break;
    }

    cursor = page.nextCursor;
  }

  return {
    items,
    remoteCursor,
    counts: normalizeCounts(counts),
  };
}

function countExtraLocalItems({
  remoteItems,
  localItems,
}: {
  remoteItems: SyncInventoryItem[];
  localItems: Map<string, SyncInventoryItem>;
}) {
  const remoteKeys = new Set(
    remoteItems.map((item) => keyOf(item.entityType, item.entityId)),
  );
  const extra = emptyCounts();

  for (const [key, local] of localItems) {
    if (!remoteKeys.has(key)) {
      increment(extra, local);
    }
  }

  return extra;
}

function hasAny(counts: MemoryInventoryCounts) {
  return counts.captures.total > 0 ||
    counts.concepts.total > 0 ||
    counts.captureConcepts.total > 0;
}

function assertInventoryPage(page: SyncInventoryResponse, workspaceId: string) {
  for (const item of page.items) {
    if (item.workspaceId !== workspaceId) {
      throw new Error("El inventario remoto contiene entidades de otro workspace.");
    }
  }
}

function createLocalInventory({
  workspaceId,
  nodes,
  contexts,
  relations,
}: {
  workspaceId: string;
  nodes: Node[];
  contexts: Context[];
  relations: NodeContextRelation[];
}) {
  const items = new Map<string, SyncInventoryItem>();

  for (const node of nodes) {
    if (node.workspaceId !== workspaceId) {
      continue;
    }

    items.set(keyOf("capture", node.id), {
      workspaceId,
      entityType: "capture",
      entityId: node.id,
      version: node.version,
      updatedAt: node.updatedAt,
      archivedAt: node.archivedAt ?? null,
    });
  }

  for (const context of contexts) {
    if (context.workspaceId !== workspaceId) {
      continue;
    }

    items.set(keyOf("concept", context.id), {
      workspaceId,
      entityType: "concept",
      entityId: context.id,
      version: context.version,
      updatedAt: context.updatedAt,
      archivedAt: context.archivedAt ?? null,
    });
  }

  for (const relation of relations) {
    if (relation.workspaceId !== workspaceId) {
      continue;
    }

    items.set(keyOf("captureConcept", relation.id), {
      workspaceId,
      entityType: "captureConcept",
      entityId: relation.id,
      version: relation.version,
      updatedAt: relation.createdAt,
      archivedAt: null,
    });
  }

  return {
    items,
    counts: countItems(Array.from(items.values())),
  };
}

function createRepairPlan({
  remoteItems,
  localItems,
  pending,
}: {
  remoteItems: SyncInventoryItem[];
  localItems: Map<string, SyncInventoryItem>;
  pending: Set<string>;
}) {
  const itemsToRecover: SyncInventoryItem[] = [];
  const blockedByLocalMutations: SyncInventoryItem[] = [];
  const missing = emptyCounts();
  const outdated = emptyCounts();

  for (const remote of remoteItems) {
    if (remote.entityType === "captureConcept" && remote.archivedAt !== null) {
      const localArchivedRelation = localItems.get(keyOf(remote.entityType, remote.entityId));
      if (!localArchivedRelation) {
        continue;
      }
    }

    const local = localItems.get(keyOf(remote.entityType, remote.entityId));
    const needsRecovery = !local || local.version < remote.version;

    if (!needsRecovery) {
      continue;
    }

    increment(!local ? missing : outdated, remote);
    if (pending.has(keyOf(remote.entityType, remote.entityId))) {
      blockedByLocalMutations.push(remote);
      continue;
    }

    itemsToRecover.push(remote);
  }

  return {
    itemsToRecover,
    blockedByLocalMutations,
    missing,
    outdated,
  };
}

async function fetchRepairEntities({
  workspaceId,
  syncClient,
  items,
  localItems,
  pending,
}: {
  workspaceId: string;
  syncClient: ServerAuthoritativeMemorySyncClient;
  items: SyncInventoryItem[];
  localItems: Map<string, SyncInventoryItem>;
  pending: Set<string>;
}) {
  const entities = new Map<string, SyncEntityResponse>();
  const queue = [...items];
  const seen = new Set<string>();
  const errors: Array<{ code: string; message: string }> = [];

  while (queue.length > 0) {
    const item = queue.shift();
    if (!item) {
      continue;
    }

    const key = keyOf(item.entityType, item.entityId);
    if (seen.has(key)) {
      continue;
    }

    seen.add(key);
    if (pending.has(key)) {
      errors.push({
        code: "LOCAL_MUTATION_PENDING",
        message: "Hay una mutacion local pendiente para una entidad requerida por inventario.",
      });
      continue;
    }

    let entity: SyncEntityResponse;
    try {
      entity = await syncClient.getEntity({
        workspaceId,
        entityType: item.entityType,
        entityId: item.entityId,
      });
    } catch {
      errors.push({
        code: "REMOTE_ENTITY_UNAVAILABLE",
        message: "No fue posible recuperar una entidad faltante del inventario remoto.",
      });
      continue;
    }

    if (
      entity.entity.workspaceId !== workspaceId ||
      entity.entityType !== item.entityType ||
      entity.entity.id !== item.entityId
    ) {
      errors.push({
        code: "INVALID_REMOTE_ENTITY",
        message: "La entidad recuperada no coincide con el inventario remoto.",
      });
      continue;
    }

    entities.set(key, entity);
    if (entity.entityType === "captureConcept" && entity.entity.archivedAt == null) {
      const captureKey = keyOf("capture", entity.entity.captureId);
      const conceptKey = keyOf("concept", entity.entity.conceptId);
      if (!localItems.has(captureKey) && !entities.has(captureKey)) {
        queue.push(toDependencyInventoryItem(entity, "capture", entity.entity.captureId));
      }
      if (!localItems.has(conceptKey) && !entities.has(conceptKey)) {
        queue.push(toDependencyInventoryItem(entity, "concept", entity.entity.conceptId));
      }
    }
  }

  return {
    entities: Array.from(entities.values()),
    errors,
  };
}

function toDependencyInventoryItem(
  relation: Extract<SyncEntityResponse, { entityType: "captureConcept" }>,
  entityType: "capture" | "concept",
  entityId: string,
): SyncInventoryItem {
  return {
    workspaceId: relation.entity.workspaceId,
    entityType,
    entityId,
    version: 1,
    updatedAt: relation.entity.updatedAt,
    archivedAt: null,
  };
}

async function applyFetchedEntities({
  workspaceId,
  deviceId,
  entities,
}: {
  workspaceId: string;
  deviceId: string;
  entities: SyncEntityResponse[];
}) {
  const db = await getVinemaDb();
  const transaction = db.transaction(
    [
      NODES_STORE,
      CONTEXTS_STORE,
      NODE_CONTEXT_RELATIONS_STORE,
      SYNC_ENTITY_ACKS_STORE,
      SYNC_MUTATIONS_STORE,
    ],
    "readwrite",
  );
  const changes = entities.map(toRecoveryChange);
  try {
    const result = await createRemoteChangeApplier().applyChanges({
      transaction: transaction as unknown as RemoteChangeApplierTransaction,
      changes,
      workspaceId,
      deviceId,
    });
    await transaction.done;

    return {
      conflicts: result.conflicts.length,
      changedEntityTypes: result.applied > 0
        ? Array.from(new Set(changes.map((change) => change.entityType)))
          .filter(isSyncDataEntityType)
        : [],
    };
  } catch (error) {
    transaction.abort();
    await transaction.done.catch(() => undefined);
    throw error;
  }
}

function isSyncDataEntityType(value: string): value is SyncDataEntityType {
  return value === "capture" || value === "concept" || value === "captureConcept";
}

function toRecoveryChange(entity: SyncEntityResponse): RemoteSyncChange {
  return {
    sequence: "0",
    entityType: entity.entityType,
    operation: entity.entity.archivedAt ? "archive" : "upsert",
    entity: entity.entity,
  };
}

function collectPendingLocalEntityKeys(
  workspaceId: string,
  mutations: SyncMutationOutboxRecord[],
) {
  const keys = new Set<string>();

  for (const mutation of mutations) {
    if (
      mutation.workspaceId === workspaceId &&
      ["PENDING", "PROCESSING", "FAILED", "CONFLICT"].includes(mutation.status)
    ) {
      keys.add(keyOf(mutation.mutation.entityType, mutation.mutation.entityId));
    }
  }

  return keys;
}

async function readLocalCursor(workspaceId: string, deviceId: string) {
  const db = await getVinemaDb();
  const metadata = await db.get(SYNC_METADATA_STORE, [workspaceId, deviceId]);
  return metadata?.pullCursor ?? null;
}

function countItems(items: SyncInventoryItem[]): MemoryInventoryCounts {
  const counts = emptyCounts();
  for (const item of items) {
    increment(counts, item);
  }
  return counts;
}

function emptyCounts(): MemoryInventoryCounts {
  return {
    captures: { active: 0, archived: 0, total: 0 },
    concepts: { active: 0, archived: 0, total: 0 },
    captureConcepts: { active: 0, archived: 0, total: 0 },
  };
}

function normalizeCounts(counts: SyncInventoryCounts | null): MemoryInventoryCounts {
  return counts ?? emptyCounts();
}

function increment(counts: MemoryInventoryCounts, item: SyncInventoryItem) {
  const bucket = counts[toCountKey(item.entityType)];
  bucket.total += 1;
  if (item.archivedAt) {
    bucket.archived += 1;
  } else {
    bucket.active += 1;
  }
}

function toCountKey(entityType: SyncInventoryItem["entityType"]) {
  return entityType === "capture"
    ? "captures"
    : entityType === "concept"
      ? "concepts"
      : "captureConcepts";
}

function keyOf(entityType: SyncInventoryItem["entityType"], entityId: string) {
  return `${entityType}:${entityId}`;
}

function incompleteResult({
  remoteCursor,
  localCursor,
  localCounts,
  remoteCounts,
  missing,
  outdated,
  extraLocal,
  blockedByLocalMutations,
  conflicts,
  error,
}: {
  remoteCursor: string | null;
  localCursor: string | null;
  localCounts: MemoryInventoryCounts;
  remoteCounts: MemoryInventoryCounts;
  missing: MemoryInventoryCounts;
  outdated: MemoryInventoryCounts;
  extraLocal: MemoryInventoryCounts;
  blockedByLocalMutations: number;
  conflicts: number;
  error: { code: string; message: string };
}): ServerAuthoritativeMemoryReconciliationResult {
  return {
    status: "INCOMPLETE",
    remoteCursor,
    localCursor,
    localCounts,
    remoteCounts,
    missing,
    outdated,
    extraLocal,
    recovered: emptyCounts(),
    blockedByLocalMutations,
    conflicts,
    errors: [error],
  };
}
