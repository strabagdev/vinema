import type { AuthState } from "@/features/auth/auth-state-engine";
import type { AutomaticSyncOrchestrator } from "@/features/sync/automatic-sync-orchestrator";

export type AuthenticatedSyncRuntime = {
  orchestrator: Pick<
    AutomaticSyncOrchestrator,
    "start" | "stop" | "syncNow" | "cancelCurrentRun"
  >;
  dispose?(): void;
};

export type AuthenticatedSyncLifecycle = {
  handleAuthState(state: AuthState): void;
  syncNow(): Promise<void>;
  stop(): void;
  dispose(): void;
};

export type AuthenticatedSyncLifecycleConfig = {
  createRuntime(input: {
    workspaceId: string;
    deviceId: string;
  }): AuthenticatedSyncRuntime;
  logger?: { warn?(message: string, context?: Record<string, unknown>): void };
};

export function createAuthenticatedSyncLifecycle({
  createRuntime,
  logger,
}: AuthenticatedSyncLifecycleConfig): AuthenticatedSyncLifecycle {
  let activeKey: string | null = null;
  let runtime: AuthenticatedSyncRuntime | null = null;
  let initialSyncStarted = false;

  function handleAuthState(state: AuthState) {
    if (state.status !== "AUTHENTICATED_ONLINE") {
      stop();
      return;
    }

    if (!state.workspaceId || !state.deviceId) {
      stop();
      return;
    }

    const key = `${state.workspaceId}:${state.deviceId}`;
    if (!runtime || activeKey !== key) {
      disposeRuntime();
      runtime = createRuntime({
        workspaceId: state.workspaceId,
        deviceId: state.deviceId,
      });
      activeKey = key;
      initialSyncStarted = false;
    }

    runtime.orchestrator.start();
    if (!initialSyncStarted) {
      initialSyncStarted = true;
      void runtime.orchestrator.syncNow().catch((error) => {
        logger?.warn?.("initial authenticated sync failed", {
          error: error instanceof Error ? error.name : "Unknown",
        });
      });
    }
  }

  function stop() {
    runtime?.orchestrator.stop();
    runtime?.orchestrator.cancelCurrentRun();
  }

  async function syncNow() {
    await runtime?.orchestrator.syncNow();
  }

  function dispose() {
    stop();
    disposeRuntime();
  }

  function disposeRuntime() {
    runtime?.dispose?.();
    runtime = null;
    activeKey = null;
    initialSyncStarted = false;
  }

  return {
    handleAuthState,
    syncNow,
    stop,
    dispose,
  };
}
