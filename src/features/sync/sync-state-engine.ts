import type { SyncMutationOutboxStatus } from "@/features/sync/sync-outbox-repository";

export type SyncLifecycle = "STOPPED" | "STARTED";
export type SyncPhase =
  | "IDLE"
  | "WAITING"
  | "PUSHING"
  | "PULLING"
  | "SUCCESS"
  | "ERROR"
  | "CANCELLED";
export type SyncConnectivity = "UNKNOWN" | "ONLINE" | "OFFLINE";
export type SyncAuthentication =
  | "UNKNOWN"
  | "AUTHENTICATED_ONLINE"
  | "AUTHENTICATED_OFFLINE"
  | "AUTHENTICATED_LOCAL"
  | "AUTHENTICATED"
  | "UNAUTHENTICATED";
export type SyncErrorSource =
  | "PUSH"
  | "PULL"
  | "ORCHESTRATOR"
  | "NETWORK"
  | "AUTH"
  | "STATE_ENGINE";
export type SyncHealth =
  | "HEALTHY"
  | "PENDING"
  | "SYNCING"
  | "OFFLINE"
  | "ERROR"
  | "CONFLICT";

export type SyncStateError = {
  source: SyncErrorSource;
  code?: string;
  message: string;
  occurredAt: string;
};

export type SyncState = {
  lifecycle: SyncLifecycle;
  phase: SyncPhase;
  connectivity: SyncConnectivity;
  authentication: SyncAuthentication;
  pendingMutations: number;
  processingMutations: number;
  failedMutations: number;
  conflictCount: number;
  lastRunStartedAt: string | null;
  lastRunFinishedAt: string | null;
  lastSuccessfulSyncAt: string | null;
  nextRunAt: string | null;
  lastError: SyncStateError | null;
};

export type SyncEvent =
  | { type: "ORCHESTRATOR_STARTED"; at: string }
  | { type: "ORCHESTRATOR_STOPPED"; at: string }
  | { type: "SYNC_SCHEDULED"; nextRunAt: string }
  | { type: "SYNC_STARTED"; at: string }
  | { type: "PUSH_STARTED"; at: string }
  | {
      type: "PUSH_FINISHED";
      at: string;
      status: string;
      error?: Omit<SyncStateError, "source" | "occurredAt">;
    }
  | { type: "PULL_STARTED"; at: string }
  | {
      type: "PULL_FINISHED";
      at: string;
      status: string;
      error?: Omit<SyncStateError, "source" | "occurredAt">;
    }
  | { type: "SYNC_SUCCEEDED"; at: string }
  | {
      type: "SYNC_FAILED";
      at: string;
      source: SyncErrorSource;
      code?: string;
      message: string;
    }
  | {
      type: "SYNC_CANCELLED";
      at: string;
      source?: Extract<SyncErrorSource, "PUSH" | "PULL" | "ORCHESTRATOR">;
      message?: string;
    }
  | {
      type: "OUTBOX_COUNTS_CHANGED";
      pending: number;
      processing: number;
      failed: number;
    }
  | { type: "CONFLICT_COUNT_CHANGED"; conflicts: number }
  | { type: "CONNECTIVITY_CHANGED"; connectivity: SyncConnectivity }
  | { type: "AUTHENTICATION_CHANGED"; authentication: SyncAuthentication }
  | { type: "ERROR_CLEARED" }
  | { type: "STATE_RESET" };

export type SyncStateListener = (state: SyncState) => void;

export type SyncStateEngine = {
  getState(): SyncState;
  dispatch(event: SyncEvent): SyncState;
  dispatchMany(events: SyncEvent[]): SyncState;
  subscribe(listener: SyncStateListener): () => void;
  reset(): SyncState;
};

export type SyncOutboxCountsRepository = {
  countByStatus(
    workspaceId: string,
    status: SyncMutationOutboxStatus,
  ): Promise<number>;
};

export type RefreshOutboxStateInput = {
  workspaceId: string;
  outboxRepository: SyncOutboxCountsRepository;
  engine: Pick<SyncStateEngine, "dispatch">;
};

export const initialSyncState: SyncState = {
  lifecycle: "STOPPED",
  phase: "IDLE",
  connectivity: "UNKNOWN",
  authentication: "UNKNOWN",
  pendingMutations: 0,
  processingMutations: 0,
  failedMutations: 0,
  conflictCount: 0,
  lastRunStartedAt: null,
  lastRunFinishedAt: null,
  lastSuccessfulSyncAt: null,
  nextRunAt: null,
  lastError: null,
};

export function reduceSyncState(
  state: SyncState,
  event: SyncEvent,
): SyncState {
  switch (event.type) {
    case "ORCHESTRATOR_STARTED":
      return {
        ...state,
        lifecycle: "STARTED",
        phase: state.phase === "IDLE" ? "WAITING" : state.phase,
      };
    case "ORCHESTRATOR_STOPPED":
      return {
        ...state,
        lifecycle: "STOPPED",
        phase: state.phase === "PUSHING" || state.phase === "PULLING"
          ? state.phase
          : "IDLE",
        nextRunAt: null,
      };
    case "SYNC_SCHEDULED":
      return { ...state, phase: "WAITING", nextRunAt: event.nextRunAt };
    case "SYNC_STARTED":
      return {
        ...state,
        phase: "PUSHING",
        lastRunStartedAt: event.at,
        nextRunAt: null,
        lastError: null,
      };
    case "PUSH_STARTED":
      return {
        ...state,
        phase: "PUSHING",
        lastRunStartedAt: state.lastRunStartedAt ?? event.at,
        nextRunAt: null,
        lastError: null,
      };
    case "PUSH_FINISHED":
      if (event.status === "SUCCESS") {
        return state;
      }

      if (event.status === "OFFLINE") {
        return {
          ...state,
          phase: "IDLE",
          connectivity: "OFFLINE",
          lastRunFinishedAt: event.at,
          lastError: null,
        };
      }

      return {
        ...state,
        phase: "ERROR",
        lastRunFinishedAt: event.at,
        lastError: {
          source: "PUSH",
          code: event.error?.code ?? event.status,
          message: event.error?.message ?? "Push no finalizo correctamente.",
          occurredAt: event.at,
        },
      };
    case "PULL_STARTED":
      return { ...state, phase: "PULLING" };
    case "PULL_FINISHED":
      if (event.status === "SUCCESS") {
        return state;
      }

      return {
        ...state,
        phase: "ERROR",
        lastRunFinishedAt: event.at,
        lastError: {
          source: "PULL",
          code: event.error?.code ?? event.status,
          message: event.error?.message ?? "Pull no finalizo correctamente.",
          occurredAt: event.at,
        },
      };
    case "SYNC_SUCCEEDED":
      return {
        ...state,
        phase: "SUCCESS",
        connectivity: "ONLINE",
        lastRunFinishedAt: event.at,
        lastSuccessfulSyncAt: event.at,
        lastError: null,
      };
    case "SYNC_FAILED":
      if (event.code === "OFFLINE" || event.code === "NETWORK_ERROR" || event.code === "TIMEOUT") {
        return {
          ...state,
          phase: "IDLE",
          connectivity: "OFFLINE",
          lastRunFinishedAt: event.at,
          lastError: null,
        };
      }

      return {
        ...state,
        phase: "ERROR",
        lastRunFinishedAt: event.at,
        lastError: {
          source: event.source,
          code: event.code,
          message: event.message,
          occurredAt: event.at,
        },
      };
    case "SYNC_CANCELLED":
      return {
        ...state,
        phase: "CANCELLED",
        lastRunFinishedAt: event.at,
        lastError: {
          source: event.source ?? "ORCHESTRATOR",
          code: "CANCELLED",
          message: event.message ?? "La sincronizacion fue cancelada.",
          occurredAt: event.at,
        },
      };
    case "OUTBOX_COUNTS_CHANGED":
      return {
        ...state,
        pendingMutations: nonNegative(event.pending),
        processingMutations: nonNegative(event.processing),
        failedMutations: nonNegative(event.failed),
      };
    case "CONFLICT_COUNT_CHANGED":
      return { ...state, conflictCount: nonNegative(event.conflicts) };
    case "CONNECTIVITY_CHANGED":
      return { ...state, connectivity: event.connectivity };
    case "AUTHENTICATION_CHANGED":
      return {
        ...state,
        authentication: event.authentication,
        connectivity:
          event.authentication === "AUTHENTICATED_ONLINE"
            ? "ONLINE"
            : event.authentication === "AUTHENTICATED_LOCAL"
              ? "UNKNOWN"
            : state.connectivity,
      };
    case "ERROR_CLEARED":
      return { ...state, lastError: null };
    case "STATE_RESET":
      return cloneState(initialSyncState);
    default:
      return assertNever(event);
  }
}

export function createSyncStateEngine(
  initialState: SyncState = initialSyncState,
): SyncStateEngine {
  const listeners = new Set<SyncStateListener>();
  let state = cloneState(initialState);

  function getState() {
    return cloneState(state);
  }

  function dispatch(event: SyncEvent) {
    const nextState = reduceSyncState(state, event);

    if (sameState(state, nextState)) {
      return getState();
    }

    state = cloneState(nextState);
    notify();
    return getState();
  }

  function dispatchMany(events: SyncEvent[]) {
    for (const event of events) {
      dispatch(event);
    }

    return getState();
  }

  function subscribe(listener: SyncStateListener) {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  }

  function reset() {
    return dispatch({ type: "STATE_RESET" });
  }

  function notify() {
    const snapshot = getState();
    for (const listener of listeners) {
      try {
        listener(snapshot);
      } catch {
        // Consumers must not be able to break the state engine.
      }
    }
  }

  return { getState, dispatch, dispatchMany, subscribe, reset };
}

export async function refreshOutboxState({
  workspaceId,
  outboxRepository,
  engine,
}: RefreshOutboxStateInput) {
  const [pending, processing, failed, conflicts] = await Promise.all([
    outboxRepository.countByStatus(workspaceId, "PENDING"),
    outboxRepository.countByStatus(workspaceId, "PROCESSING"),
    outboxRepository.countByStatus(workspaceId, "FAILED"),
    outboxRepository.countByStatus(workspaceId, "CONFLICT"),
  ]);

  engine.dispatch({
    type: "OUTBOX_COUNTS_CHANGED",
    pending,
    processing,
    failed,
  });
  engine.dispatch({ type: "CONFLICT_COUNT_CHANGED", conflicts });

  return { pending, processing, failed, conflicts };
}

export function selectIsSyncing(state: SyncState) {
  return state.phase === "PUSHING" || state.phase === "PULLING";
}

export function selectHasPendingChanges(state: SyncState) {
  return (
    state.pendingMutations > 0 ||
    state.processingMutations > 0 ||
    state.failedMutations > 0
  );
}

export function selectHasErrors(state: SyncState) {
  return state.lastError !== null || state.failedMutations > 0;
}

export function selectHasConflicts(state: SyncState) {
  return state.conflictCount > 0;
}

export function selectSyncHealth(state: SyncState): SyncHealth {
  if (state.connectivity === "OFFLINE") {
    return "OFFLINE";
  }

  if (selectHasConflicts(state)) {
    return "CONFLICT";
  }

  if (selectHasErrors(state)) {
    return "ERROR";
  }

  if (selectIsSyncing(state)) {
    return "SYNCING";
  }

  if (state.pendingMutations > 0 || state.processingMutations > 0) {
    return "PENDING";
  }

  return "HEALTHY";
}

function cloneState(state: SyncState): SyncState {
  return {
    ...state,
    lastError: state.lastError ? { ...state.lastError } : null,
  };
}

function sameState(left: SyncState, right: SyncState) {
  return JSON.stringify(left) === JSON.stringify(right);
}

function nonNegative(value: number) {
  return Number.isFinite(value) && value > 0 ? Math.floor(value) : 0;
}

function assertNever(value: never): never {
  throw new Error(`Unhandled SyncEvent: ${JSON.stringify(value)}`);
}
