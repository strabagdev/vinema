import { describe, expect, it, vi } from "vitest";
import {
  createAppResumeLifecycle,
  type AppResumeEventSource,
} from "@/features/auth/app-resume-lifecycle";
import type { AuthState } from "@/features/auth/auth-state-engine";
import type { SyncConnectivity } from "@/features/sync/sync-state-engine";

const user = {
  id: "11111111-1111-4111-8111-111111111111",
  email: "user@example.test",
  displayName: "User",
};
const workspaceId = "22222222-2222-4222-8222-222222222222";
const deviceId = "33333333-3333-4333-8333-333333333333";

describe("app resume lifecycle", () => {
  it("resumes from visibilitychange when the document becomes visible", async () => {
    const setup = createSetup();

    setup.document.setVisibility("hidden");
    setup.document.setVisibility("visible");
    setup.clock.flush();
    await flush();

    expect(setup.revalidate).toHaveBeenCalledTimes(1);
    expect(setup.syncNow).toHaveBeenCalledTimes(1);
    expect(setup.connectivity).toEqual(["ONLINE"]);
  });

  it("resumes from pageshow, focus and online", async () => {
    for (const eventName of ["pageshow", "focus", "online"] as const) {
      const setup = createSetup();

      setup.window.dispatch(eventName);
      setup.clock.flush();
      await flush();

      expect(setup.revalidate).toHaveBeenCalledTimes(1);
      expect(setup.syncNow).toHaveBeenCalledTimes(1);
    }
  });

  it("coalesces multiple resume events into one cycle", async () => {
    const setup = createSetup();

    setup.document.setVisibility("visible");
    setup.window.dispatch("pageshow");
    setup.window.dispatch("focus");
    setup.window.dispatch("online");
    setup.clock.flush();
    await flush();

    expect(setup.revalidate).toHaveBeenCalledTimes(1);
    expect(setup.syncNow).toHaveBeenCalledTimes(1);
  });

  it("does not issue useless requests while the runtime is offline", async () => {
    const setup = createSetup({ online: false });

    setup.window.dispatch("focus");
    setup.clock.flush();
    await flush();

    expect(setup.revalidate).not.toHaveBeenCalled();
    expect(setup.syncNow).not.toHaveBeenCalled();
    expect(setup.connectivity).toEqual(["OFFLINE"]);
  });

  it("does not revalidate or sync local-only sessions on resume", async () => {
    const setup = createSetup();
    setup.state = authState("AUTHENTICATED_LOCAL");

    setup.window.dispatch("focus");
    setup.clock.flush();
    await flush();

    expect(setup.revalidate).not.toHaveBeenCalled();
    expect(setup.syncNow).not.toHaveBeenCalled();
    expect(setup.connectivity).toEqual([]);
  });

  it("does not clear a temporary network session and avoids sync while auth is offline", async () => {
    const setup = createSetup({
      revalidate: vi.fn(async () => {
        setup.state = authState("AUTHENTICATED_OFFLINE");
        return setup.state;
      }),
    });

    setup.window.dispatch("focus");
    setup.clock.flush();
    await flush();

    expect(setup.revalidate).toHaveBeenCalledTimes(1);
    expect(setup.syncNow).not.toHaveBeenCalled();
    expect(setup.state.status).toBe("AUTHENTICATED_OFFLINE");
    expect(setup.connectivity).toEqual(["ONLINE", "OFFLINE"]);
  });

  it("does not sync after a confirmed expired session becomes unauthenticated", async () => {
    const setup = createSetup({
      revalidate: vi.fn(async () => {
        setup.state = authState("UNAUTHENTICATED");
        return setup.state;
      }),
    });

    setup.window.dispatch("pageshow");
    setup.clock.flush();
    await flush();

    expect(setup.revalidate).toHaveBeenCalledTimes(1);
    expect(setup.syncNow).not.toHaveBeenCalled();
    expect(setup.state.status).toBe("UNAUTHENTICATED");
  });

  it("uses the optional Tauri resume listener when one is provided", async () => {
    const tauriResumeListeners: Array<() => void> = [];
    const setup = createSetup({
      addTauriResumeListener(listener) {
        tauriResumeListeners.push(listener);
        return () => {
          tauriResumeListeners.splice(tauriResumeListeners.indexOf(listener), 1);
        };
      },
    });

    tauriResumeListeners[0]?.();
    setup.clock.flush();
    await flush();

    expect(setup.revalidate).toHaveBeenCalledTimes(1);
    expect(setup.syncNow).toHaveBeenCalledTimes(1);
  });

  it("does not duplicate timers or sync when a resume cycle is already in flight", async () => {
    const resolvers: Array<(state: AuthState) => void> = [];
    const setup = createSetup({
      revalidate: vi.fn(
        () =>
          new Promise<AuthState>((resolve) => {
            resolvers.push(resolve);
          }),
      ),
    });

    setup.window.dispatch("focus");
    setup.clock.flush();
    setup.window.dispatch("online");
    setup.clock.flush();
    await flush();

    expect(setup.revalidate).toHaveBeenCalledTimes(1);
    resolvers[0]?.(setup.state);
    await flush();

    expect(setup.syncNow).toHaveBeenCalledTimes(1);
  });
});

function createSetup({
  online = true,
  revalidate,
  addTauriResumeListener,
}: {
  online?: boolean;
  revalidate?: () => Promise<AuthState | null>;
  addTauriResumeListener?: (listener: () => void) => () => void;
} = {}) {
  const windowTarget = new FakeEventTarget();
  const documentTarget = new FakeDocumentTarget();
  const clock = new FakeClock();
  const connectivity: SyncConnectivity[] = [];
  let state = authState("AUTHENTICATED_ONLINE");
  const defaultRevalidate = vi.fn(async () => state);
  const setup: {
    state: AuthState;
    window: FakeEventTarget;
    document: FakeDocumentTarget;
    clock: FakeClock;
    connectivity: SyncConnectivity[];
    revalidate: () => Promise<AuthState | null>;
    syncNow: () => Promise<void>;
    lifecycle: ReturnType<typeof createAppResumeLifecycle> | null;
  } = {
    state: authState("AUTHENTICATED_ONLINE"),
    window: windowTarget,
    document: documentTarget,
    clock,
    connectivity,
    revalidate: revalidate ?? defaultRevalidate,
    syncNow: vi.fn(async () => undefined),
    lifecycle: null,
  };
  Object.defineProperty(setup, "state", {
    get: () => state,
    set: (next: AuthState) => {
      state = next;
    },
  });

  setup.lifecycle = createAppResumeLifecycle({
    getAuthState: () => setup.state,
    revalidate: setup.revalidate,
    syncNow: setup.syncNow,
    setConnectivity: (value) => connectivity.push(value),
    isOnline: () => online,
    windowTarget: windowTarget as unknown as Window,
    documentTarget: documentTarget as unknown as Document,
    setTimeoutFn: clock.setTimeout as unknown as typeof setTimeout,
    clearTimeoutFn: clock.clearTimeout as unknown as typeof clearTimeout,
    debounceMs: 20,
    addTauriResumeListener,
  });

  return setup;
}

function authState(status: AuthState["status"]): AuthState {
  const authenticated = status !== "UNAUTHENTICATED";
  const local = status === "AUTHENTICATED_LOCAL";

  return {
    status,
    user: authenticated ? user : null,
    workspaceId: authenticated ? workspaceId : null,
    deviceId: authenticated ? deviceId : null,
    sessionId: !authenticated
      ? null
      : "44444444-4444-4444-8444-444444444444",
    accessTokenExpiresAt: !authenticated || local
      ? null
      : "2099-07-30T12:15:00.000Z",
    refreshTokenExpiresAt: !authenticated || local
      ? null
      : "2099-08-29T12:00:00.000Z",
    lastAuthenticatedAt: !authenticated
      ? null
      : "2026-07-30T12:00:00.000Z",
    sessionMode: local ? "local" : authenticated ? "remote" : null,
    error: null,
  };
}

class FakeEventTarget {
  private readonly listeners = new Map<string, Set<() => void>>();

  addEventListener(type: string, listener: () => void) {
    const listeners = this.listeners.get(type) ?? new Set<() => void>();
    listeners.add(listener);
    this.listeners.set(type, listeners);
  }

  removeEventListener(type: string, listener: () => void) {
    this.listeners.get(type)?.delete(listener);
  }

  dispatch(type: Exclude<AppResumeEventSource, "visibilitychange" | "tauri-resume">) {
    for (const listener of this.listeners.get(type) ?? []) {
      listener();
    }
  }
}

class FakeDocumentTarget extends FakeEventTarget {
  visibilityState: DocumentVisibilityState = "visible";

  setVisibility(value: DocumentVisibilityState) {
    this.visibilityState = value;
    for (const listener of this.listenersForVisibility()) {
      listener();
    }
  }

  private listenersForVisibility() {
    const own = this as unknown as {
      listeners: Map<string, Set<() => void>>;
    };
    return own.listeners.get("visibilitychange") ?? [];
  }
}

class FakeClock {
  private nextId = 1;
  private readonly timers = new Map<number, () => void>();

  setTimeout = (callback: () => void) => {
    const id = this.nextId;
    this.nextId += 1;
    this.timers.set(id, callback);
    return id as unknown as ReturnType<typeof setTimeout>;
  };

  clearTimeout = (handle: ReturnType<typeof setTimeout>) => {
    this.timers.delete(handle as unknown as number);
  };

  flush() {
    const callbacks = Array.from(this.timers.values());
    this.timers.clear();
    callbacks.forEach((callback) => callback());
  }
}

async function flush() {
  await Promise.resolve();
  await Promise.resolve();
}
