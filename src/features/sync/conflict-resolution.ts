import type { CaptureEntity } from "@vinema/sync-contracts";
import {
  NODES_STORE,
  SYNC_ENTITY_ACKS_STORE,
  SYNC_MUTATIONS_STORE,
  getVinemaDb,
} from "@/infrastructure/storage/vinema-db";
import { mapRemoteCaptureToLocalNode } from "@/features/sync/sync-mappers";
import {
  chooseLatestConflictRecord,
  consolidateEntitySyncConflicts,
} from "@/features/sync/conflict-lifecycle";
import type { SyncMutationOutboxRecord } from "@/features/sync/sync-outbox-repository";
import type { SyncEntityAcknowledgementRecord } from "@/features/sync/sync-entity-acknowledgement-repository";

export type CaptureConflictResolutionStrategy =
  | "KEEP_LOCAL"
  | "KEEP_REMOTE"
  | "MERGE_MANUALLY";

export type CaptureConflictSummary = {
  entityId: string;
  localContent: string;
  remoteContent: string;
  localVersion: number | null;
  remoteVersion: number;
  occurrenceCount: number;
};

export async function listCaptureConflicts(
  workspaceId: string,
): Promise<CaptureConflictSummary[]> {
  const db = await getVinemaDb();
  const records = await db.getAllFromIndex(
    SYNC_MUTATIONS_STORE,
    "by-workspace-and-status",
    [workspaceId, "CONFLICT"],
  );
  const groups = consolidateEntitySyncConflicts(
    records.filter((record) => record.mutation.entityType === "capture"),
  ).conflicts;

  return groups.flatMap((group) => {
    const latest = chooseLatestConflictRecord(
      records.filter((record) => group.mutationIds.includes(record.mutationId)),
    );
    const remote = getServerCapture(latest?.conflictData);
    const localContent = getMutationContent(latest);

    if (!latest || !remote || localContent === null) {
      return [];
    }

    return [{
      entityId: group.entityId,
      localContent,
      remoteContent: remote.content,
      localVersion: group.localVersion,
      remoteVersion: remote.version,
      occurrenceCount: group.occurrenceCount,
    }];
  });
}

export async function resolveCaptureConflict(input: {
  workspaceId: string;
  deviceId: string;
  entityId: string;
  strategy: CaptureConflictResolutionStrategy;
  mergedContent?: string;
  now?: string;
}) {
  const now = input.now ?? new Date().toISOString();
  const db = await getVinemaDb();
  const transaction = db.transaction(
    [NODES_STORE, SYNC_MUTATIONS_STORE, SYNC_ENTITY_ACKS_STORE],
    "readwrite",
  );
  const mutationStore = transaction.objectStore(SYNC_MUTATIONS_STORE);
  const records = await mutationStore.index("by-workspace-and-status").getAll([
    input.workspaceId,
    "CONFLICT",
  ]);
  const entityRecords = records.filter(
    (record) =>
      record.mutation.entityType === "capture" &&
      record.mutation.entityId === input.entityId,
  );
  const latest = chooseLatestConflictRecord(entityRecords);
  const remote = getServerCapture(latest?.conflictData);

  if (!latest || !remote || latest.mutation.entityType !== "capture") {
    await transaction.done;
    return { resolved: false, mutationCreated: false };
  }

  const redundantMutationIds = entityRecords
    .filter((record) => record.mutationId !== latest.mutationId)
    .map((record) => record.mutationId);

  for (const mutationId of redundantMutationIds) {
    await mutationStore.delete(mutationId);
  }

  if (input.strategy === "KEEP_REMOTE") {
    const node = mapRemoteCaptureToLocalNode(remote, input.deviceId);
    await transaction.objectStore(NODES_STORE).put(node);
    await transaction.objectStore(SYNC_ENTITY_ACKS_STORE).put({
      workspaceId: input.workspaceId,
      entityType: "capture",
      entityId: input.entityId,
      acknowledgedRemoteVersion: remote.version,
      acknowledgedLocalVersion: remote.version,
      acknowledgedLocalUpdatedAt: remote.updatedAt,
      acknowledgedAt: now,
      generation: null,
      lastChangeId: null,
    } satisfies SyncEntityAcknowledgementRecord);
    await mutationStore.delete(latest.mutationId);
    await transaction.done;
    return { resolved: true, mutationCreated: false };
  }

  const existingNode = await transaction.objectStore(NODES_STORE).get(input.entityId);
  const content =
    input.strategy === "MERGE_MANUALLY"
      ? input.mergedContent?.trim()
      : getMutationContent(latest);

  if (!existingNode || !content) {
    await transaction.done;
    return { resolved: false, mutationCreated: false };
  }

  const nextNode = {
    ...existingNode,
    content,
    version: existingNode.version + 1,
    contentUpdatedAt: now,
    updatedAt: now,
    lastModifiedByDeviceId: input.deviceId,
  };
  await transaction.objectStore(NODES_STORE).put(nextNode);
  await mutationStore.put({
    ...latest,
    localVersion: nextNode.version,
    status: "PENDING",
    updatedAt: now,
    nextAttemptAt: undefined,
    lastErrorCode: undefined,
    lastErrorMessage: undefined,
    conflictData: undefined,
    mutation: {
      mutationId: latest.mutation.mutationId,
      entityType: "capture",
      operation: latest.mutation.operation,
      entityId: latest.mutation.entityId,
      baseVersion: remote.version,
      payload: {
        content,
        createdAt: nextNode.createdAt,
        updatedAt: now,
        archivedAt: nextNode.archivedAt ?? null,
      },
    },
  } satisfies SyncMutationOutboxRecord);
  await transaction.done;
  return { resolved: true, mutationCreated: true };
}

function getMutationContent(record: SyncMutationOutboxRecord | null | undefined) {
  const payload = record?.mutation.payload;
  return payload && "content" in payload && typeof payload.content === "string"
    ? payload.content
    : null;
}

function getServerCapture(conflictData: unknown): CaptureEntity | null {
  if (!conflictData || typeof conflictData !== "object") {
    return null;
  }

  if (!("serverEntity" in conflictData)) {
    return null;
  }

  const entity = conflictData.serverEntity;
  if (
    !entity ||
    typeof entity !== "object" ||
    !("id" in entity) ||
    !("workspaceId" in entity) ||
    !("content" in entity) ||
    !("createdAt" in entity) ||
    !("updatedAt" in entity) ||
    !("version" in entity) ||
    typeof entity.id !== "string" ||
    typeof entity.workspaceId !== "string" ||
    typeof entity.content !== "string" ||
    typeof entity.createdAt !== "string" ||
    typeof entity.updatedAt !== "string" ||
    typeof entity.version !== "number"
  ) {
    return null;
  }

  return {
    id: entity.id,
    workspaceId: entity.workspaceId,
    content: entity.content,
    createdAt: entity.createdAt,
    updatedAt: entity.updatedAt,
    archivedAt:
      "archivedAt" in entity && typeof entity.archivedAt === "string"
        ? entity.archivedAt
        : null,
    version: entity.version,
  };
}
