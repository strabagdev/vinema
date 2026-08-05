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
  localContent: string | null;
  remoteContent: string | null;
  localVersion: number | null;
  remoteVersion: number | null;
  remoteLoadStatus: CaptureRemoteLoadStatus;
  remoteLoadDiagnostic?: CaptureRemoteLoadDiagnostic;
  occurrenceCount: number;
};

export type CaptureRemoteLoadStatus =
  | "LOADED"
  | "MISSING"
  | "ENTITY_NOT_FOUND"
  | "AUTH_ERROR"
  | "NETWORK_ERROR"
  | "ERROR";

export type CaptureRemoteLoadDiagnostic = {
  status?: number;
  errorCode?: string;
  message?: string;
};

export type CaptureRemoteSnapshot = {
  entityType: "capture";
  entityId: string;
  version: number;
  content: string;
  archivedAt: string | null;
  updatedAt: string;
};

export type CaptureRemoteSnapshotLoader = (input: {
  workspaceId: string;
  entityId: string;
  requestedRemoteVersion: number | null;
}) => Promise<CaptureRemoteSnapshot>;

export async function listCaptureConflicts(
  workspaceId: string,
  options: {
    loadRemoteSnapshot?: CaptureRemoteSnapshotLoader;
  } = {},
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

  const summaries: CaptureConflictSummary[] = [];

  for (const group of groups) {
    const latest = chooseLatestConflictRecord(
      records.filter((record) => group.mutationIds.includes(record.mutationId)),
    );
    let remote = getServerCapture(latest?.conflictData);
    let remoteLoadStatus: CaptureRemoteLoadStatus = remote ? "LOADED" : "MISSING";
    let remoteLoadDiagnostic: CaptureRemoteLoadDiagnostic | undefined;
    const requestedRemoteVersion = getRemoteChangeVersion(latest?.conflictData);
    const localContent = getMutationContent(latest);

    if (!latest) {
      continue;
    }

    if (!remote && options.loadRemoteSnapshot) {
      try {
        const loaded = await options.loadRemoteSnapshot({
          workspaceId,
          entityId: group.entityId,
          requestedRemoteVersion,
        });
        remote = toCaptureEntity(workspaceId, latest, loaded);
        remoteLoadStatus = "LOADED";
        await db.put(SYNC_MUTATIONS_STORE, {
          ...latest,
          conflictData: {
            ...(latest.conflictData && typeof latest.conflictData === "object"
              ? latest.conflictData
              : {}),
            serverEntity: remote,
          },
        });
      } catch (error) {
        const loadError = normalizeRemoteLoadError(error);
        remoteLoadStatus = loadError.status;
        remoteLoadDiagnostic = loadError.diagnostic;
      }
    }

    summaries.push({
      entityId: group.entityId,
      localContent,
      remoteContent: remote?.content ?? null,
      localVersion: group.localVersion,
      remoteVersion: remote?.version ?? requestedRemoteVersion,
      remoteLoadStatus,
      remoteLoadDiagnostic,
      occurrenceCount: group.occurrenceCount,
    });
  }

  return summaries;
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

function toCaptureEntity(
  workspaceId: string,
  record: SyncMutationOutboxRecord,
  snapshot: CaptureRemoteSnapshot,
): CaptureEntity {
  const payload = record.mutation.payload;
  const createdAt =
    payload && "createdAt" in payload && typeof payload.createdAt === "string"
      ? payload.createdAt
      : snapshot.updatedAt;

  return {
    id: snapshot.entityId,
    workspaceId,
    content: snapshot.content,
    createdAt,
    updatedAt: snapshot.updatedAt,
    archivedAt: snapshot.archivedAt,
    version: snapshot.version,
  };
}

function normalizeRemoteLoadError(error: unknown): {
  status: CaptureRemoteLoadStatus;
  diagnostic: CaptureRemoteLoadDiagnostic;
} {
  if (error && typeof error === "object") {
    const status = "status" in error && typeof error.status === "number"
      ? error.status
      : undefined;
    const code = "code" in error && typeof error.code === "string"
      ? error.code
      : undefined;
    const message = "message" in error && typeof error.message === "string"
      ? error.message
      : undefined;

    if (status === 404) {
      return {
        status: "ENTITY_NOT_FOUND",
        diagnostic: { status, errorCode: code, message },
      };
    }

    if (status === 401 || status === 403 || code === "AUTH_ERROR") {
      return {
        status: "AUTH_ERROR",
        diagnostic: { status, errorCode: code, message },
      };
    }

    if (code === "NETWORK_ERROR" || code === "TIMEOUT" || code === "ABORTED") {
      return {
        status: "NETWORK_ERROR",
        diagnostic: { status, errorCode: code, message },
      };
    }

    return {
      status: "ERROR",
      diagnostic: { status, errorCode: code, message },
    };
  }

  return {
    status: "ERROR",
    diagnostic: { message: "Unknown remote capture load error." },
  };
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

function getRemoteChangeVersion(conflictData: unknown) {
  if (!conflictData || typeof conflictData !== "object") {
    return null;
  }

  if (!("remoteChange" in conflictData)) {
    return null;
  }

  const remoteChange = conflictData.remoteChange;
  if (
    !remoteChange ||
    typeof remoteChange !== "object" ||
    !("version" in remoteChange) ||
    typeof remoteChange.version !== "number"
  ) {
    return null;
  }

  return remoteChange.version;
}
