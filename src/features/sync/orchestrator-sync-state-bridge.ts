import type {
  AutomaticSyncPhase,
  AutomaticSyncState,
} from "@/features/sync/automatic-sync-orchestrator";
import type {
  SyncEvent,
  SyncStateEngine,
} from "@/features/sync/sync-state-engine";

export type OrchestratorSyncStateBridgeInput = {
  orchestrator: {
    getState(): AutomaticSyncState;
    subscribe(listener: (state: AutomaticSyncState) => void): () => void;
  };
  engine: Pick<SyncStateEngine, "dispatch" | "dispatchMany">;
  clock?: () => string;
  emitInitialState?: boolean;
};

export function createOrchestratorSyncStateBridge({
  orchestrator,
  engine,
  clock = () => new Date().toISOString(),
  emitInitialState = true,
}: OrchestratorSyncStateBridgeInput) {
  let previous = orchestrator.getState();

  if (emitInitialState) {
    dispatchSnapshot(engine, null, previous, clock);
  }

  const unsubscribe = orchestrator.subscribe((next) => {
    dispatchSnapshot(engine, previous, next, clock);
    previous = next;
  });

  return {
    dispose: unsubscribe,
  };
}

function dispatchSnapshot(
  engine: Pick<SyncStateEngine, "dispatch" | "dispatchMany">,
  previous: AutomaticSyncState | null,
  next: AutomaticSyncState,
  clock: () => string,
) {
  const events = toSyncEvents(previous, next, clock);
  if (events.length > 0) {
    engine.dispatchMany(events);
  }
}

export function toSyncEvents(
  previous: AutomaticSyncState | null,
  next: AutomaticSyncState,
  clock: () => string = () => new Date().toISOString(),
): SyncEvent[] {
  const events: SyncEvent[] = [];
  const at = eventTime(next, clock);

  if (previous === null || previous.started !== next.started) {
    events.push(
      next.started
        ? { type: "ORCHESTRATOR_STARTED", at }
        : { type: "ORCHESTRATOR_STOPPED", at },
    );
  }

  if (previous === null || previous.nextRunAt !== next.nextRunAt) {
    if (next.nextRunAt) {
      events.push({ type: "SYNC_SCHEDULED", nextRunAt: next.nextRunAt });
    }
  }

  if (previous === null || previous.lastRunStartedAt !== next.lastRunStartedAt) {
    if (next.lastRunStartedAt) {
      events.push({ type: "SYNC_STARTED", at: next.lastRunStartedAt });
    }
  }

  if (previous === null || previous.phase !== next.phase) {
    events.push(...phaseEvents(previous?.phase ?? null, next.phase, at));
  }

  if (
    previous === null ||
    previous.lastRunFinishedAt !== next.lastRunFinishedAt ||
    previous.lastResult?.status !== next.lastResult?.status
  ) {
    events.push(...resultEvents(next, at));
  }

  if (next.lastError && !sameError(previous?.lastError ?? null, next.lastError)) {
    events.push({
      type: "SYNC_FAILED",
      at,
      source: next.lastError.stage,
      code: next.lastError.code,
      message: next.lastError.message,
    });
  }

  if ((previous?.lastError ?? null) !== null && next.lastError === null) {
    events.push({ type: "ERROR_CLEARED" });
  }

  return dedupeEvents(events);
}

function phaseEvents(
  previousPhase: AutomaticSyncPhase | null,
  phase: AutomaticSyncPhase,
  at: string,
): SyncEvent[] {
  if (previousPhase === phase) {
    return [];
  }

  if (phase === "PUSHING") {
    return [{ type: "PUSH_STARTED", at }];
  }

  if (phase === "PULLING") {
    return [{ type: "PULL_STARTED", at }];
  }

  if (phase === "CANCELLED") {
    return [{ type: "SYNC_CANCELLED", at }];
  }

  return [];
}

function resultEvents(state: AutomaticSyncState, at: string): SyncEvent[] {
  const result = state.lastResult;
  if (!result) {
    return [];
  }

  if (result.status === "SUCCESS") {
    return [
      { type: "PUSH_FINISHED", at, status: result.pushResult?.status ?? "SUCCESS" },
      { type: "PULL_FINISHED", at, status: result.pullResult?.status ?? "SUCCESS" },
      { type: "SYNC_SUCCEEDED", at: result.finishedAt },
    ];
  }

  if (result.status === "PUSH_FAILED") {
    return [
      {
        type: "PUSH_FINISHED",
        at,
        status: result.pushResult?.status ?? result.status,
        error: result.error,
      },
    ];
  }

  if (result.status === "PULL_FAILED") {
    return [
      { type: "PUSH_FINISHED", at, status: result.pushResult?.status ?? "SUCCESS" },
      {
        type: "PULL_FINISHED",
        at,
        status: result.pullResult?.status ?? result.status,
        error: result.error,
      },
    ];
  }

  if (result.status === "CANCELLED") {
    return [
      {
        type: "SYNC_CANCELLED",
        at: result.finishedAt,
        source: result.cancelledStage,
      },
    ];
  }

  if (result.status === "FAILED") {
    return [
      {
        type: "SYNC_FAILED",
        at: result.finishedAt,
        source: result.error?.stage ?? "ORCHESTRATOR",
        code: result.error?.code,
        message: result.error?.message ?? "La sincronizacion fallo.",
      },
    ];
  }

  return [];
}

function eventTime(state: AutomaticSyncState, clock: () => string) {
  return (
    state.lastRunFinishedAt ??
    state.lastRunStartedAt ??
    state.nextRunAt ??
    clock()
  );
}

function sameError(
  left: { stage: string; code?: string; message: string } | null,
  right: { stage: string; code?: string; message: string } | null,
) {
  return (
    left?.stage === right?.stage &&
    left?.code === right?.code &&
    left?.message === right?.message
  );
}

function dedupeEvents(events: SyncEvent[]) {
  const seen = new Set<string>();
  const deduped: SyncEvent[] = [];

  for (const event of events) {
    const key = JSON.stringify(event);
    if (!seen.has(key)) {
      seen.add(key);
      deduped.push(event);
    }
  }

  return deduped;
}
