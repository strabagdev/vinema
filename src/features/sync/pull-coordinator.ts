import type { PullResponse } from "@vinema/sync-contracts";
import {
  SyncClientError,
  type SyncClient,
} from "@/features/sync/sync-client";
import {
  createRemoteChangeApplier,
  type RemoteChangeApplierResult,
  type RemoteChangeApplierTransaction,
} from "@/features/sync/remote-change-applier";
import {
  CONTEXTS_STORE,
  NODE_CONTEXT_RELATIONS_STORE,
  NODES_STORE,
  SYNC_ENTITY_ACKS_STORE,
  SYNC_METADATA_STORE,
  SYNC_MUTATIONS_STORE,
  getVinemaDb,
} from "@/infrastructure/storage/vinema-db";
import type { SyncMetadataRecord } from "@/features/sync/sync-outbox-repository";
import {
  emitSyncDataChanged,
  type SyncDataEntityType,
} from "@/features/sync/sync-data-events";
import { appendMemorySyncEvent } from "@/features/sync/observability/sync-event-buffer";

export const DEFAULT_PULL_BATCH_SIZE = 100;
export const DEFAULT_MAX_PULL_BATCHES_PER_RUN = 10;

export type PullCoordinatorStatus =
  | "SUCCESS"
  | "PARTIAL"
  | "FAILED"
  | "CANCELLED"
  | "SKIPPED_ALREADY_RUNNING";

export type PullCoordinatorResult = {
  status: PullCoordinatorStatus;
  pulled: number;
  applied: number;
  ignored: number;
  idempotent: number;
  conflicts: number;
  batches: number;
  startedAt: string;
  finishedAt: string;
  previousCursor: string;
  nextCursor: string;
  errors: Array<{ code: string; message: string }>;
};

export type PullCoordinator = {
  run(): Promise<PullCoordinatorResult>;
  cancel(): void;
  isRunning(): boolean;
};

export type PullCoordinatorLogger = {
  debug?(message: string, context?: Record<string, unknown>): void;
  info?(message: string, context?: Record<string, unknown>): void;
  warn?(message: string, context?: Record<string, unknown>): void;
  error?(message: string, context?: Record<string, unknown>): void;
};

export type PullCoordinatorRunRegistry = {
  acquire(workspaceId: string): boolean;
  release(workspaceId: string): void;
};

export type PullCoordinatorConfig = {
  pullBatchSize?: number;
  maxPullBatchesPerRun?: number;
};

export type CreatePullCoordinatorInput = {
  workspaceId: string;
  deviceId: string;
  syncClient: Pick<SyncClient, "pull">;
  config?: PullCoordinatorConfig;
  clock?: () => string;
  logger?: PullCoordinatorLogger;
  runRegistry?: PullCoordinatorRunRegistry;
  remoteChangeApplier?: ReturnType<typeof createRemoteChangeApplier>;
};

type NormalizedConfig = Required<PullCoordinatorConfig>;

type RunState = {
  controller: AbortController;
  result: PullCoordinatorResult;
};

const sharedRunRegistry = createPullCoordinatorRunRegistry();

export function createPullCoordinator({
  workspaceId,
  deviceId,
  syncClient,
  config = {},
  clock = () => new Date().toISOString(),
  logger,
  runRegistry = sharedRunRegistry,
  remoteChangeApplier = createRemoteChangeApplier(),
}: CreatePullCoordinatorInput): PullCoordinator {
  assertNonEmpty("workspaceId", workspaceId);
  assertNonEmpty("deviceId", deviceId);
  const normalizedConfig = normalizeConfig(config);
  let state: RunState | null = null;

  return {
    async run() {
      const startedAt = clock();
      if (!runRegistry.acquire(workspaceId)) {
        return emptyResult("SKIPPED_ALREADY_RUNNING", startedAt, startedAt);
      }

      const controller = new AbortController();
      const initialCursor = await readPullCursor(workspaceId, deviceId);
      state = {
        controller,
        result: emptyResult("SUCCESS", startedAt, startedAt, initialCursor),
      };
      logger?.info?.("pull coordinator started", {
        workspaceId,
        cursor: initialCursor,
      });

      try {
        await recordPullAttempt(workspaceId, deviceId, startedAt);
        await processPullBatches({
          workspaceId,
          deviceId,
          syncClient,
          config: normalizedConfig,
          clock,
          logger,
          state,
          remoteChangeApplier,
        });

        state.result.finishedAt = clock();
        state.result.status = finalizeStatus(state.result);
        if (state.result.status === "SUCCESS") {
          await clearPullFailure(workspaceId, deviceId, state.result.finishedAt);
        }

        logger?.info?.("pull coordinator finished", {
          workspaceId,
          status: state.result.status,
          previousCursor: state.result.previousCursor,
          nextCursor: state.result.nextCursor,
          batches: state.result.batches,
          pulled: state.result.pulled,
          applied: state.result.applied,
          conflicts: state.result.conflicts,
        });
        return state.result;
      } catch (error) {
        const finishedAt = clock();
        const status: PullCoordinatorStatus = isAbortedError(error)
          ? "CANCELLED"
          : "FAILED";
        const failed = {
          ...state.result,
          status,
          finishedAt,
          errors: [
            ...state.result.errors,
            { code: errorCode(error), message: errorMessage(error) },
          ],
        };
        await recordPullFailure(
          workspaceId,
          deviceId,
          firstError(failed),
          finishedAt,
        );
        logger?.warn?.("pull coordinator stopped", {
          workspaceId,
          status,
          errorCode: errorCode(error),
        });
        return failed;
      } finally {
        state = null;
        runRegistry.release(workspaceId);
      }
    },

    cancel() {
      state?.controller.abort();
    },

    isRunning() {
      return state !== null;
    },
  };
}

export function createPullCoordinatorRunRegistry(): PullCoordinatorRunRegistry {
  const running = new Set<string>();

  return {
    acquire(workspaceId: string) {
      if (running.has(workspaceId)) {
        return false;
      }

      running.add(workspaceId);
      return true;
    },
    release(workspaceId: string) {
      running.delete(workspaceId);
    },
  };
}

async function processPullBatches(input: {
  workspaceId: string;
  deviceId: string;
  syncClient: Pick<SyncClient, "pull">;
  config: NormalizedConfig;
  clock: () => string;
  logger?: PullCoordinatorLogger;
  state: RunState;
  remoteChangeApplier: ReturnType<typeof createRemoteChangeApplier>;
}) {
  let cursor = input.state.result.previousCursor;

  for (let batchIndex = 0; batchIndex < input.config.maxPullBatchesPerRun; batchIndex += 1) {
    if (input.state.controller.signal.aborted) {
      throw new SyncClientError({
        code: "ABORTED",
        message: "Pull cancelado.",
      });
    }

    const response = await input.syncClient.pull({
      workspaceId: input.workspaceId,
      cursor,
      limit: input.config.pullBatchSize,
      signal: input.state.controller.signal,
    });
    input.logger?.debug?.("pull batch received", {
      workspaceId: input.workspaceId,
      batch: batchIndex + 1,
      previousCursor: cursor,
      nextCursor: response.nextCursor,
      changes: response.changes.length,
    });
    if (response.changes.length > 0) {
      appendMemorySyncEvent({
        type: "PULL_SUCCEEDED",
        workspaceId: input.workspaceId,
        deviceId: input.deviceId,
        count: response.changes.length,
        status: "RECEIVED",
      });
    }

    const applied = await applyBatchAtomically({
      workspaceId: input.workspaceId,
      deviceId: input.deviceId,
      response,
      appliedAt: input.clock(),
      remoteChangeApplier: input.remoteChangeApplier,
    });
    if (applied.applied > 0) {
      appendMemorySyncEvent({
        type: "CHANGE_APPLIED",
        workspaceId: input.workspaceId,
        deviceId: input.deviceId,
        count: applied.applied,
        status: "APPLIED",
      });
      emitSyncDataChanged({
        workspaceId: input.workspaceId,
        entityTypes: collectChangedEntityTypes(response),
        changedAt: input.clock(),
      });
      appendMemorySyncEvent({
        type: "UI_INVALIDATED",
        workspaceId: input.workspaceId,
        deviceId: input.deviceId,
        count: applied.applied,
        status: "INVALIDATED",
      });
    }
    accumulate(input.state.result, response, applied);
    cursor = response.nextCursor;
    input.state.result.nextCursor = cursor;

    if (!response.hasMore) {
      return;
    }
  }
}

function collectChangedEntityTypes(response: PullResponse): SyncDataEntityType[] {
  if (
    response.changes.some(
      (change) => change.entityType === "workspaceKnowledgeReset",
    )
  ) {
    return ["capture", "concept", "captureConcept"];
  }

  return Array.from(
    new Set(
      response.changes.map((change) => change.entityType as SyncDataEntityType),
    ),
  );
}

async function applyBatchAtomically({
  workspaceId,
  deviceId,
  response,
  appliedAt,
  remoteChangeApplier,
}: {
  workspaceId: string;
  deviceId: string;
  response: PullResponse;
  appliedAt: string;
  remoteChangeApplier: ReturnType<typeof createRemoteChangeApplier>;
}) {
  const db = await getVinemaDb();
  const transaction = db.transaction(
    [
      NODES_STORE,
      CONTEXTS_STORE,
      NODE_CONTEXT_RELATIONS_STORE,
      SYNC_ENTITY_ACKS_STORE,
      SYNC_MUTATIONS_STORE,
      SYNC_METADATA_STORE,
    ],
    "readwrite",
  );

  try {
    const result = await remoteChangeApplier.applyChanges({
      transaction: transaction as unknown as RemoteChangeApplierTransaction,
      changes: response.changes,
      workspaceId,
      deviceId,
    });
    await putPullSuccessMetadata({
      store: transaction.objectStore(SYNC_METADATA_STORE),
      workspaceId,
      deviceId,
      cursor: response.nextCursor,
      at: appliedAt,
    });
    await transaction.done;
    return result;
  } catch (error) {
    transaction.abort();
    await transaction.done.catch(() => undefined);
    throw error;
  }
}

async function readPullCursor(workspaceId: string, deviceId: string) {
  const db = await getVinemaDb();
  const metadata = await db.get(SYNC_METADATA_STORE, [workspaceId, deviceId]);
  return metadata?.pullCursor ?? "0";
}

async function recordPullAttempt(
  workspaceId: string,
  deviceId: string,
  at: string,
) {
  const db = await getVinemaDb();
  const transaction = db.transaction(SYNC_METADATA_STORE, "readwrite");
  const store = transaction.store;
  const existing = await store.get([workspaceId, deviceId]);
  await store.put(toMetadataRecord(existing, { workspaceId, deviceId, at }, {
    lastPullAttemptAt: at,
  }));
  await transaction.done;
}

async function clearPullFailure(
  workspaceId: string,
  deviceId: string,
  at: string,
) {
  const db = await getVinemaDb();
  const transaction = db.transaction(SYNC_METADATA_STORE, "readwrite");
  const store = transaction.store;
  const existing = await store.get([workspaceId, deviceId]);
  await store.put(toMetadataRecord(existing, { workspaceId, deviceId, at }, {
    lastSyncErrorCode: null,
    lastSyncErrorMessage: null,
  }));
  await transaction.done;
}

async function recordPullFailure(
  workspaceId: string,
  deviceId: string,
  error: { code: string; message: string },
  at: string,
) {
  const db = await getVinemaDb();
  const transaction = db.transaction(SYNC_METADATA_STORE, "readwrite");
  const store = transaction.store;
  const existing = await store.get([workspaceId, deviceId]);
  await store.put(toMetadataRecord(existing, { workspaceId, deviceId, at }, {
    lastSyncErrorCode: error.code,
    lastSyncErrorMessage: error.message,
  }));
  await transaction.done;
}

async function putPullSuccessMetadata({
  store,
  workspaceId,
  deviceId,
  cursor,
  at,
}: {
  store: {
    get(key: [string, string]): Promise<SyncMetadataRecord | undefined>;
    put(value: SyncMetadataRecord): Promise<unknown>;
  };
  workspaceId: string;
  deviceId: string;
  cursor: string;
  at: string;
}) {
  const existing = await store.get([workspaceId, deviceId]);
  await store.put(toMetadataRecord(existing, { workspaceId, deviceId, at }, {
    pullCursor: cursor,
    lastSuccessfulPullAt: at,
    lastSyncErrorCode: null,
    lastSyncErrorMessage: null,
  }));
}

function toMetadataRecord(
  existing: SyncMetadataRecord | undefined,
  input: { workspaceId: string; deviceId: string; at: string },
  overrides: Partial<SyncMetadataRecord>,
): SyncMetadataRecord {
  return {
    workspaceId: input.workspaceId,
    deviceId: input.deviceId,
    pullCursor: existing?.pullCursor ?? "0",
    lastPullAttemptAt: existing?.lastPullAttemptAt ?? null,
    lastSuccessfulPushAt: existing?.lastSuccessfulPushAt ?? null,
    lastSuccessfulPullAt: existing?.lastSuccessfulPullAt ?? null,
    lastSyncAttemptAt: existing?.lastSyncAttemptAt ?? null,
    lastSyncErrorCode: existing?.lastSyncErrorCode ?? null,
    lastSyncErrorMessage: existing?.lastSyncErrorMessage ?? null,
    createdAt: existing?.createdAt ?? input.at,
    updatedAt: input.at,
    ...overrides,
  };
}

function normalizeConfig(config: PullCoordinatorConfig): NormalizedConfig {
  const normalized = {
    pullBatchSize: config.pullBatchSize ?? DEFAULT_PULL_BATCH_SIZE,
    maxPullBatchesPerRun:
      config.maxPullBatchesPerRun ?? DEFAULT_MAX_PULL_BATCHES_PER_RUN,
  };

  if (!Number.isInteger(normalized.pullBatchSize) || normalized.pullBatchSize <= 0) {
    throw new PullCoordinatorConfigError(
      "INVALID_PULL_BATCH_SIZE",
      "El tamano de lote de pull no es valido.",
    );
  }

  if (
    !Number.isInteger(normalized.maxPullBatchesPerRun) ||
    normalized.maxPullBatchesPerRun <= 0
  ) {
    throw new PullCoordinatorConfigError(
      "INVALID_PULL_BATCH_LIMIT",
      "El limite de lotes de pull no es valido.",
    );
  }

  return normalized;
}

export class PullCoordinatorConfigError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = "PullCoordinatorConfigError";
  }
}

function emptyResult(
  status: PullCoordinatorStatus,
  startedAt: string,
  finishedAt: string,
  cursor = "0",
): PullCoordinatorResult {
  return {
    status,
    pulled: 0,
    applied: 0,
    ignored: 0,
    idempotent: 0,
    conflicts: 0,
    batches: 0,
    startedAt,
    finishedAt,
    previousCursor: cursor,
    nextCursor: cursor,
    errors: [],
  };
}

function accumulate(
  result: PullCoordinatorResult,
  response: PullResponse,
  applied: RemoteChangeApplierResult,
) {
  result.pulled += response.changes.length;
  result.applied += applied.applied;
  result.ignored += applied.ignored;
  result.idempotent += applied.idempotent;
  result.conflicts += applied.conflicts.length;
  result.batches += 1;

  for (const conflict of applied.conflicts) {
    result.errors.push({
      code: "REMOTE_CHANGE_CONFLICT",
      message: `Conflicto remoto para ${conflict.entityType}:${conflict.entityId}.`,
    });
  }
}

function finalizeStatus(result: PullCoordinatorResult): PullCoordinatorStatus {
  return result.conflicts > 0 ? "PARTIAL" : "SUCCESS";
}

function isAbortedError(error: unknown) {
  return error instanceof SyncClientError && error.code === "ABORTED";
}

function errorCode(error: unknown): string {
  if (error instanceof SyncClientError) {
    return error.code;
  }

  if (error instanceof PullCoordinatorConfigError) {
    return error.code;
  }

  if (error && typeof error === "object" && "code" in error) {
    return String(error.code);
  }

  return "UNKNOWN_ERROR";
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Fallo desconocido.";
}

function firstError(result: PullCoordinatorResult) {
  return result.errors[0] ?? { code: result.status, message: result.status };
}

function assertNonEmpty(field: string, value: string) {
  if (!value.trim()) {
    throw new PullCoordinatorConfigError(
      "INVALID_CONFIG",
      `${field} no puede estar vacio.`,
      { field },
    );
  }
}
