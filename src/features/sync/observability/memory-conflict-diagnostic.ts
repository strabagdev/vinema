import type { Context } from "@/domain/context/context";
import type { NodeContextRelation } from "@/domain/context/node-context-relation";
import type { Node } from "@/domain/node/node";
import {
  contextRepository,
  nodeContextRelationRepository,
  nodeRepository,
} from "@/infrastructure/repositories";
import {
  SYNC_MUTATIONS_STORE,
  getVinemaDb,
} from "@/infrastructure/storage/vinema-db";
import type { SyncMutationOutboxRecord } from "@/features/sync/sync-outbox-repository";
import { groupEntitySyncConflicts } from "@/features/sync/conflict-lifecycle";

export type MemoryConflictCause =
  | "version"
  | "hash"
  | "registro inexistente"
  | "duplicado"
  | "otra";

export type MemoryConflictDiagnosticItem = {
  id: string;
  entity: SyncMutationOutboxRecord["mutation"]["entityType"];
  entityId: string;
  nodeId: string | null;
  mutationId: string;
  createdAt: string;
  updatedAt: string;
  reason: string;
  localVersion: number | null;
  remoteVersion: number | null;
  localHash: string | null;
  remoteHash: string | null;
  conflictType: MemoryConflictCause;
  payloadSummary: Record<string, unknown>;
};

export type MemoryConflictDiagnostic = {
  generatedAt: string;
  workspaceId: string;
  totalConflicts: number;
  logicalConflicts: number;
  distinctMutationIds: number;
  distinctEntityIds: number;
  distinctNodeIds: number;
  groupedByCause: Record<MemoryConflictCause, number>;
  groupedByNodeId: Array<{ nodeId: string; count: number }>;
  conflicts: MemoryConflictDiagnosticItem[];
};

export async function loadMemoryConflictDiagnostic(
  workspaceId: string,
): Promise<MemoryConflictDiagnostic> {
  const [conflicts, nodes, contexts, relations] = await Promise.all([
    listConflictMutationsDirectly(workspaceId),
    nodeRepository.listByWorkspace(workspaceId),
    contextRepository.list({ workspaceId, includeArchived: true }),
    nodeContextRelationRepository.listByWorkspace(workspaceId),
  ]);
  const items = conflicts.map((record) =>
    createConflictDiagnosticItem(record, { nodes, contexts, relations }),
  );
  const logicalConflicts = groupEntitySyncConflicts(conflicts);

  return {
    generatedAt: new Date().toISOString(),
    workspaceId,
    totalConflicts: items.length,
    logicalConflicts: logicalConflicts.length,
    distinctMutationIds: new Set(items.map((item) => item.mutationId)).size,
    distinctEntityIds: new Set(items.map((item) => item.entityId)).size,
    distinctNodeIds: new Set(
      items
        .map((item) => item.nodeId)
        .filter((nodeId): nodeId is string => Boolean(nodeId)),
    ).size,
    groupedByCause: groupByCause(items),
    groupedByNodeId: groupByNodeId(items),
    conflicts: items,
  };
}

async function listConflictMutationsDirectly(workspaceId: string) {
  const db = await getVinemaDb();
  const records = await db.getAllFromIndex(
    SYNC_MUTATIONS_STORE,
    "by-workspace-and-status",
    [workspaceId, "CONFLICT"],
  );

  return records.sort((left, right) =>
    left.createdAt.localeCompare(right.createdAt) ||
    left.mutationId.localeCompare(right.mutationId),
  );
}

function createConflictDiagnosticItem(
  record: SyncMutationOutboxRecord,
  local: {
    nodes: Node[];
    contexts: Context[];
    relations: NodeContextRelation[];
  },
): MemoryConflictDiagnosticItem {
  const conflictInfo = getConflictInfo(record.conflictData);
  const localPayload = getLocalComparablePayload(record, local);
  const remotePayload = getRemoteComparablePayload(record.conflictData);
  const nodeId = getConflictNodeId(record, local, remotePayload);

  return {
    id: record.mutationId,
    entity: record.mutation.entityType,
    entityId: record.mutation.entityId,
    nodeId,
    mutationId: record.mutation.mutationId,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
    reason: conflictInfo.reason,
    localVersion: record.localVersion ?? getLocalVersion(record, local),
    remoteVersion: conflictInfo.remoteVersion,
    localHash: localPayload ? hashStable(localPayload) : null,
    remoteHash: remotePayload ? hashStable(remotePayload) : null,
    conflictType: classifyConflict(record, localPayload, remotePayload, conflictInfo),
    payloadSummary: summarizePayload({
      record,
      localPayload,
      remotePayload,
      conflictInfo,
    }),
  };
}

function getConflictInfo(conflictData: unknown) {
  if (!conflictData || typeof conflictData !== "object") {
    return {
      reason: "UNKNOWN",
      remoteVersion: null,
    };
  }

  const reason =
    "reason" in conflictData && typeof conflictData.reason === "string"
      ? conflictData.reason
      : "UNKNOWN";
  const serverEntity =
    "serverEntity" in conflictData && isObject(conflictData.serverEntity)
      ? conflictData.serverEntity
      : null;
  const remoteChange =
    "remoteChange" in conflictData && isObject(conflictData.remoteChange)
      ? conflictData.remoteChange
      : null;

  return {
    reason,
    remoteVersion:
      getNumberProperty(serverEntity, "version") ??
      getNumberProperty(remoteChange, "version"),
  };
}

function getLocalComparablePayload(
  record: SyncMutationOutboxRecord,
  local: {
    nodes: Node[];
    contexts: Context[];
    relations: NodeContextRelation[];
  },
) {
  if (record.mutation.entityType === "capture") {
    const node = local.nodes.find((candidate) => candidate.id === record.mutation.entityId);
    return node
      ? {
        content: node.content,
        archivedAt: node.archivedAt ?? null,
      }
      : null;
  }

  if (record.mutation.entityType === "concept") {
    const context = local.contexts.find(
      (candidate) => candidate.id === record.mutation.entityId,
    );
    return context
      ? {
        label: context.name,
        archivedAt: context.archivedAt ?? null,
        aliases: context.aliases ?? [],
        normalizedAliases: context.normalizedAliases ?? [],
      }
      : null;
  }

  const relation = local.relations.find(
    (candidate) => candidate.id === record.mutation.entityId,
  );

  return relation
    ? {
      captureId: relation.nodeId,
      conceptId: relation.contextId,
      archivedAt: null,
    }
    : null;
}

function getRemoteComparablePayload(conflictData: unknown) {
  if (!conflictData || typeof conflictData !== "object") {
    return null;
  }

  if ("serverEntity" in conflictData && isObject(conflictData.serverEntity)) {
    const entity = conflictData.serverEntity;

    if ("content" in entity) {
      return {
        content: entity.content,
        archivedAt: getNullableStringProperty(entity, "archivedAt"),
      };
    }

    if ("label" in entity) {
      return {
        label: entity.label,
        archivedAt: getNullableStringProperty(entity, "archivedAt"),
        aliases: Array.isArray(entity.aliases) ? entity.aliases : [],
        normalizedAliases: Array.isArray(entity.normalizedAliases)
          ? entity.normalizedAliases
          : [],
      };
    }

    if ("captureId" in entity && "conceptId" in entity) {
      return {
        captureId: entity.captureId,
        conceptId: entity.conceptId,
        archivedAt: getNullableStringProperty(entity, "archivedAt"),
      };
    }
  }

  if ("remoteChange" in conflictData && isObject(conflictData.remoteChange)) {
    return {
      remoteChange: {
        sequence: getStringProperty(conflictData.remoteChange, "sequence"),
        entityType: getStringProperty(conflictData.remoteChange, "entityType"),
        entityId: getStringProperty(conflictData.remoteChange, "entityId"),
        version: getNumberProperty(conflictData.remoteChange, "version"),
      },
    };
  }

  return null;
}

function getConflictNodeId(
  record: SyncMutationOutboxRecord,
  local: {
    nodes: Node[];
    contexts: Context[];
    relations: NodeContextRelation[];
  },
  remotePayload: Record<string, unknown> | null,
) {
  if (record.mutation.entityType === "capture") {
    return record.mutation.entityId;
  }

  if (record.mutation.entityType === "captureConcept") {
    const payload = record.mutation.payload;
    if ("captureId" in payload && typeof payload.captureId === "string") {
      return payload.captureId;
    }

    const relation = local.relations.find(
      (candidate) => candidate.id === record.mutation.entityId,
    );
    if (relation) {
      return relation.nodeId;
    }

    if (remotePayload && typeof remotePayload.captureId === "string") {
      return remotePayload.captureId;
    }
  }

  return null;
}

function getLocalVersion(
  record: SyncMutationOutboxRecord,
  local: {
    nodes: Node[];
    contexts: Context[];
    relations: NodeContextRelation[];
  },
) {
  if (record.mutation.entityType === "capture") {
    return local.nodes.find((node) => node.id === record.mutation.entityId)?.version ?? null;
  }

  if (record.mutation.entityType === "concept") {
    return local.contexts.find((context) => context.id === record.mutation.entityId)?.version ?? null;
  }

  return local.relations.find((relation) => relation.id === record.mutation.entityId)?.version ?? null;
}

function classifyConflict(
  record: SyncMutationOutboxRecord,
  localPayload: Record<string, unknown> | null,
  remotePayload: Record<string, unknown> | null,
  conflictInfo: ReturnType<typeof getConflictInfo>,
): MemoryConflictCause {
  if (!localPayload) {
    return "registro inexistente";
  }

  if (isDuplicateLike(record, conflictInfo.reason)) {
    return "duplicado";
  }

  if (conflictInfo.reason === "VERSION_CONFLICT") {
    if (remotePayload && hashStable(localPayload) !== hashStable(remotePayload)) {
      return "hash";
    }

    return "version";
  }

  if (conflictInfo.reason === "REMOTE_CHANGE_CONFLICT") {
    return "version";
  }

  return "otra";
}

function isDuplicateLike(record: SyncMutationOutboxRecord, reason: string) {
  return (
    reason.toLocaleUpperCase("en").includes("DUPLICATE") ||
    record.lastErrorCode?.toLocaleUpperCase("en").includes("DUPLICATE") ||
    record.lastErrorMessage?.toLocaleUpperCase("en").includes("DUPLICATE")
  );
}

function summarizePayload({
  record,
  localPayload,
  remotePayload,
  conflictInfo,
}: {
  record: SyncMutationOutboxRecord;
  localPayload: Record<string, unknown> | null;
  remotePayload: Record<string, unknown> | null;
  conflictInfo: ReturnType<typeof getConflictInfo>;
}) {
  return {
    operation: record.mutation.operation,
    baseVersion: record.mutation.baseVersion,
    local: summarizeComparablePayload(localPayload),
    remote: summarizeComparablePayload(remotePayload),
    reason: conflictInfo.reason,
  };
}

function summarizeComparablePayload(payload: Record<string, unknown> | null) {
  if (!payload) {
    return null;
  }

  return Object.fromEntries(
    Object.entries(payload).map(([key, value]) => [
      key,
      typeof value === "string" && key.toLocaleLowerCase("en").includes("content")
        ? summarizeText(value)
        : value,
    ]),
  );
}

function summarizeText(value: string) {
  return {
    length: value.length,
    preview: value.slice(0, 80),
  };
}

function groupByCause(items: MemoryConflictDiagnosticItem[]) {
  const result: Record<MemoryConflictCause, number> = {
    version: 0,
    hash: 0,
    "registro inexistente": 0,
    duplicado: 0,
    otra: 0,
  };

  for (const item of items) {
    result[item.conflictType] += 1;
  }

  return result;
}

function groupByNodeId(items: MemoryConflictDiagnosticItem[]) {
  const counts = new Map<string, number>();

  for (const item of items) {
    if (!item.nodeId) {
      continue;
    }

    counts.set(item.nodeId, (counts.get(item.nodeId) ?? 0) + 1);
  }

  return Array.from(counts.entries())
    .map(([nodeId, count]) => ({ nodeId, count }))
    .sort((left, right) => right.count - left.count || left.nodeId.localeCompare(right.nodeId));
}

function hashStable(value: unknown) {
  const input = stableStringify(value);
  let hash = 0x811c9dc5;

  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }

  return `h${(hash >>> 0).toString(16).padStart(8, "0")}`;
}

function stableStringify(value: unknown): string {
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value);
  }

  if (Array.isArray(value)) {
    return `[${value.map((item) => stableStringify(item)).join(",")}]`;
  }

  return `{${Object.entries(value)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, entry]) => `${JSON.stringify(key)}:${stableStringify(entry)}`)
    .join(",")}}`;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function getStringProperty(record: Record<string, unknown>, key: string) {
  return typeof record[key] === "string" ? record[key] : null;
}

function getNumberProperty(record: Record<string, unknown> | null, key: string) {
  return record && typeof record[key] === "number" ? record[key] : null;
}

function getNullableStringProperty(record: Record<string, unknown>, key: string) {
  return record[key] === null || typeof record[key] === "string"
    ? record[key]
    : null;
}
