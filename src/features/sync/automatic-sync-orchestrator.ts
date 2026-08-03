import type {
  PushCoordinator,
  PushCoordinatorResult,
} from "@/features/sync/push-coordinator";
import type {
  PullCoordinator,
  PullCoordinatorResult,
} from "@/features/sync/pull-coordinator";
import {
  timeoutSyncScheduler,
  type SyncScheduler,
  type SyncSchedulerHandle,
} from "@/features/sync/sync-scheduler";
import { appendMemorySyncEvent } from "@/features/sync/observability/sync-event-buffer";

export const DEFAULT_AUTOMATIC_SYNC_INTERVAL_MS = 30_000;
export const DEFAULT_INITIAL_SYNC_DELAY_MS = 0;
export const DEFAULT_RUN_ON_START = true;
export const DEFAULT_CONTINUE_AFTER_ERROR = true;

export type AutomaticSyncPhase =
  | "IDLE"
  | "WAITING"
  | "PUSHING"
  | "PULLING"
  | "SUCCESS"
  | "ERROR"
  | "CANCELLED";

export type AutomaticSyncError = {
  stage: "PUSH" | "PULL" | "ORCHESTRATOR";
  code?: string;
  message: string;
};

export type SyncCycleStatus =
  | "SUCCESS"
  | "OFFLINE"
  | "PUSH_FAILED"
  | "PULL_FAILED"
  | "CANCELLED"
  | "ALREADY_RUNNING"
  | "FAILED";

export type SyncCycleResult = {
  status: SyncCycleStatus;
  startedAt: string;
  finishedAt: string;
  pushResult?: PushCoordinatorResult;
  pullResult?: PullCoordinatorResult;
  cancelledStage?: "PUSH" | "PULL";
  error?: AutomaticSyncError;
};

export type AutomaticSyncState = {
  started: boolean;
  running: boolean;
  phase: AutomaticSyncPhase;
  lastRunStartedAt: string | null;
  lastRunFinishedAt: string | null;
  lastSuccessfulSyncAt: string | null;
  nextRunAt: string | null;
  lastError: AutomaticSyncError | null;
  lastResult: SyncCycleResult | null;
};

export type AutomaticSyncOrchestrator = {
  start(): AutomaticSyncState;
  stop(): AutomaticSyncState;
  syncNow(): Promise<SyncCycleResult>;
  cancelCurrentRun(): void;
  isStarted(): boolean;
  isRunning(): boolean;
  getState(): AutomaticSyncState;
  subscribe(listener: AutomaticSyncStateListener): () => void;
};

export type AutomaticSyncStateListener = (state: AutomaticSyncState) => void;

export type AutomaticSyncOrchestratorLogger = {
  debug?(message: string, context?: Record<string, unknown>): void;
  info?(message: string, context?: Record<string, unknown>): void;
  warn?(message: string, context?: Record<string, unknown>): void;
  error?(message: string, context?: Record<string, unknown>): void;
};

export type AutomaticSyncOrchestratorConfig = {
  syncIntervalMs?: number;
  initialSyncDelayMs?: number;
  runOnStart?: boolean;
  continueAfterError?: boolean;
};

export type CreateAutomaticSyncOrchestratorInput = {
  pushCoordinator: Pick<PushCoordinator, "run" | "cancel" | "isRunning">;
  pullCoordinator: Pick<PullCoordinator, "run" | "cancel" | "isRunning">;
  scheduler?: SyncScheduler;
  clock?: () => string;
  logger?: AutomaticSyncOrchestratorLogger;
  config?: AutomaticSyncOrchestratorConfig;
};

type NormalizedConfig = Required<AutomaticSyncOrchestratorConfig>;

type ActiveStage = "PUSH" | "PULL" | null;

export function createAutomaticSyncOrchestrator({
  pushCoordinator,
  pullCoordinator,
  scheduler = timeoutSyncScheduler,
  clock = () => new Date().toISOString(),
  logger,
  config = {},
}: CreateAutomaticSyncOrchestratorInput): AutomaticSyncOrchestrator {
  const normalizedConfig = normalizeConfig(config);
  const listeners = new Set<AutomaticSyncStateListener>();
  let state: AutomaticSyncState = initialState();
  let timer: SyncSchedulerHandle | null = null;
  let activeRun: Promise<SyncCycleResult> | null = null;
  let activeStage: ActiveStage = null;

  function start() {
    if (state.started) {
      return getState();
    }

    updateState({
      started: true,
      phase: state.running ? state.phase : "WAITING",
    });
    log("info", "orchestrator_started", {
      initialSyncDelayMs: normalizedConfig.initialSyncDelayMs,
      syncIntervalMs: normalizedConfig.syncIntervalMs,
      runOnStart: normalizedConfig.runOnStart,
    });

    if (normalizedConfig.runOnStart) {
      scheduleNext(normalizedConfig.initialSyncDelayMs);
    } else {
      scheduleNext(normalizedConfig.syncIntervalMs);
    }

    return getState();
  }

  function stop() {
    if (!state.started && !timer) {
      return getState();
    }

    clearTimer();
    updateState({
      started: false,
      nextRunAt: null,
      phase: state.running ? state.phase : "IDLE",
    });
    log("info", "orchestrator_stopped");
    return getState();
  }

  async function syncNow() {
    if (activeRun) {
      const now = clock();
      const result: SyncCycleResult = {
        status: "ALREADY_RUNNING",
        startedAt: now,
        finishedAt: now,
      };
      log("warn", "sync_cycle_skipped_already_running");
      return result;
    }

    clearTimer();
    activeRun = runCycle();

    try {
      return await activeRun;
    } finally {
      activeRun = null;
      activeStage = null;
      if (state.started) {
        scheduleNext(normalizedConfig.syncIntervalMs);
      }
    }
  }

  function cancelCurrentRun() {
    if (activeStage === "PUSH" || pushCoordinator.isRunning()) {
      pushCoordinator.cancel();
      log("warn", "sync_cycle_cancel_requested", { stage: "PUSH" });
      return;
    }

    if (activeStage === "PULL" || pullCoordinator.isRunning()) {
      pullCoordinator.cancel();
      log("warn", "sync_cycle_cancel_requested", { stage: "PULL" });
    }
  }

  function scheduleNext(delayMs: number) {
    clearTimer();
    const scheduledAt = clock();
    const nextRunAt = addMs(scheduledAt, delayMs);
    updateState({
      phase: state.running ? state.phase : "WAITING",
      nextRunAt,
    });
    try {
      timer = scheduler.schedule(() => {
        timer = null;
        void syncNow();
      }, delayMs);
      log("debug", "next_sync_scheduled", { delayMs, nextRunAt });
    } catch (error) {
      const syncError = toSyncError(error, "ORCHESTRATOR");
      timer = null;
      updateState({
        phase: "ERROR",
        nextRunAt: null,
        lastError: syncError,
      });
      log("error", "sync_scheduler_failed", {
        code: syncError.code,
        message: syncError.message,
      });

      if (!normalizedConfig.continueAfterError) {
        updateState({ started: false });
      }
    }
  }

  function clearTimer() {
    if (timer) {
      try {
        scheduler.cancel(timer);
      } catch (error) {
        const syncError = toSyncError(error, "ORCHESTRATOR");
        updateState({ lastError: syncError });
        log("error", "sync_scheduler_cancel_failed", {
          code: syncError.code,
          message: syncError.message,
        });
      }
      timer = null;
    }
  }

  async function runCycle(): Promise<SyncCycleResult> {
    const startedAt = clock();
    updateState({
      running: true,
      phase: "PUSHING",
      nextRunAt: null,
      lastRunStartedAt: startedAt,
    });
    log("info", "sync_cycle_started", { startedAt });

    try {
      log("debug", "push_started");
      activeStage = "PUSH";
      const pushResult = await pushCoordinator.run();
      log("debug", "push_finished", {
        status: pushResult.status,
        pushed: pushResult.pushed,
        failed: pushResult.failed,
        conflicts: pushResult.conflicts,
      });

      if (pushResult.status === "CANCELLED") {
        return finishCancelled("PUSH", startedAt, { pushResult });
      }

      if (pushResult.status === "OFFLINE") {
        return finishOffline(startedAt, { pushResult });
      }

      if (!isSuccessfulPush(pushResult)) {
        return finishFailure("PUSH_FAILED", "PUSH", startedAt, { pushResult });
      }

      activeStage = "PULL";
      updateState({ phase: "PULLING" });
      log("debug", "pull_started");
      const pullResult = await pullCoordinator.run();
      log("debug", "pull_finished", {
        status: pullResult.status,
        pulled: pullResult.pulled,
        applied: pullResult.applied,
        conflicts: pullResult.conflicts,
      });

      if (pullResult.status === "CANCELLED") {
        return finishCancelled("PULL", startedAt, { pushResult, pullResult });
      }

      if (!isSuccessfulPull(pullResult)) {
        return finishFailure("PULL_FAILED", "PULL", startedAt, {
          pushResult,
          pullResult,
        });
      }

      const finishedAt = clock();
      const result: SyncCycleResult = {
        status: "SUCCESS",
        startedAt,
        finishedAt,
        pushResult,
        pullResult,
      };
      updateState({
        running: false,
        phase: "SUCCESS",
        lastRunFinishedAt: finishedAt,
        lastSuccessfulSyncAt: finishedAt,
        lastError: null,
        lastResult: result,
      });
      appendMemorySyncEvent({
        type: "ONLINE_RESTORED",
        timestamp: finishedAt,
        status: "ONLINE",
      });
      log("info", "sync_cycle_succeeded", {
        startedAt,
        finishedAt,
        durationMs: durationMs(startedAt, finishedAt),
      });
      return result;
    } catch (error) {
      const finishedAt = clock();
      const syncError = toSyncError(error, activeStage ?? "ORCHESTRATOR");
      const result: SyncCycleResult = {
        status: "FAILED",
        startedAt,
        finishedAt,
        error: syncError,
      };
      updateState({
        running: false,
        phase: "ERROR",
        lastRunFinishedAt: finishedAt,
        lastError: syncError,
        lastResult: result,
      });
      log("error", "sync_cycle_failed", {
        stage: syncError.stage,
        code: syncError.code,
        durationMs: durationMs(startedAt, finishedAt),
      });

      if (!normalizedConfig.continueAfterError) {
        clearTimer();
        updateState({ started: false, nextRunAt: null });
      }

      return result;
    } finally {
      activeStage = null;
    }
  }

  function finishCancelled(
    stage: "PUSH" | "PULL",
    startedAt: string,
    partial: Pick<SyncCycleResult, "pushResult" | "pullResult">,
  ) {
    const finishedAt = clock();
    const result: SyncCycleResult = {
      status: "CANCELLED",
      startedAt,
      finishedAt,
      cancelledStage: stage,
      ...partial,
    };
    updateState({
      running: false,
      phase: "CANCELLED",
      lastRunFinishedAt: finishedAt,
      lastResult: result,
      lastError: {
        stage,
        code: "CANCELLED",
        message: "El ciclo de sincronizacion fue cancelado.",
      },
    });
    log("warn", "sync_cycle_cancelled", {
      stage,
      durationMs: durationMs(startedAt, finishedAt),
    });
    return result;
  }

  function finishFailure(
    status: "PUSH_FAILED" | "PULL_FAILED",
    stage: "PUSH" | "PULL",
    startedAt: string,
    partial: Pick<SyncCycleResult, "pushResult" | "pullResult">,
  ) {
    const finishedAt = clock();
    const error = resultError(stage, partial);
    const result: SyncCycleResult = {
      status,
      startedAt,
      finishedAt,
      ...partial,
      error,
    };
    updateState({
      running: false,
      phase: "ERROR",
      lastRunFinishedAt: finishedAt,
      lastError: error,
      lastResult: result,
    });
    log("warn", "sync_cycle_failed", {
      stage,
      code: error.code,
      durationMs: durationMs(startedAt, finishedAt),
    });

    if (!normalizedConfig.continueAfterError) {
      clearTimer();
      updateState({ started: false, nextRunAt: null });
    }

    return result;
  }

  function finishOffline(
    startedAt: string,
    partial: Pick<SyncCycleResult, "pushResult">,
  ) {
    const finishedAt = clock();
    const result: SyncCycleResult = {
      status: "OFFLINE",
      startedAt,
      finishedAt,
      ...partial,
    };
    updateState({
      running: false,
      phase: "IDLE",
      lastRunFinishedAt: finishedAt,
      lastError: null,
      lastResult: result,
    });
    appendMemorySyncEvent({
      type: "OFFLINE_ENTERED",
      timestamp: finishedAt,
      status: "OFFLINE",
      code: "OFFLINE",
    });
    log("info", "sync_cycle_offline", {
      durationMs: durationMs(startedAt, finishedAt),
    });
    return result;
  }

  function updateState(patch: Partial<AutomaticSyncState>) {
    state = { ...state, ...patch };
    notifyListeners();
  }

  function notifyListeners() {
    const snapshot = getState();
    for (const listener of listeners) {
      try {
        listener(snapshot);
      } catch (error) {
        log("error", "sync_state_listener_failed", {
          message: errorMessage(error),
        });
      }
    }
  }

  function getState() {
    return cloneState(state);
  }

  function subscribe(listener: AutomaticSyncStateListener) {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  }

  function log(
    level: keyof AutomaticSyncOrchestratorLogger,
    message: string,
    context?: Record<string, unknown>,
  ) {
    try {
      logger?.[level]?.(message, context);
    } catch {
      // Logging must never break synchronization.
    }
  }

  return {
    start,
    stop,
    syncNow,
    cancelCurrentRun,
    isStarted: () => state.started,
    isRunning: () => state.running,
    getState,
    subscribe,
  };
}

function normalizeConfig(
  config: AutomaticSyncOrchestratorConfig,
): NormalizedConfig {
  const normalized = {
    syncIntervalMs:
      config.syncIntervalMs ?? DEFAULT_AUTOMATIC_SYNC_INTERVAL_MS,
    initialSyncDelayMs:
      config.initialSyncDelayMs ?? DEFAULT_INITIAL_SYNC_DELAY_MS,
    runOnStart: config.runOnStart ?? DEFAULT_RUN_ON_START,
    continueAfterError:
      config.continueAfterError ?? DEFAULT_CONTINUE_AFTER_ERROR,
  };

  if (!Number.isFinite(normalized.syncIntervalMs) || normalized.syncIntervalMs < 0) {
    throw new AutomaticSyncOrchestratorConfigError(
      "INVALID_SYNC_INTERVAL",
      "syncIntervalMs no es valido.",
    );
  }

  if (
    !Number.isFinite(normalized.initialSyncDelayMs) ||
    normalized.initialSyncDelayMs < 0
  ) {
    throw new AutomaticSyncOrchestratorConfigError(
      "INVALID_INITIAL_SYNC_DELAY",
      "initialSyncDelayMs no es valido.",
    );
  }

  return normalized;
}

export class AutomaticSyncOrchestratorConfigError extends Error {
  constructor(
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "AutomaticSyncOrchestratorConfigError";
  }
}

function initialState(): AutomaticSyncState {
  return {
    started: false,
    running: false,
    phase: "IDLE",
    lastRunStartedAt: null,
    lastRunFinishedAt: null,
    lastSuccessfulSyncAt: null,
    nextRunAt: null,
    lastError: null,
    lastResult: null,
  };
}

function isSuccessfulPush(result: PushCoordinatorResult) {
  return result.status === "SUCCESS";
}

function isSuccessfulPull(result: PullCoordinatorResult) {
  return result.status === "SUCCESS";
}

function resultError(
  stage: "PUSH" | "PULL",
  partial: Pick<SyncCycleResult, "pushResult" | "pullResult">,
): AutomaticSyncError {
  const result = stage === "PUSH" ? partial.pushResult : partial.pullResult;
  const firstError = result?.errors[0];

  return {
    stage,
    code: firstError?.code ?? result?.status,
    message: firstError?.message ?? `${stage} no finalizo correctamente.`,
  };
}

function toSyncError(error: unknown, stage: "PUSH" | "PULL" | "ORCHESTRATOR") {
  return {
    stage,
    code: errorCode(error),
    message: errorMessage(error),
  };
}

function errorCode(error: unknown) {
  if (error && typeof error === "object" && "code" in error) {
    return String(error.code);
  }

  return undefined;
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Fallo desconocido.";
}

function addMs(isoDate: string, ms: number) {
  return new Date(Date.parse(isoDate) + ms).toISOString();
}

function durationMs(startedAt: string, finishedAt: string) {
  return Math.max(0, Date.parse(finishedAt) - Date.parse(startedAt));
}

function cloneState(state: AutomaticSyncState): AutomaticSyncState {
  return {
    ...state,
    lastError: state.lastError ? { ...state.lastError } : null,
    lastResult: cloneResult(state.lastResult),
  };
}

function cloneResult(result: SyncCycleResult | null): SyncCycleResult | null {
  if (!result) {
    return null;
  }

  return {
    ...result,
    error: result.error ? { ...result.error } : undefined,
  };
}
