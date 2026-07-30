import "fake-indexeddb/auto";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createAutomaticSyncOrchestrator,
  type AutomaticSyncState,
} from "@/features/sync/automatic-sync-orchestrator";
import type {
  PushCoordinator,
  PushCoordinatorResult,
} from "@/features/sync/push-coordinator";
import type {
  PullCoordinator,
  PullCoordinatorResult,
} from "@/features/sync/pull-coordinator";
import type {
  SyncScheduler,
  SyncSchedulerHandle,
} from "@/features/sync/sync-scheduler";
import {
  createE2eSyncHarness,
  getOutboxRecords,
  makeNode,
  type E2eSyncHarness,
} from "@/tests/e2e-sync-harness";

const pushSuccess: PushCoordinatorResult = {
  status: "SUCCESS",
  pushed: 1,
  failed: 0,
  conflicts: 0,
  deferred: 0,
  removedFromOutbox: 1,
  startedAt: "2026-07-30T12:00:01.000Z",
  finishedAt: "2026-07-30T12:00:02.000Z",
  errors: [],
};

const pullSuccess: PullCoordinatorResult = {
  status: "SUCCESS",
  pulled: 1,
  applied: 1,
  ignored: 0,
  idempotent: 0,
  conflicts: 0,
  batches: 1,
  startedAt: "2026-07-30T12:00:03.000Z",
  finishedAt: "2026-07-30T12:00:04.000Z",
  previousCursor: "0",
  nextCursor: "1",
  errors: [],
};

let harness: E2eSyncHarness | null = null;

afterEach(async () => {
  await harness?.cleanup();
  harness = null;
});

describe("automatic sync orchestrator", () => {
  it("start schedules one initial cycle, is idempotent and respects initial delay", () => {
    const setup = createSetup({
      config: { initialSyncDelayMs: 5_000, syncIntervalMs: 30_000 },
    });

    setup.orchestrator.start();
    setup.orchestrator.start();

    expect(setup.scheduler.handles).toHaveLength(1);
    expect(setup.scheduler.handles[0]).toMatchObject({
      delayMs: 5_000,
      active: true,
    });
    expect(setup.orchestrator.getState()).toMatchObject({
      started: true,
      running: false,
      phase: "WAITING",
      nextRunAt: "2026-07-30T12:00:05.000Z",
    });
  });

  it("runOnStart false schedules the regular interval without running immediately", () => {
    const setup = createSetup({
      config: { runOnStart: false, syncIntervalMs: 45_000 },
    });

    setup.orchestrator.start();

    expect(setup.scheduler.handles).toHaveLength(1);
    expect(setup.scheduler.handles[0]?.delayMs).toBe(45_000);
    expect(setup.push.run).not.toHaveBeenCalled();
  });

  it("executes Push then Pull and schedules the next cycle after success", async () => {
    const setup = createSetup({ config: { syncIntervalMs: 10_000 } });
    const phases: AutomaticSyncState["phase"][] = [];
    setup.orchestrator.subscribe((state) => phases.push(state.phase));

    const result = await setup.orchestrator.syncNow();

    expect(result.status).toBe("SUCCESS");
    expect(setup.order).toEqual(["push", "pull"]);
    expect(phases).toContain("PUSHING");
    expect(phases).toContain("PULLING");
    expect(setup.orchestrator.getState()).toMatchObject({
      running: false,
      phase: "SUCCESS",
      lastSuccessfulSyncAt: "2026-07-30T12:00:01.000Z",
      lastError: null,
    });
    expect(setup.scheduler.handles).toHaveLength(0);

    setup.orchestrator.start();
    await setup.scheduler.fireNext();
    expect(setup.scheduler.handles.at(-1)?.delayMs).toBe(10_000);
  });

  it("does not run Pull when Push fails and can continue after error", async () => {
    const setup = createSetup({
      pushResults: [
        {
          ...pushSuccess,
          status: "FAILED",
          pushed: 0,
          failed: 1,
          removedFromOutbox: 0,
          errors: [{ code: "SERVER_ERROR", message: "Temporal" }],
        },
      ],
    });
    setup.orchestrator.start();
    await setup.scheduler.fireNext();

    expect(setup.orchestrator.getState().lastResult).toMatchObject({
      status: "PUSH_FAILED",
    });
    expect(setup.pull.run).not.toHaveBeenCalled();
    expect(setup.orchestrator.getState()).toMatchObject({
      started: true,
      running: false,
      phase: "WAITING",
      lastError: {
        stage: "PUSH",
        code: "SERVER_ERROR",
      },
    });
    expect(setup.scheduler.activeCount()).toBe(1);
  });

  it("continueAfterError false stops future scheduling after a failed cycle", async () => {
    const setup = createSetup({
      config: { continueAfterError: false },
      pullResults: [
        {
          ...pullSuccess,
          status: "FAILED",
          applied: 0,
          errors: [{ code: "NETWORK_ERROR", message: "Offline" }],
        },
      ],
    });
    setup.orchestrator.start();
    await setup.scheduler.fireNext();

    expect(setup.orchestrator.getState().lastResult).toMatchObject({
      status: "PULL_FAILED",
    });
    expect(setup.orchestrator.getState()).toMatchObject({
      started: false,
      phase: "ERROR",
      nextRunAt: null,
    });
    expect(setup.scheduler.activeCount()).toBe(0);
  });

  it("syncNow works without start and returns ALREADY_RUNNING during an active run", async () => {
    const deferredPush = createDeferred<PushCoordinatorResult>();
    const setup = createSetup({
      pushRun: () => deferredPush.promise,
    });

    const firstRun = setup.orchestrator.syncNow();
    const skipped = await setup.orchestrator.syncNow();
    deferredPush.resolve(pushSuccess);
    const result = await firstRun;

    expect(skipped.status).toBe("ALREADY_RUNNING");
    expect(result.status).toBe("SUCCESS");
    expect(setup.push.run).toHaveBeenCalledTimes(1);
  });

  it("timer firing while a manual run is active skips instead of queueing another run", async () => {
    const deferredPush = createDeferred<PushCoordinatorResult>();
    const setup = createSetup({
      pushRun: () => deferredPush.promise,
    });
    setup.orchestrator.start();
    await setup.scheduler.fireNext();
    const skipped = await setup.orchestrator.syncNow();
    deferredPush.resolve(pushSuccess);
    await flushPromises();

    expect(skipped.status).toBe("ALREADY_RUNNING");
    expect(setup.push.run).toHaveBeenCalledTimes(1);
  });

  it("stop is idempotent, cancels future timers and does not cancel an active run", async () => {
    const deferredPush = createDeferred<PushCoordinatorResult>();
    const setup = createSetup({
      pushRun: () => deferredPush.promise,
    });
    setup.orchestrator.start();
    await setup.scheduler.fireNext();

    setup.orchestrator.stop();
    setup.orchestrator.stop();
    expect(setup.push.cancel).not.toHaveBeenCalled();
    expect(setup.orchestrator.getState()).toMatchObject({
      started: false,
      running: true,
      phase: "PUSHING",
      nextRunAt: null,
    });

    deferredPush.resolve(pushSuccess);
    await flushPromises();
    expect(setup.orchestrator.getState()).toMatchObject({
      started: false,
      running: false,
      phase: "SUCCESS",
    });
    expect(setup.scheduler.activeCount()).toBe(0);
  });

  it("cancelCurrentRun cancels Push and a later execution can succeed", async () => {
    const setup = createSetup({
      pushResults: [
        {
          ...pushSuccess,
          status: "CANCELLED",
          pushed: 0,
          removedFromOutbox: 0,
        },
        pushSuccess,
      ],
    });
    const first = setup.orchestrator.syncNow();
    setup.orchestrator.cancelCurrentRun();
    await expect(first).resolves.toMatchObject({
      status: "CANCELLED",
      cancelledStage: "PUSH",
    });
    expect(setup.push.cancel).toHaveBeenCalledTimes(1);
    expect(setup.orchestrator.getState()).toMatchObject({
      running: false,
      phase: "CANCELLED",
    });

    await expect(setup.orchestrator.syncNow()).resolves.toMatchObject({
      status: "SUCCESS",
    });
  });

  it("cancelCurrentRun cancels Pull and clears running state", async () => {
    const deferredPull = createDeferred<PullCoordinatorResult>();
    const setup = createSetup({
      pullRun: () => deferredPull.promise,
    });
    const result = setup.orchestrator.syncNow();
    await waitForPhase(setup.orchestrator.getState, "PULLING");
    setup.orchestrator.cancelCurrentRun();
    deferredPull.resolve({ ...pullSuccess, status: "CANCELLED", applied: 0 });

    await expect(result).resolves.toMatchObject({
      status: "CANCELLED",
      cancelledStage: "PULL",
    });
    expect(setup.pull.cancel).toHaveBeenCalledTimes(1);
    expect(setup.orchestrator.getState()).toMatchObject({
      running: false,
      phase: "CANCELLED",
    });
  });

  it("clears lastError after a later success", async () => {
    const setup = createSetup({
      pushResults: [
        {
          ...pushSuccess,
          status: "FAILED",
          failed: 1,
          errors: [{ code: "SERVER_ERROR", message: "Temporal" }],
        },
        pushSuccess,
      ],
    });

    await setup.orchestrator.syncNow();
    expect(setup.orchestrator.getState().lastError).toMatchObject({
      code: "SERVER_ERROR",
    });
    await setup.orchestrator.syncNow();
    expect(setup.orchestrator.getState().lastError).toBeNull();
  });

  it("subscribe, unsubscribe and listener failures are isolated", async () => {
    const setup = createSetup();
    const good = vi.fn();
    const failing = vi.fn(() => {
      throw new Error("listener failed");
    });
    const unsubscribeGood = setup.orchestrator.subscribe(good);
    setup.orchestrator.subscribe(failing);

    await setup.orchestrator.syncNow();
    unsubscribeGood();
    await setup.orchestrator.syncNow();

    expect(good).toHaveBeenCalled();
    expect(failing).toHaveBeenCalled();
    const goodCallsAfterUnsubscribe = good.mock.calls.length;
    expect(good).toHaveBeenCalledTimes(goodCallsAfterUnsubscribe);
    expect(setup.logs.some((entry) => entry.message === "sync_state_listener_failed")).toBe(
      true,
    );
  });

  it("getState returns a defensive copy", () => {
    const setup = createSetup();
    const state = setup.orchestrator.getState();
    state.phase = "ERROR";
    state.lastError = { stage: "ORCHESTRATOR", message: "mutated" };

    expect(setup.orchestrator.getState()).toMatchObject({
      phase: "IDLE",
      lastError: null,
    });
  });

  it("logs expected events without payload data", async () => {
    const setup = createSetup();

    await setup.orchestrator.syncNow();

    expect(setup.logs.map((entry) => entry.message)).toEqual(
      expect.arrayContaining([
        "sync_cycle_started",
        "push_started",
        "push_finished",
        "pull_started",
        "pull_finished",
        "sync_cycle_succeeded",
      ]),
    );
    expect(JSON.stringify(setup.logs)).not.toContain("Captura");
    expect(JSON.stringify(setup.logs)).not.toContain("Authorization");
  });

  it("unexpected coordinator exceptions do not leave the orchestrator running", async () => {
    const setup = createSetup({
      pushRun: () => {
        throw new Error("boom");
      },
    });

    await expect(setup.orchestrator.syncNow()).resolves.toMatchObject({
      status: "FAILED",
      error: { stage: "PUSH", message: "boom" },
    });
    expect(setup.orchestrator.getState()).toMatchObject({
      running: false,
      phase: "ERROR",
    });
  });

  it("scheduler errors are reflected in state without throwing", () => {
    const setup = createSetup();
    const orchestrator = createAutomaticSyncOrchestrator({
      pushCoordinator: setup.push,
      pullCoordinator: setup.pull,
      clock: setup.clock,
      scheduler: {
        schedule() {
          throw new Error("scheduler unavailable");
        },
        cancel() {
          throw new Error("cancel unavailable");
        },
      },
      logger: {
        error: (message, context) =>
          setup.logs.push({ level: "error", message, context }),
      },
    });

    expect(() => orchestrator.start()).not.toThrow();
    expect(orchestrator.getState()).toMatchObject({
      started: true,
      phase: "ERROR",
      lastError: {
        stage: "ORCHESTRATOR",
        message: "scheduler unavailable",
      },
    });
  });

  it("integrates with real coordinators for one Push -> Pull cycle", async () => {
    harness = await createE2eSyncHarness();
    const { deviceA, deviceB, workspaceId } = harness;
    const node = makeNode({
      workspaceId,
      deviceId: deviceA.device.id,
      content: "Captura orquestada.",
    });
    await harness.runOnDevice(deviceA, () =>
      deviceA.repositories.nodeRepository.create(node),
    );

    const orchestrator = createAutomaticSyncOrchestrator({
      pushCoordinator: {
        run: () => harness!.runOnDevice(deviceA, () => deviceA.pushCoordinator.run()),
        cancel: () => deviceA.pushCoordinator.cancel(),
        isRunning: () => deviceA.pushCoordinator.isRunning(),
      },
      pullCoordinator: {
        run: () => harness!.runOnDevice(deviceB, () => deviceB.pullCoordinator.run()),
        cancel: () => deviceB.pullCoordinator.cancel(),
        isRunning: () => deviceB.pullCoordinator.isRunning(),
      },
      scheduler: createFakeScheduler(),
      clock: createClock(),
    });

    await expect(orchestrator.syncNow()).resolves.toMatchObject({
      status: "SUCCESS",
    });
    await harness.runOnDevice(deviceB, async () => {
      expect(await getOutboxRecords()).toHaveLength(0);
    });
    expect((await harness.compareDevices()).converged).toBe(true);
  });
});

type SetupOptions = {
  config?: Parameters<typeof createAutomaticSyncOrchestrator>[0]["config"];
  pushResults?: PushCoordinatorResult[];
  pullResults?: PullCoordinatorResult[];
  pushRun?: () => Promise<PushCoordinatorResult> | PushCoordinatorResult;
  pullRun?: () => Promise<PullCoordinatorResult> | PullCoordinatorResult;
};

function createSetup(options: SetupOptions = {}) {
  const scheduler = createFakeScheduler();
  const clock = createClock();
  const order: string[] = [];
  const logs: Array<{ level: string; message: string; context?: Record<string, unknown> }> = [];
  const pushResults = [...(options.pushResults ?? [pushSuccess])];
  const pullResults = [...(options.pullResults ?? [pullSuccess])];
  let pushRunning = false;
  let pullRunning = false;
  const push: Pick<PushCoordinator, "run" | "cancel" | "isRunning"> = {
    run: vi.fn(async () => {
      order.push("push");
      pushRunning = true;
      try {
        return options.pushRun ? await options.pushRun() : (pushResults.shift() ?? pushSuccess);
      } finally {
        pushRunning = false;
      }
    }),
    cancel: vi.fn(),
    isRunning: vi.fn(() => pushRunning),
  };
  const pull: Pick<PullCoordinator, "run" | "cancel" | "isRunning"> = {
    run: vi.fn(async () => {
      order.push("pull");
      pullRunning = true;
      try {
        return options.pullRun ? await options.pullRun() : (pullResults.shift() ?? pullSuccess);
      } finally {
        pullRunning = false;
      }
    }),
    cancel: vi.fn(),
    isRunning: vi.fn(() => pullRunning),
  };

  return {
    scheduler,
    clock,
    order,
    logs,
    push,
    pull,
    orchestrator: createAutomaticSyncOrchestrator({
      pushCoordinator: push,
      pullCoordinator: pull,
      scheduler,
      clock,
      config: options.config,
      logger: {
        debug: (message, context) => logs.push({ level: "debug", message, context }),
        info: (message, context) => logs.push({ level: "info", message, context }),
        warn: (message, context) => logs.push({ level: "warn", message, context }),
        error: (message, context) => logs.push({ level: "error", message, context }),
      },
    }),
  };
}

function createClock(start = "2026-07-30T12:00:00.000Z") {
  let current = Date.parse(start);

  return () => {
    const value = new Date(current).toISOString();
    current += 1_000;
    return value;
  };
}

function createDeferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((innerResolve, innerReject) => {
    resolve = innerResolve;
    reject = innerReject;
  });

  return { promise, resolve, reject };
}

async function flushPromises() {
  await Promise.resolve();
  await Promise.resolve();
}

async function waitForPhase(
  getState: () => AutomaticSyncState,
  phase: AutomaticSyncState["phase"],
) {
  for (let attempt = 0; attempt < 10; attempt += 1) {
    if (getState().phase === phase) {
      return;
    }

    await flushPromises();
  }

  throw new Error(`Expected phase ${phase}, got ${getState().phase}.`);
}

function createFakeScheduler(): SyncScheduler & {
  handles: Array<{
    id: number;
    delayMs: number;
    callback: () => void;
    active: boolean;
  }>;
  fireNext(): Promise<void>;
  activeCount(): number;
} {
  const handles: Array<{
    id: number;
    delayMs: number;
    callback: () => void;
    active: boolean;
  }> = [];
  let nextId = 1;

  return {
    handles,
    schedule(callback, delayMs): SyncSchedulerHandle {
      const handle = { id: nextId, delayMs, callback, active: true };
      nextId += 1;
      handles.push(handle);
      return handle;
    },
    cancel(handle) {
      const found = handles.find((candidate) => candidate === handle);
      if (found) {
        found.active = false;
      }
    },
    async fireNext() {
      const handle = handles.find((candidate) => candidate.active);
      if (!handle) {
        return undefined;
      }

      handle.active = false;
      const listener = () => undefined;
      process.once("unhandledRejection", listener);
      try {
        handle.callback();
        await Promise.resolve();
        await Promise.resolve();
      } finally {
        process.removeListener("unhandledRejection", listener);
      }
    },
    activeCount() {
      return handles.filter((handle) => handle.active).length;
    },
  };
}
