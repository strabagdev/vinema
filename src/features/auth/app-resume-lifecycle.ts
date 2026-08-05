import type { AuthState } from "@/features/auth/auth-state-engine";
import type { SyncConnectivity } from "@/features/sync/sync-state-engine";

const DEFAULT_RESUME_DEBOUNCE_MS = 250;

export type AppResumeEventSource =
  | "visibilitychange"
  | "pageshow"
  | "focus"
  | "online"
  | "tauri-resume";

export type AppResumeLifecycle = {
  dispose(): void;
};

export type AppResumeLifecycleConfig = {
  getAuthState(): AuthState;
  revalidate(): Promise<AuthState | null>;
  syncNow(): Promise<void>;
  setConnectivity(connectivity: SyncConnectivity): void;
  isOnline?: () => boolean;
  windowTarget?: Pick<Window, "addEventListener" | "removeEventListener">;
  documentTarget?: Pick<Document, "addEventListener" | "removeEventListener" | "visibilityState">;
  addTauriResumeListener?: (listener: () => void) => () => void;
  setTimeoutFn?: typeof setTimeout;
  clearTimeoutFn?: typeof clearTimeout;
  debounceMs?: number;
  logger?: { warn?(message: string, context?: Record<string, unknown>): void };
};

export function createAppResumeLifecycle({
  getAuthState,
  revalidate,
  syncNow,
  setConnectivity,
  isOnline = defaultIsOnline,
  windowTarget = typeof window === "undefined" ? undefined : window,
  documentTarget = typeof document === "undefined" ? undefined : document,
  addTauriResumeListener,
  setTimeoutFn = setTimeout,
  clearTimeoutFn = clearTimeout,
  debounceMs = DEFAULT_RESUME_DEBOUNCE_MS,
  logger,
}: AppResumeLifecycleConfig): AppResumeLifecycle {
  let disposed = false;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let inFlight: Promise<void> | null = null;
  let pendingSource: AppResumeEventSource | null = null;
  const disposers: Array<() => void> = [];

  function schedule(source: AppResumeEventSource) {
    if (disposed) {
      return;
    }

    pendingSource = source;
    if (timer) {
      clearTimeoutFn(timer);
    }

    timer = setTimeoutFn(() => {
      timer = null;
      const resumeSource = pendingSource;
      pendingSource = null;
      void run(resumeSource ?? source);
    }, debounceMs);
  }

  function onVisibilityChange() {
    if (!documentTarget || documentTarget.visibilityState !== "visible") {
      return;
    }

    schedule("visibilitychange");
  }

  async function run(source: AppResumeEventSource) {
    if (disposed) {
      return;
    }

    if (inFlight) {
      return inFlight;
    }

    inFlight = runResume(source).finally(() => {
      inFlight = null;
    });

    return inFlight;
  }

  async function runResume(source: AppResumeEventSource) {
    const state = getAuthState();
    if (!canResumeAuthenticatedSession(state)) {
      return;
    }

    if (!isOnline()) {
      setConnectivity("OFFLINE");
      return;
    }

    setConnectivity("ONLINE");

    let nextState: AuthState | null = state;
    try {
      nextState = await revalidate();
    } catch (error) {
      logger?.warn?.("resume revalidation failed", {
        source,
        error: error instanceof Error ? error.name : "Unknown",
      });
      nextState = getAuthState();
    }

    const currentState = nextState ?? getAuthState();
    if (currentState.status === "AUTHENTICATED_OFFLINE") {
      setConnectivity("OFFLINE");
      return;
    }

    if (currentState.status !== "AUTHENTICATED_ONLINE") {
      return;
    }

    try {
      await syncNow();
    } catch (error) {
      logger?.warn?.("resume sync failed", {
        source,
        error: error instanceof Error ? error.name : "Unknown",
      });
    }
  }

  if (documentTarget) {
    documentTarget.addEventListener("visibilitychange", onVisibilityChange);
    disposers.push(() =>
      documentTarget.removeEventListener("visibilitychange", onVisibilityChange),
    );
  }

  if (windowTarget) {
    const onPageShow = () => schedule("pageshow");
    const onFocus = () => schedule("focus");
    const onOnline = () => schedule("online");
    windowTarget.addEventListener("pageshow", onPageShow);
    windowTarget.addEventListener("focus", onFocus);
    windowTarget.addEventListener("online", onOnline);
    disposers.push(() => {
      windowTarget.removeEventListener("pageshow", onPageShow);
      windowTarget.removeEventListener("focus", onFocus);
      windowTarget.removeEventListener("online", onOnline);
    });
  }

  if (addTauriResumeListener) {
    disposers.push(addTauriResumeListener(() => schedule("tauri-resume")));
  }

  return {
    dispose() {
      disposed = true;
      if (timer) {
        clearTimeoutFn(timer);
        timer = null;
      }
      for (const dispose of disposers.splice(0)) {
        dispose();
      }
    },
  };
}

function canResumeAuthenticatedSession(state: AuthState) {
  return (
    state.status === "AUTHENTICATED_ONLINE" ||
    state.status === "AUTHENTICATED_OFFLINE" ||
    state.status === "REFRESHING" ||
    state.status === "REVALIDATING"
  );
}

function defaultIsOnline() {
  if (typeof navigator === "undefined") {
    return true;
  }

  return navigator.onLine !== false;
}
