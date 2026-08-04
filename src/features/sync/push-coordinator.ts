import type { PushResponse } from "@vinema/sync-contracts";
import {
  SyncClientError,
  type SyncClient,
} from "@/features/sync/sync-client";
import {
  SYNC_OUTBOX_MAX_LIST_LIMIT,
  type SyncMutationOutboxRecord,
} from "@/features/sync/sync-outbox-repository";
import { createEntityConflictKey } from "@/features/sync/conflict-lifecycle";
import {
  IndexedDbSyncEntityAcknowledgementRepository,
  createAcknowledgementFromAcceptedMutation,
} from "@/features/sync/sync-entity-acknowledgement-repository";
import { appendMemorySyncEvent } from "@/features/sync/observability/sync-event-buffer";

export const DEFAULT_STALE_PROCESSING_MS = 5 * 60 * 1000;
export const DEFAULT_MAX_ATTEMPTS_PER_RUN = 2;
export const DEFAULT_RETRY_BASE_DELAY_MS = 500;
export const DEFAULT_RETRY_MAX_DELAY_MS = 5_000;

export type PushCoordinatorStatus =
  | "SUCCESS"
  | "PARTIAL"
  | "FAILED"
  | "OFFLINE"
  | "CANCELLED"
  | "SKIPPED_ALREADY_RUNNING";

export type PushCoordinatorError = {
  code: string;
  message: string;
  mutationId?: string;
};

export type PushCoordinatorResult = {
  status: PushCoordinatorStatus;
  pushed: number;
  failed: number;
  conflicts: number;
  deferred: number;
  removedFromOutbox: number;
  startedAt: string;
  finishedAt: string;
  errors: PushCoordinatorError[];
};

export type PushCoordinator = {
  run(): Promise<PushCoordinatorResult>;
  cancel(): void;
  isRunning(): boolean;
};

export type PushCoordinatorLogger = {
  debug?(message: string, context?: Record<string, unknown>): void;
  info?(message: string, context?: Record<string, unknown>): void;
  warn?(message: string, context?: Record<string, unknown>): void;
  error?(message: string, context?: Record<string, unknown>): void;
};

export type PushCoordinatorOutboxRepository = {
  listPending(
    workspaceId: string,
    limit: number,
  ): Promise<SyncMutationOutboxRecord[]>;
  listAllConflicts?(workspaceId: string): Promise<SyncMutationOutboxRecord[]>;
  listConflicts?(
    workspaceId: string,
    limit: number,
  ): Promise<SyncMutationOutboxRecord[]>;
  markProcessing(mutationIds: string[]): Promise<SyncMutationOutboxRecord[]>;
  markPending(
    mutationIds: string[],
    input?: { nextAttemptAt?: string },
  ): Promise<SyncMutationOutboxRecord[]>;
  markFailed(
    mutationId: string,
    error: { code: string; message: string; nextAttemptAt?: string },
  ): Promise<SyncMutationOutboxRecord>;
  markConflict(
    mutationId: string,
    conflictData: unknown,
  ): Promise<SyncMutationOutboxRecord>;
  remove(mutationIds: string[]): Promise<void>;
  resetStaleProcessing(cutoff: string): Promise<SyncMutationOutboxRecord[]>;
};

export type PushCoordinatorMetadataRepository = {
  recordSyncAttempt(
    workspaceId: string,
    deviceId: string,
    at: string,
  ): Promise<unknown>;
  recordPushSuccess(
    workspaceId: string,
    deviceId: string,
    at: string,
  ): Promise<unknown>;
  recordFailure(
    workspaceId: string,
    deviceId: string,
    error: { code: string; message: string },
    at: string,
  ): Promise<unknown>;
  clearFailure(workspaceId: string, deviceId: string): Promise<unknown>;
};

export type PushCoordinatorAcknowledgementRepository = {
  recordMany(
    records: Parameters<IndexedDbSyncEntityAcknowledgementRepository["recordMany"]>[0],
  ): Promise<unknown>;
};

export type PushCoordinatorRunRegistry = {
  acquire(workspaceId: string): boolean;
  release(workspaceId: string): void;
};

export type PushCoordinatorConfig = {
  batchSize?: number;
  staleProcessingMs?: number;
  maxAttemptsPerRun?: number;
  retryBaseDelayMs?: number;
  retryMaxDelayMs?: number;
};

export type CreatePushCoordinatorInput = {
  workspaceId: string;
  deviceId: string;
  syncClient: Pick<SyncClient, "push">;
  outboxRepository: PushCoordinatorOutboxRepository;
  metadataRepository: PushCoordinatorMetadataRepository;
  acknowledgementRepository?: PushCoordinatorAcknowledgementRepository;
  config?: PushCoordinatorConfig;
  clock?: () => string;
  sleep?: (ms: number, signal: AbortSignal) => Promise<void>;
  logger?: PushCoordinatorLogger;
  runRegistry?: PushCoordinatorRunRegistry;
};

type NormalizedConfig = Required<PushCoordinatorConfig>;

type RunState = {
  result: PushCoordinatorResult;
  controller: AbortController;
  processingIds: string[];
  attemptedIds: Set<string>;
  deferredIds: Set<string>;
};

const sharedRunRegistry = createPushCoordinatorRunRegistry();

export function createPushCoordinator({
  workspaceId,
  deviceId,
  syncClient,
  outboxRepository,
  metadataRepository,
  acknowledgementRepository = new IndexedDbSyncEntityAcknowledgementRepository(),
  config = {},
  clock = () => new Date().toISOString(),
  sleep = sleepWithAbort,
  logger,
  runRegistry = sharedRunRegistry,
}: CreatePushCoordinatorInput): PushCoordinator {
  assertNonEmpty("workspaceId", workspaceId);
  assertNonEmpty("deviceId", deviceId);
  const normalizedConfig = normalizeConfig(config);
  let state: RunState | null = null;

  return {
    async run() {
      const startedAt = clock();
      if (!runRegistry.acquire(workspaceId)) {
        return emptyResult("SKIPPED_ALREADY_RUNNING", startedAt, clock());
      }

      const controller = new AbortController();
      state = {
        result: emptyResult("SUCCESS", startedAt, startedAt),
        controller,
        processingIds: [],
        attemptedIds: new Set(),
        deferredIds: new Set(),
      };
      logger?.info?.("push coordinator started", { workspaceId, startedAt });

      try {
        await metadataRepository.recordSyncAttempt(workspaceId, deviceId, startedAt);
        await outboxRepository.resetStaleProcessing(
          new Date(Date.parse(startedAt) - normalizedConfig.staleProcessingMs)
            .toISOString(),
        );
        await processPendingBatches({
          workspaceId,
          deviceId,
          syncClient,
          outboxRepository,
          metadataRepository,
          acknowledgementRepository,
          config: normalizedConfig,
          clock,
          sleep,
          logger,
          state,
        });

        state.result.status = finalizeStatus(state.result);
        state.result.finishedAt = clock();
        if (state.result.status === "SUCCESS") {
          await metadataRepository.recordPushSuccess(
            workspaceId,
            deviceId,
            state.result.finishedAt,
          );
          await metadataRepository.clearFailure(workspaceId, deviceId);
        } else if (state.result.errors.length > 0) {
          await metadataRepository.recordFailure(
            workspaceId,
            deviceId,
            firstError(state.result),
            state.result.finishedAt,
          );
        }

        logger?.info?.("push coordinator finished", {
          workspaceId,
          status: state.result.status,
          pushed: state.result.pushed,
          failed: state.result.failed,
          conflicts: state.result.conflicts,
          deferred: state.result.deferred,
          removedFromOutbox: state.result.removedFromOutbox,
        });
        return state.result;
      } catch (error) {
        const finishedAt = clock();
        if (isAbortedError(error)) {
          await returnProcessingToPending(outboxRepository, state.processingIds);
          const cancelled = {
            ...state.result,
            status: "CANCELLED" as const,
            deferred: state.result.deferred + state.processingIds.length,
            finishedAt,
            errors: [
              ...state.result.errors,
              { code: "ABORTED", message: errorMessage(error) },
            ],
          };
          await metadataRepository.recordFailure(
            workspaceId,
            deviceId,
            { code: "ABORTED", message: "Push cancelado." },
            finishedAt,
          );
          logger?.warn?.("push coordinator cancelled", { workspaceId });
          return cancelled;
        }

        await returnProcessingToPending(outboxRepository, state.processingIds);
        const failed = {
          ...state.result,
          status: classifyRunFailure(error),
          deferred: state.result.deferred + state.processingIds.length,
          finishedAt,
          errors: [
            ...state.result.errors,
            { code: errorCode(error), message: errorMessage(error) },
          ],
        };
        await metadataRepository.recordFailure(
          workspaceId,
          deviceId,
          firstError(failed),
          finishedAt,
        );
        if (failed.status === "OFFLINE") {
          logger?.info?.("push coordinator offline", {
            workspaceId,
            status: failed.status,
            errorCode: errorCode(error),
          });
        } else {
          logger?.error?.("push coordinator failed", {
            workspaceId,
            status: failed.status,
            errorCode: errorCode(error),
          });
        }
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

export function createPushCoordinatorRunRegistry(): PushCoordinatorRunRegistry {
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

async function processPendingBatches(input: {
  workspaceId: string;
  deviceId: string;
  syncClient: Pick<SyncClient, "push">;
  outboxRepository: PushCoordinatorOutboxRepository;
  metadataRepository: PushCoordinatorMetadataRepository;
  acknowledgementRepository: PushCoordinatorAcknowledgementRepository;
  config: NormalizedConfig;
  clock: () => string;
  sleep: (ms: number, signal: AbortSignal) => Promise<void>;
  logger?: PushCoordinatorLogger;
  state: RunState;
}) {
  while (!input.state.controller.signal.aborted) {
    const now = input.clock();
    const pending = await input.outboxRepository.listPending(
      input.workspaceId,
      SYNC_OUTBOX_MAX_LIST_LIMIT,
    );
    const conflictKeys = await listActiveConflictKeys(
      input.outboxRepository,
      input.workspaceId,
    );
    const eligible = pending.filter(
      (record) => isEligible(record, now) && !conflictKeys.has(recordEntityKey(record)),
    );
    for (const record of pending) {
      const blockedByConflict = conflictKeys.has(recordEntityKey(record));
      if (
        (!isEligible(record, now) || blockedByConflict) &&
        !input.state.deferredIds.has(record.mutationId)
      ) {
        input.state.deferredIds.add(record.mutationId);
        input.state.result.deferred += 1;
      }
    }

    if (eligible.length === 0) {
      break;
    }

    const batch = eligible.slice(0, input.config.batchSize);
    input.state.processingIds = batch.map((record) => record.mutationId);
    const processing = await input.outboxRepository.markProcessing(
      input.state.processingIds,
    );

    for (const record of processing) {
      input.state.attemptedIds.add(record.mutationId);
    }

    input.logger?.debug?.("push batch processing", {
      workspaceId: input.workspaceId,
      batchSize: processing.length,
      mutationIds: processing.map((record) => record.mutationId),
    });

    try {
      const response = await input.syncClient.push({
        workspaceId: input.workspaceId,
        deviceId: input.deviceId,
        mutations: processing.map((record) => record.mutation),
        signal: input.state.controller.signal,
      });
      await applyPushResponse(input, processing, response);
      input.state.processingIds = [];
    } catch (error) {
      await handlePushError(input, processing, error);
    }
  }

  if (input.state.controller.signal.aborted) {
    throw new SyncClientError({
      code: "ABORTED",
      message: "Push cancelado.",
    });
  }
}

async function listActiveConflictKeys(
  outboxRepository: PushCoordinatorOutboxRepository,
  workspaceId: string,
) {
  const conflicts = outboxRepository.listAllConflicts
    ? await outboxRepository.listAllConflicts(workspaceId)
    : await outboxRepository.listConflicts?.(workspaceId, SYNC_OUTBOX_MAX_LIST_LIMIT) ?? [];

  return new Set(conflicts.map(recordEntityKey));
}

function recordEntityKey(record: SyncMutationOutboxRecord) {
  return createEntityConflictKey({
    workspaceId: record.workspaceId,
    entityType: record.mutation.entityType,
    entityId: record.mutation.entityId,
  });
}

async function applyPushResponse(
  input: {
    outboxRepository: PushCoordinatorOutboxRepository;
    acknowledgementRepository: PushCoordinatorAcknowledgementRepository;
    state: RunState;
  },
  batch: SyncMutationOutboxRecord[],
  response: PushResponse,
) {
  const acceptedIds = new Set(response.accepted.map((entry) => entry.mutationId));
  const acceptedVersions = new Map(
    response.accepted.map((entry) => [entry.mutationId, entry.version]),
  );
  const conflictIds = new Set(response.conflicts.map((entry) => entry.mutationId));
  const duplicateRejected = response.rejected.filter((entry) =>
    isDuplicateRejection(entry.code),
  );
  const duplicateIds = new Set(
    duplicateRejected
      .map((entry) => entry.mutationId)
      .filter((mutationId): mutationId is string => Boolean(mutationId)),
  );
  const removableIds = [...acceptedIds, ...duplicateIds];

  if (removableIds.length > 0) {
    const acceptedRecords = batch.filter((record) => acceptedIds.has(record.mutationId));
    await input.acknowledgementRepository.recordMany(
      acceptedRecords.map((record) =>
        createAcknowledgementFromAcceptedMutation({
          record,
          remoteVersion: acceptedVersions.get(record.mutationId) ?? 1,
          acknowledgedAt: new Date().toISOString(),
          generation: response.serverCursor,
        }),
      ),
    );
    await input.outboxRepository.remove(removableIds);
    input.state.result.removedFromOutbox += removableIds.length;
    input.state.result.pushed += acceptedIds.size;
    appendMemorySyncEvent({
      type: "PUSH_SUCCEEDED",
      workspaceId: batch[0]?.workspaceId,
      deviceId: batch[0]?.deviceId,
      count: acceptedIds.size,
      status: "ACCEPTED",
    });
  }

  for (const conflict of response.conflicts) {
    await input.outboxRepository.markConflict(conflict.mutationId, conflict);
    const record = batch.find((item) => item.mutationId === conflict.mutationId);
    appendMemorySyncEvent({
      type: "CONFLICT_DETECTED",
      workspaceId: record?.workspaceId,
      deviceId: record?.deviceId,
      entityType: conflict.entityType,
      entityId: conflict.entityId,
      mutationId: conflict.mutationId,
      status: "CONFLICT",
      code: "VERSION_CONFLICT",
    });
    input.state.result.conflicts += 1;
    input.state.result.errors.push({
      code: "VERSION_CONFLICT",
      message: "La mutacion tiene conflicto de version.",
      mutationId: conflict.mutationId,
    });
  }

  for (const rejection of response.rejected) {
    if (isDuplicateRejection(rejection.code)) {
      continue;
    }

    if (rejection.mutationId) {
      await input.outboxRepository.markFailed(rejection.mutationId, {
        code: rejection.code || "VALIDATION_ERROR",
        message: rejection.message || "La mutacion fue rechazada.",
      });
    }

    input.state.result.failed += 1;
    input.state.result.errors.push({
      code: rejection.code || "VALIDATION_ERROR",
      message: rejection.message || "La mutacion fue rechazada.",
      mutationId: rejection.mutationId,
    });
  }

  const reportedIds = new Set([
    ...acceptedIds,
    ...conflictIds,
    ...duplicateIds,
    ...response.rejected
      .map((entry) => entry.mutationId)
      .filter((mutationId): mutationId is string => Boolean(mutationId)),
  ]);
  const unreported = batch.filter(
    (record) => !reportedIds.has(record.mutationId),
  );

  for (const record of unreported) {
    await input.outboxRepository.markFailed(record.mutationId, {
      code: "UNREPORTED_MUTATION",
      message: "La API no informo resultado para la mutacion.",
    });
    input.state.result.failed += 1;
    input.state.result.errors.push({
      code: "UNREPORTED_MUTATION",
      message: "La API no informo resultado para la mutacion.",
      mutationId: record.mutationId,
    });
  }
}

async function handlePushError(
  input: {
    outboxRepository: PushCoordinatorOutboxRepository;
    config: NormalizedConfig;
    clock: () => string;
    sleep: (ms: number, signal: AbortSignal) => Promise<void>;
    state: RunState;
  },
  batch: SyncMutationOutboxRecord[],
  error: unknown,
) {
  if (isAbortedError(error)) {
    throw error;
  }

  const ids = batch.map((record) => record.mutationId);
  const code = errorCode(error);

  if (code === "NETWORK_ERROR" || code === "TIMEOUT") {
    await input.outboxRepository.markPending(ids);
    appendMemorySyncEvent({
      type: "OFFLINE_ENTERED",
      workspaceId: batch[0]?.workspaceId,
      deviceId: batch[0]?.deviceId,
      status: "OFFLINE",
      code,
    });
    input.state.result.deferred += ids.length;
    input.state.result.errors.push({ code, message: errorMessage(error) });
    input.state.processingIds = [];
    throw error;
  }

  if (code === "AUTH_ERROR") {
    await input.outboxRepository.markPending(ids);
    appendMemorySyncEvent({
      type: "PUSH_FAILED",
      workspaceId: batch[0]?.workspaceId,
      deviceId: batch[0]?.deviceId,
      status: "AUTH_ERROR",
      code,
      count: ids.length,
    });
    input.state.result.deferred += ids.length;
    input.state.result.errors.push({ code, message: errorMessage(error) });
    input.state.processingIds = [];
    throw error;
  }

  if (isRetryableServerError(code) && shouldRetry(batch, input.config)) {
    await input.outboxRepository.markPending(ids);
    await input.sleep(
      retryDelayMs(batch, input.config),
      input.state.controller.signal,
    );
    input.state.processingIds = [];
    return;
  }

  if (isRetryableServerError(code)) {
    const nextAttemptAt = new Date(
      Date.parse(input.clock()) + retryDelayMs(batch, input.config),
    ).toISOString();
    for (const record of batch) {
      await input.outboxRepository.markFailed(record.mutationId, {
        code,
        message: errorMessage(error),
        nextAttemptAt,
      });
      appendMemorySyncEvent({
        type: "PUSH_FAILED",
        workspaceId: record.workspaceId,
        deviceId: record.deviceId,
        entityType: record.mutation.entityType,
        entityId: record.mutation.entityId,
        mutationId: record.mutationId,
        status: "FAILED",
        code,
      });
      input.state.result.failed += 1;
    }
    input.state.result.errors.push({ code, message: errorMessage(error) });
    input.state.processingIds = [];
    return;
  }

  for (const record of batch) {
    await input.outboxRepository.markFailed(record.mutationId, {
      code,
      message: errorMessage(error),
    });
    appendMemorySyncEvent({
      type: "PUSH_FAILED",
      workspaceId: record.workspaceId,
      deviceId: record.deviceId,
      entityType: record.mutation.entityType,
      entityId: record.mutation.entityId,
      mutationId: record.mutationId,
      status: "FAILED",
      code,
    });
    input.state.result.failed += 1;
  }
  input.state.result.errors.push({ code, message: errorMessage(error) });
  input.state.processingIds = [];
}

function normalizeConfig(config: PushCoordinatorConfig): NormalizedConfig {
  const normalized = {
    batchSize: config.batchSize ?? SYNC_OUTBOX_MAX_LIST_LIMIT,
    staleProcessingMs: config.staleProcessingMs ?? DEFAULT_STALE_PROCESSING_MS,
    maxAttemptsPerRun:
      config.maxAttemptsPerRun ?? DEFAULT_MAX_ATTEMPTS_PER_RUN,
    retryBaseDelayMs:
      config.retryBaseDelayMs ?? DEFAULT_RETRY_BASE_DELAY_MS,
    retryMaxDelayMs: config.retryMaxDelayMs ?? DEFAULT_RETRY_MAX_DELAY_MS,
  };

  if (
    !Number.isInteger(normalized.batchSize) ||
    normalized.batchSize <= 0 ||
    normalized.batchSize > SYNC_OUTBOX_MAX_LIST_LIMIT
  ) {
    throw new PushCoordinatorConfigError(
      "INVALID_BATCH_SIZE",
      "El tamano de lote de push no es valido.",
    );
  }

  for (const [key, value] of Object.entries(normalized)) {
    if (key === "batchSize") {
      continue;
    }

    if (!Number.isFinite(value) || value < 0) {
      throw new PushCoordinatorConfigError(
        "INVALID_RETRY_CONFIG",
        "La configuracion de push no es valida.",
        { key, value },
      );
    }
  }

  if (normalized.maxAttemptsPerRun < 1) {
    throw new PushCoordinatorConfigError(
      "INVALID_RETRY_CONFIG",
      "maxAttemptsPerRun debe ser al menos 1.",
    );
  }

  return normalized;
}

export class PushCoordinatorConfigError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = "PushCoordinatorConfigError";
  }
}

function emptyResult(
  status: PushCoordinatorStatus,
  startedAt: string,
  finishedAt: string,
): PushCoordinatorResult {
  return {
    status,
    pushed: 0,
    failed: 0,
    conflicts: 0,
    deferred: 0,
    removedFromOutbox: 0,
    startedAt,
    finishedAt,
    errors: [],
  };
}

function finalizeStatus(result: PushCoordinatorResult): PushCoordinatorStatus {
  if (result.failed > 0 || result.conflicts > 0) {
    return result.pushed > 0 || result.removedFromOutbox > 0
      ? "PARTIAL"
      : "FAILED";
  }

  if (result.errors.length > 0) {
    return result.pushed > 0 || result.removedFromOutbox > 0
      ? "PARTIAL"
      : "FAILED";
  }

  return "SUCCESS";
}

function classifyRunFailure(error: unknown): PushCoordinatorStatus {
  const code = errorCode(error);
  if (code === "NETWORK_ERROR" || code === "TIMEOUT") {
    return "OFFLINE";
  }

  return "FAILED";
}

function isEligible(record: SyncMutationOutboxRecord, now: string) {
  return !record.nextAttemptAt || record.nextAttemptAt <= now;
}

function isDuplicateRejection(code: string) {
  return code.toUpperCase().includes("DUPLICATE");
}

function shouldRetry(
  batch: SyncMutationOutboxRecord[],
  config: NormalizedConfig,
) {
  return batch.some((record) => record.attemptCount < config.maxAttemptsPerRun);
}

function retryDelayMs(
  batch: SyncMutationOutboxRecord[],
  config: NormalizedConfig,
) {
  const nextAttempt = Math.max(
    1,
    ...batch.map((record) => record.attemptCount),
  );
  return Math.min(
    config.retryBaseDelayMs * 2 ** Math.max(0, nextAttempt - 1),
    config.retryMaxDelayMs,
  );
}

function isRetryableServerError(code: string) {
  return code === "SERVER_ERROR" || code === "UNKNOWN_ERROR" || code === "INVALID_RESPONSE";
}

function isAbortedError(error: unknown) {
  return error instanceof SyncClientError && error.code === "ABORTED";
}

function errorCode(error: unknown): string {
  if (error instanceof SyncClientError) {
    return error.code;
  }

  if (error instanceof PushCoordinatorConfigError) {
    return error.code;
  }

  return "UNKNOWN_ERROR";
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Fallo desconocido.";
}

function firstError(result: PushCoordinatorResult) {
  return result.errors[0] ?? { code: result.status, message: result.status };
}

async function returnProcessingToPending(
  outboxRepository: PushCoordinatorOutboxRepository,
  mutationIds: string[],
) {
  if (mutationIds.length > 0) {
    await outboxRepository.markPending(mutationIds);
  }
}

function assertNonEmpty(field: string, value: string) {
  if (!value.trim()) {
    throw new PushCoordinatorConfigError(
      "INVALID_CONFIG",
      `${field} no puede estar vacio.`,
      { field },
    );
  }
}

function sleepWithAbort(ms: number, signal: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    if (signal.aborted) {
      reject(
        new SyncClientError({
          code: "ABORTED",
          message: "Push cancelado.",
        }),
      );
      return;
    }

    const timeout = setTimeout(resolve, ms);
    signal.addEventListener(
      "abort",
      () => {
        clearTimeout(timeout);
        reject(
          new SyncClientError({
            code: "ABORTED",
            message: "Push cancelado.",
          }),
        );
      },
      { once: true },
    );
  });
}
