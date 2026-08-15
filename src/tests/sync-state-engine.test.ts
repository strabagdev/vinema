import "fake-indexeddb/auto";
import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";
import { deleteDB } from "idb";
import {
  createAutomaticSyncOrchestrator,
  type AutomaticSyncState,
} from "@/features/sync/automatic-sync-orchestrator";
import type { PullCoordinatorResult } from "@/features/sync/pull-coordinator";
import type { PushCoordinatorResult } from "@/features/sync/push-coordinator";
import {
  createOrchestratorSyncStateBridge,
  toSyncEvents,
} from "@/features/sync/orchestrator-sync-state-bridge";
import {
  createSyncStateEngine,
  initialSyncState,
  reduceSyncState,
  refreshOutboxState,
  selectHasConflicts,
  selectHasErrors,
  selectHasPendingChanges,
  selectIsSyncing,
  selectSyncHealth,
  type SyncEvent,
} from "@/features/sync/sync-state-engine";
import {
  IndexedDbSyncOutboxRepository,
  type SyncMutationOutboxRecord,
} from "@/features/sync/sync-outbox-repository";
import {
  SYNC_MUTATIONS_STORE,
  VINEMA_DB_NAME,
  getVinemaDb,
  resetVinemaDbConnectionForTests,
} from "@/infrastructure/storage/vinema-db";

const now = "2026-07-30T12:00:00.000Z";
const later = "2026-07-30T12:01:00.000Z";
const workspaceId = "11111111-1111-4111-8111-111111111111";
const deviceId = "22222222-2222-4222-8222-222222222222";

describe("sync state engine", () => {
  afterEach(async () => {
    await resetVinemaDbConnectionForTests();
    await deleteDB(VINEMA_DB_NAME);
  });

  it("starts with a known neutral state", () => {
    const engine = createSyncStateEngine();

    expect(engine.getState()).toEqual(initialSyncState);
    expect(selectSyncHealth(engine.getState())).toBe("HEALTHY");
  });

  it("dispatch updates state and reducer does not mutate the previous state", () => {
    const previous = initialSyncState;
    const next = reduceSyncState(previous, {
      type: "ORCHESTRATOR_STARTED",
      at: now,
    });

    expect(previous).toEqual(initialSyncState);
    expect(next).toMatchObject({ lifecycle: "STARTED", phase: "WAITING" });
  });

  it("handles lifecycle and scheduled events", () => {
    const engine = createSyncStateEngine();

    engine.dispatch({ type: "ORCHESTRATOR_STARTED", at: now });
    engine.dispatch({ type: "SYNC_SCHEDULED", nextRunAt: later });
    expect(engine.getState()).toMatchObject({
      lifecycle: "STARTED",
      phase: "WAITING",
      nextRunAt: later,
    });

    engine.dispatch({ type: "ORCHESTRATOR_STOPPED", at: later });
    expect(engine.getState()).toMatchObject({
      lifecycle: "STOPPED",
      phase: "IDLE",
      nextRunAt: null,
    });
  });

  it("tracks sync, push, pull, success, failure and cancellation phases", () => {
    const engine = createSyncStateEngine();

    engine.dispatch({ type: "SYNC_STARTED", at: now });
    expect(engine.getState()).toMatchObject({
      phase: "PUSHING",
      lastRunStartedAt: now,
      nextRunAt: null,
    });

    engine.dispatch({ type: "PULL_STARTED", at: now });
    expect(engine.getState().phase).toBe("PULLING");

    engine.dispatch({ type: "SYNC_SUCCEEDED", at: later });
    expect(engine.getState()).toMatchObject({
      phase: "SUCCESS",
      lastRunFinishedAt: later,
      lastSuccessfulSyncAt: later,
      lastError: null,
    });

    engine.dispatch({
      type: "SYNC_FAILED",
      at: "2026-07-30T12:02:00.000Z",
      source: "PUSH",
      code: "SERVER_ERROR",
      message: "Temporal",
    });
    expect(engine.getState()).toMatchObject({
      phase: "ERROR",
      lastSuccessfulSyncAt: later,
      lastError: {
        source: "PUSH",
        code: "SERVER_ERROR",
        occurredAt: "2026-07-30T12:02:00.000Z",
      },
    });

    engine.dispatch({ type: "SYNC_CANCELLED", at: later, source: "PULL" });
    expect(engine.getState()).toMatchObject({
      phase: "CANCELLED",
      lastError: { source: "PULL", code: "CANCELLED" },
    });
  });

  it("keeps error until cleared or a later success", () => {
    const engine = createSyncStateEngine();
    engine.dispatch({
      type: "SYNC_FAILED",
      at: now,
      source: "NETWORK",
      message: "Offline",
    });

    engine.dispatch({ type: "CONNECTIVITY_CHANGED", connectivity: "ONLINE" });
    expect(engine.getState().lastError).toMatchObject({ source: "NETWORK" });

    engine.dispatch({ type: "ERROR_CLEARED" });
    expect(engine.getState().lastError).toBeNull();

    engine.dispatch({
      type: "SYNC_FAILED",
      at: now,
      source: "AUTH",
      message: "Unauthorized",
    });
    engine.dispatch({ type: "SYNC_SUCCEEDED", at: later });
    expect(engine.getState().lastError).toBeNull();
  });

  it("clears historical errors as soon as a new sync cycle starts", () => {
    const engine = createSyncStateEngine();
    engine.dispatch({
      type: "SYNC_FAILED",
      at: now,
      source: "PULL",
      message: "Error historico",
    });

    engine.dispatch({ type: "SYNC_STARTED", at: later });
    expect(engine.getState()).toMatchObject({
      phase: "PUSHING",
      lastError: null,
    });

    engine.dispatch({
      type: "SYNC_FAILED",
      at: now,
      source: "PULL",
      message: "Error historico",
    });
    engine.dispatch({ type: "PUSH_STARTED", at: later });
    expect(engine.getState().lastError).toBeNull();
  });

  it("tracks outbox counts, normalizes negatives and tracks conflicts", () => {
    const engine = createSyncStateEngine();
    engine.dispatch({
      type: "OUTBOX_COUNTS_CHANGED",
      pending: 3,
      processing: 1,
      failed: 2,
    });
    engine.dispatch({ type: "CONFLICT_COUNT_CHANGED", conflicts: 4 });

    expect(engine.getState()).toMatchObject({
      pendingMutations: 3,
      processingMutations: 1,
      failedMutations: 2,
      conflictCount: 4,
    });

    engine.dispatch({
      type: "OUTBOX_COUNTS_CHANGED",
      pending: -1,
      processing: -2,
      failed: -3,
    });
    engine.dispatch({ type: "CONFLICT_COUNT_CHANGED", conflicts: -4 });
    expect(engine.getState()).toMatchObject({
      pendingMutations: 0,
      processingMutations: 0,
      failedMutations: 0,
      conflictCount: 0,
    });
  });

  it("tracks future connectivity and authentication without implying errors", () => {
    const engine = createSyncStateEngine();
    engine.dispatch({ type: "CONNECTIVITY_CHANGED", connectivity: "OFFLINE" });
    engine.dispatch({
      type: "AUTHENTICATION_CHANGED",
      authentication: "UNAUTHENTICATED",
    });

    expect(engine.getState()).toMatchObject({
      connectivity: "OFFLINE",
      authentication: "UNAUTHENTICATED",
      lastError: null,
    });
    expect(selectSyncHealth(engine.getState())).toBe("OFFLINE");

    engine.dispatch({ type: "CONNECTIVITY_CHANGED", connectivity: "UNKNOWN" });
    engine.dispatch({
      type: "AUTHENTICATION_CHANGED",
      authentication: "AUTHENTICATED",
    });
    expect(engine.getState()).toMatchObject({
      connectivity: "UNKNOWN",
      authentication: "AUTHENTICATED",
    });
  });

  it("marks connectivity online when auth or a successful sync proves reconnection", () => {
    const engine = createSyncStateEngine();

    engine.dispatch({ type: "CONNECTIVITY_CHANGED", connectivity: "OFFLINE" });
    engine.dispatch({
      type: "AUTHENTICATION_CHANGED",
      authentication: "AUTHENTICATED_ONLINE",
    });

    expect(engine.getState()).toMatchObject({
      connectivity: "ONLINE",
      authentication: "AUTHENTICATED_ONLINE",
    });

    engine.dispatch({ type: "CONNECTIVITY_CHANGED", connectivity: "OFFLINE" });
    engine.dispatch({ type: "SYNC_SUCCEEDED", at: later });

    expect(engine.getState()).toMatchObject({
      connectivity: "ONLINE",
      phase: "SUCCESS",
      lastSuccessfulSyncAt: later,
    });
  });

  it("classifies offline push failures as connectivity without keeping a critical error", () => {
    const engine = createSyncStateEngine();
    engine.dispatch({ type: "PUSH_STARTED", at: now });
    engine.dispatch({
      type: "PUSH_FINISHED",
      at: later,
      status: "OFFLINE",
    });

    expect(engine.getState()).toMatchObject({
      phase: "IDLE",
      connectivity: "OFFLINE",
      lastRunFinishedAt: later,
      lastError: null,
    });
    expect(selectSyncHealth(engine.getState())).toBe("OFFLINE");
  });

  it("reset returns to initial state", () => {
    const engine = createSyncStateEngine();
    engine.dispatch({ type: "ORCHESTRATOR_STARTED", at: now });
    engine.dispatch({ type: "CONFLICT_COUNT_CHANGED", conflicts: 1 });

    expect(engine.reset()).toEqual(initialSyncState);
  });

  it("subscribe receives changes, unsubscribe works and listener errors are isolated", () => {
    const engine = createSyncStateEngine();
    const good = vi.fn();
    const failing = vi.fn(() => {
      throw new Error("listener failed");
    });
    const unsubscribe = engine.subscribe(good);
    engine.subscribe(failing);

    engine.dispatch({ type: "ORCHESTRATOR_STARTED", at: now });
    unsubscribe();
    engine.dispatch({ type: "ORCHESTRATOR_STOPPED", at: later });

    expect(good).toHaveBeenCalledTimes(1);
    expect(failing).toHaveBeenCalledTimes(2);
  });

  it("does not notify when state does not change", () => {
    const engine = createSyncStateEngine();
    const listener = vi.fn();
    engine.subscribe(listener);

    engine.dispatch({ type: "ERROR_CLEARED" });
    engine.dispatch({ type: "ERROR_CLEARED" });

    expect(listener).not.toHaveBeenCalled();
  });

  it("getState returns a defensive copy", () => {
    const engine = createSyncStateEngine();
    const state = engine.getState();
    state.phase = "ERROR";
    state.lastError = {
      source: "STATE_ENGINE",
      message: "mutated",
      occurredAt: now,
    };

    expect(engine.getState()).toMatchObject({
      phase: "IDLE",
      lastError: null,
    });
  });

  it("selects syncing, pending, errors, conflicts and health precedence", () => {
    const syncing = { ...initialSyncState, phase: "PUSHING" as const };
    const pending = { ...initialSyncState, pendingMutations: 1 };
    const failed = { ...initialSyncState, failedMutations: 1 };
    const conflict = { ...initialSyncState, conflictCount: 1 };
    const offlineConflict = {
      ...initialSyncState,
      connectivity: "OFFLINE" as const,
      conflictCount: 1,
    };

    expect(selectIsSyncing(syncing)).toBe(true);
    expect(selectHasPendingChanges(pending)).toBe(true);
    expect(selectHasErrors(failed)).toBe(true);
    expect(selectHasConflicts(conflict)).toBe(true);
    expect(selectSyncHealth(syncing)).toBe("SYNCING");
    expect(selectSyncHealth(pending)).toBe("PENDING");
    expect(selectSyncHealth(failed)).toBe("ERROR");
    expect(selectSyncHealth(conflict)).toBe("CONFLICT");
    expect(selectSyncHealth(offlineConflict)).toBe("OFFLINE");
  });

  it("bridge translates orchestrator PUSHING, PULLING, SUCCESS, OFFLINE and ERROR states", () => {
    const events = collectBridgeEvents([
      automaticState({ started: true, phase: "PUSHING", lastRunStartedAt: now }),
      automaticState({ started: true, phase: "PULLING", lastRunStartedAt: now }),
      automaticState({
        started: true,
        phase: "SUCCESS",
        lastRunStartedAt: now,
        lastRunFinishedAt: later,
        lastSuccessfulSyncAt: later,
        lastResult: { status: "SUCCESS", startedAt: now, finishedAt: later },
      }),
      automaticState({
        started: true,
        phase: "ERROR",
        lastRunStartedAt: now,
        lastRunFinishedAt: later,
        lastError: { stage: "PULL", code: "NETWORK_ERROR", message: "Offline" },
        lastResult: {
          status: "PULL_FAILED",
          startedAt: now,
          finishedAt: later,
          error: { stage: "PULL", code: "NETWORK_ERROR", message: "Offline" },
        },
      }),
      automaticState({
        started: true,
        phase: "IDLE",
        lastRunStartedAt: now,
        lastRunFinishedAt: later,
        lastError: null,
        lastResult: {
          status: "OFFLINE",
          startedAt: now,
          finishedAt: later,
          pushResult: {
            status: "OFFLINE",
            pushed: 0,
            failed: 0,
            conflicts: 0,
            deferred: 1,
            removedFromOutbox: 0,
            startedAt: now,
            finishedAt: later,
            errors: [{ code: "NETWORK_ERROR", message: "Offline" }],
          },
        },
      }),
    ]);

    expect(events.map((event) => event.type)).toEqual(
      expect.arrayContaining([
        "PUSH_STARTED",
        "PULL_STARTED",
        "SYNC_SUCCEEDED",
        "SYNC_FAILED",
        "PUSH_FINISHED",
      ]),
    );
    expect(events).toContainEqual(
      expect.objectContaining({
        type: "PUSH_FINISHED",
        status: "OFFLINE",
      }),
    );
  });

  it("bridge ignores already-running skips so health is not degraded", () => {
    const events = collectBridgeEvents([
      automaticState({
        started: true,
        phase: "IDLE",
        lastRunStartedAt: now,
        lastRunFinishedAt: later,
        lastError: null,
        lastResult: {
          status: "ALREADY_RUNNING",
          startedAt: now,
          finishedAt: later,
        },
      }),
    ]);
    const engine = createSyncStateEngine({
      ...initialSyncState,
      lifecycle: "STARTED",
      phase: "SUCCESS",
      connectivity: "ONLINE",
      lastSuccessfulSyncAt: now,
    });

    engine.dispatchMany(events);

    expect(events.some((event) => event.type === "SYNC_FAILED")).toBe(false);
    expect(engine.getState().lastError).toBeNull();
    expect(selectSyncHealth(engine.getState())).toBe("HEALTHY");
  });

  it("bridge can be disposed and integrates with AutomaticSyncOrchestrator", async () => {
    const engine = createSyncStateEngine();
    const orchestrator = createAutomaticSyncOrchestrator({
      pushCoordinator: successfulPushCoordinator(),
      pullCoordinator: successfulPullCoordinator(),
      scheduler: {
        schedule: () => ({}),
        cancel: () => undefined,
      },
      clock: createClock(),
    });
    const bridge = createOrchestratorSyncStateBridge({
      orchestrator,
      engine,
      clock: createClock(),
    });

    await orchestrator.syncNow();
    expect(engine.getState()).toMatchObject({
      phase: "SUCCESS",
      lastSuccessfulSyncAt: expect.any(String),
    });

    bridge.dispose();
    orchestrator.start();
    expect(engine.getState().lifecycle).toBe("STOPPED");
  });

  it("refreshOutboxState reads indexed counts without loading all records", async () => {
    await resetVinemaDbConnectionForTests();
    await deleteDB(VINEMA_DB_NAME);
    const db = await getVinemaDb();
    await db.put(SYNC_MUTATIONS_STORE, outboxRecord("p", "PENDING"));
    await db.put(SYNC_MUTATIONS_STORE, outboxRecord("r", "PROCESSING"));
    await db.put(SYNC_MUTATIONS_STORE, outboxRecord("f", "FAILED"));
    await db.put(SYNC_MUTATIONS_STORE, outboxRecord("c", "CONFLICT"));
    const engine = createSyncStateEngine();

    await refreshOutboxState({
      workspaceId,
      outboxRepository: new IndexedDbSyncOutboxRepository(),
      engine,
    });

    expect(engine.getState()).toMatchObject({
      pendingMutations: 1,
      processingMutations: 1,
      failedMutations: 1,
      conflictCount: 1,
    });
  });

  it("declares every event type through the reducer", () => {
    const events: SyncEvent[] = [
      { type: "ORCHESTRATOR_STARTED", at: now },
      { type: "ORCHESTRATOR_STOPPED", at: now },
      { type: "SYNC_SCHEDULED", nextRunAt: later },
      { type: "SYNC_STARTED", at: now },
      { type: "PUSH_STARTED", at: now },
      { type: "PUSH_FINISHED", at: now, status: "SUCCESS" },
      { type: "PULL_STARTED", at: now },
      { type: "PULL_FINISHED", at: now, status: "SUCCESS" },
      { type: "SYNC_SUCCEEDED", at: now },
      { type: "SYNC_FAILED", at: now, source: "ORCHESTRATOR", message: "x" },
      { type: "SYNC_CANCELLED", at: now },
      { type: "OUTBOX_COUNTS_CHANGED", pending: 0, processing: 0, failed: 0 },
      { type: "CONFLICT_COUNT_CHANGED", conflicts: 0 },
      { type: "CONNECTIVITY_CHANGED", connectivity: "ONLINE" },
      { type: "AUTHENTICATION_CHANGED", authentication: "UNKNOWN" },
      { type: "ERROR_CLEARED" },
      { type: "STATE_RESET" },
    ];

    expect(() => {
      events.reduce(reduceSyncState, initialSyncState);
    }).not.toThrow();
  });

  it("does not depend on React, window or navigator", () => {
    const source = readFileSync(
      "src/features/sync/sync-state-engine.ts",
      "utf8",
    );

    expect(source).not.toContain("react");
    expect(source).not.toContain("window");
    expect(source).not.toContain("navigator");
  });
});

function collectBridgeEvents(states: AutomaticSyncState[]) {
  const events: SyncEvent[] = [];
  const engine = {
    dispatch(event: SyncEvent) {
      events.push(event);
      return initialSyncState;
    },
    dispatchMany(nextEvents: SyncEvent[]) {
      events.push(...nextEvents);
      return initialSyncState;
    },
  };

  for (let index = 0; index < states.length; index += 1) {
    events.push(...toSyncEvents(states[index - 1] ?? null, states[index], () => now));
  }

  createOrchestratorSyncStateBridge({
    orchestrator: {
      getState: () => states[0],
      subscribe: () => () => undefined,
    },
    engine,
    clock: () => now,
  }).dispose();

  return events;
}

function automaticState(
  overrides: Partial<AutomaticSyncState>,
): AutomaticSyncState {
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
    ...overrides,
  };
}

function successfulPushCoordinator() {
  return {
    async run(): Promise<PushCoordinatorResult> {
      return {
        status: "SUCCESS",
        pushed: 0,
        failed: 0,
        conflicts: 0,
        deferred: 0,
        removedFromOutbox: 0,
        startedAt: now,
        finishedAt: later,
        errors: [],
      };
    },
    cancel: () => undefined,
    isRunning: () => false,
  };
}

function successfulPullCoordinator() {
  return {
    async run(): Promise<PullCoordinatorResult> {
      return {
        status: "SUCCESS",
        pulled: 0,
        applied: 0,
        ignored: 0,
        idempotent: 0,
        conflicts: 0,
        batches: 0,
        startedAt: now,
        finishedAt: later,
        previousCursor: "0",
        nextCursor: "0",
        errors: [],
      };
    },
    cancel: () => undefined,
    isRunning: () => false,
  };
}

function createClock() {
  let current = Date.parse(now);

  return () => {
    const value = new Date(current).toISOString();
    current += 1_000;
    return value;
  };
}

function outboxRecord(
  id: string,
  status: SyncMutationOutboxRecord["status"],
): SyncMutationOutboxRecord {
  return {
    mutationId: `${id}${id}${id}${id}${id}${id}${id}${id}-1111-4111-8111-111111111111`.slice(0, 36),
    workspaceId,
    deviceId,
    mutation: {
      mutationId: `${id}${id}${id}${id}${id}${id}${id}${id}-2222-4222-8222-222222222222`.slice(0, 36),
      entityType: "capture",
      operation: "upsert",
      entityId: "33333333-3333-4333-8333-333333333333",
      baseVersion: null,
      payload: {
        content: "Conteo",
        createdAt: now,
        updatedAt: now,
        archivedAt: null,
      },
    },
    status,
    attemptCount: 0,
    createdAt: now,
    updatedAt: now,
  };
}
