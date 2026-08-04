import type { SyncMutationOutboxRecord } from "@/features/sync/sync-outbox-repository";

export type EntityConflictStatus =
  | "REQUIRES_ATTENTION"
  | "RESOLVING"
  | "RESOLVED";

export type EntitySyncConflict = {
  workspaceId: string;
  entityType: SyncMutationOutboxRecord["mutation"]["entityType"];
  entityId: string;
  status: EntityConflictStatus;
  localVersion: number | null;
  remoteVersion: number | null;
  localSnapshot: unknown;
  remoteSnapshot: unknown;
  firstDetectedAt: Date;
  lastDetectedAt: Date;
  mutationIds: string[];
  occurrenceCount: number;
};

export type ConflictConsolidation = {
  conflicts: EntitySyncConflict[];
  keepMutationIds: string[];
  redundantMutationIds: string[];
};

export function createEntityConflictKey(input: {
  workspaceId: string;
  entityType: SyncMutationOutboxRecord["mutation"]["entityType"];
  entityId: string;
}) {
  return `${input.workspaceId}\u0001${input.entityType}\u0001${input.entityId}`;
}

export function hasActiveConflictForMutation(
  conflicts: SyncMutationOutboxRecord[],
  mutation: SyncMutationOutboxRecord["mutation"],
) {
  return conflicts.some(
    (record) =>
      record.status === "CONFLICT" &&
      record.mutation.entityType === mutation.entityType &&
      record.mutation.entityId === mutation.entityId,
  );
}

export function groupEntitySyncConflicts(
  records: SyncMutationOutboxRecord[],
): EntitySyncConflict[] {
  const groups = new Map<string, SyncMutationOutboxRecord[]>();

  for (const record of records) {
    if (record.status !== "CONFLICT") {
      continue;
    }

    const key = createEntityConflictKey({
      workspaceId: record.workspaceId,
      entityType: record.mutation.entityType,
      entityId: record.mutation.entityId,
    });
    groups.set(key, [...(groups.get(key) ?? []), record]);
  }

  return Array.from(groups.values()).map(toEntitySyncConflict);
}

export function countEntitySyncConflicts(records: SyncMutationOutboxRecord[]) {
  return groupEntitySyncConflicts(records).length;
}

export function consolidateEntitySyncConflicts(
  records: SyncMutationOutboxRecord[],
): ConflictConsolidation {
  const conflicts = groupEntitySyncConflicts(records);
  const keepMutationIds = conflicts
    .map((conflict) => conflict.mutationIds.at(-1))
    .filter((mutationId): mutationId is string => Boolean(mutationId));
  const keep = new Set(keepMutationIds);

  return {
    conflicts,
    keepMutationIds,
    redundantMutationIds: records
      .filter((record) => record.status === "CONFLICT" && !keep.has(record.mutationId))
      .map((record) => record.mutationId),
  };
}

export function chooseLatestConflictRecord(
  records: SyncMutationOutboxRecord[],
): SyncMutationOutboxRecord | null {
  return [...records].sort(compareConflictRecords).at(-1) ?? null;
}

function toEntitySyncConflict(records: SyncMutationOutboxRecord[]): EntitySyncConflict {
  const sorted = [...records].sort(compareConflictRecords);
  const first = sorted[0];
  const latest = sorted.at(-1);

  if (!first || !latest) {
    throw new Error("Entity conflict requires at least one mutation.");
  }

  return {
    workspaceId: latest.workspaceId,
    entityType: latest.mutation.entityType,
    entityId: latest.mutation.entityId,
    status: "REQUIRES_ATTENTION",
    localVersion: latest.localVersion ?? null,
    remoteVersion: getRemoteVersion(latest.conflictData),
    localSnapshot: latest.mutation.payload,
    remoteSnapshot: getRemoteSnapshot(latest.conflictData),
    firstDetectedAt: new Date(first.createdAt),
    lastDetectedAt: new Date(latest.updatedAt),
    mutationIds: sorted.map((record) => record.mutationId),
    occurrenceCount: sorted.length,
  };
}

function compareConflictRecords(
  left: SyncMutationOutboxRecord,
  right: SyncMutationOutboxRecord,
) {
  return (
    (left.localVersion ?? 0) - (right.localVersion ?? 0) ||
    left.updatedAt.localeCompare(right.updatedAt) ||
    left.createdAt.localeCompare(right.createdAt) ||
    left.mutationId.localeCompare(right.mutationId)
  );
}

function getRemoteVersion(conflictData: unknown) {
  if (!conflictData || typeof conflictData !== "object") {
    return null;
  }

  if (
    "serverEntity" in conflictData &&
    conflictData.serverEntity &&
    typeof conflictData.serverEntity === "object" &&
    "version" in conflictData.serverEntity &&
    typeof conflictData.serverEntity.version === "number"
  ) {
    return conflictData.serverEntity.version;
  }

  if (
    "remoteChange" in conflictData &&
    conflictData.remoteChange &&
    typeof conflictData.remoteChange === "object" &&
    "version" in conflictData.remoteChange &&
    typeof conflictData.remoteChange.version === "number"
  ) {
    return conflictData.remoteChange.version;
  }

  return null;
}

function getRemoteSnapshot(conflictData: unknown) {
  if (!conflictData || typeof conflictData !== "object") {
    return null;
  }

  if ("serverEntity" in conflictData) {
    return conflictData.serverEntity;
  }

  if ("remoteChange" in conflictData) {
    return conflictData.remoteChange;
  }

  return null;
}
