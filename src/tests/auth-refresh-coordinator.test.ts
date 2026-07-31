import { describe, expect, it, vi } from "vitest";
import { AuthClientError } from "@/features/auth/auth-client";
import {
  AUTH_REFRESH_EARLY_MS,
  AUTH_REFRESH_RETRY_DELAYS_MS,
  AuthRefreshCancelledError,
  AuthRefreshScheduleError,
  createAuthRefreshCoordinator,
  type AuthClock,
  type AuthVisibilityDocument,
} from "@/features/auth/auth-refresh-coordinator";

const startMs = Date.parse("2026-07-30T12:00:00.000Z");

describe("AuthRefreshCoordinator", () => {
  it("programs refresh before expiration and reschedules after success", async () => {
    const clock = new FakeAuthClock(startMs);
    const refresh = vi.fn(async () => ({
      accessTokenExpiresAt: iso(clock.now() + 15 * 60_000),
    }));
    const coordinator = createAuthRefreshCoordinator({ refresh, clock });

    coordinator.schedule(iso(startMs + 15 * 60_000));

    expect(clock.pendingCount()).toBe(1);
    clock.advance(15 * 60_000 - AUTH_REFRESH_EARLY_MS - 1);
    await flush();
    expect(refresh).not.toHaveBeenCalled();

    clock.advance(1);
    await flush();

    expect(refresh).toHaveBeenCalledTimes(1);
    expect(clock.pendingCount()).toBe(1);
  });

  it("refreshes immediately for near or expired tokens and rejects invalid dates", async () => {
    const clock = new FakeAuthClock(startMs);
    const refresh = vi.fn(async () => ({
      accessTokenExpiresAt: iso(clock.now() + 15 * 60_000),
    }));
    const coordinator = createAuthRefreshCoordinator({ refresh, clock });

    coordinator.schedule(iso(startMs + 30_000));
    await flush();
    expect(refresh).toHaveBeenCalledTimes(1);

    coordinator.schedule(iso(startMs - 1_000));
    await flush();
    expect(refresh).toHaveBeenCalledTimes(2);

    expect(() => coordinator.schedule("not-a-date")).toThrow(AuthRefreshScheduleError);
  });

  it("cancels timers, disposes listeners and ignores late results", async () => {
    const clock = new FakeAuthClock(startMs);
    const visibility = new FakeVisibilityDocument();
    let resolveRefresh: ((value: { accessTokenExpiresAt: string }) => void) | undefined;
    const refresh = vi.fn(
      () => new Promise<{ accessTokenExpiresAt: string }>((resolve) => {
        resolveRefresh = resolve;
      }),
    );
    const coordinator = createAuthRefreshCoordinator({
      refresh,
      clock,
      visibilityDocument: visibility,
    });

    coordinator.schedule(iso(startMs + 15 * 60_000));
    expect(clock.pendingCount()).toBe(1);
    coordinator.cancel();
    expect(clock.pendingCount()).toBe(0);

    const pending = coordinator.refreshNow();
    coordinator.dispose();
    resolveRefresh?.({ accessTokenExpiresAt: iso(startMs + 20 * 60_000) });

    await expect(pending).rejects.toBeInstanceOf(AuthRefreshCancelledError);
    expect(visibility.listenerCount()).toBe(0);
    expect(clock.pendingCount()).toBe(0);
  });

  it("uses single-flight for concurrent refresh calls", async () => {
    const clock = new FakeAuthClock(startMs);
    let resolveRefresh: ((value: { accessTokenExpiresAt: string }) => void) | undefined;
    const refresh = vi.fn(
      () => new Promise<{ accessTokenExpiresAt: string }>((resolve) => {
        resolveRefresh = resolve;
      }),
    );
    const coordinator = createAuthRefreshCoordinator({ refresh, clock });

    const first = coordinator.refreshNow();
    const second = coordinator.refreshNow();

    expect(first).toBe(second);
    expect(refresh).toHaveBeenCalledTimes(1);

    resolveRefresh?.({ accessTokenExpiresAt: iso(startMs + 15 * 60_000) });
    await expect(first).resolves.toMatchObject({
      accessTokenExpiresAt: iso(startMs + 15 * 60_000),
    });
  });

  it("retries temporary refresh failures and does not retry definitive failures", async () => {
    const clock = new FakeAuthClock(startMs);
    const refresh = vi
      .fn()
      .mockRejectedValueOnce(new AuthClientError("NETWORK_ERROR", "Offline"))
      .mockRejectedValueOnce(new AuthClientError("SERVER_ERROR", "Server down", 500))
      .mockResolvedValueOnce({ accessTokenExpiresAt: iso(startMs + 15 * 60_000) });
    const coordinator = createAuthRefreshCoordinator({ refresh, clock });

    const pending = coordinator.refreshNow();
    await flush();
    expect(refresh).toHaveBeenCalledTimes(1);

    clock.advance(AUTH_REFRESH_RETRY_DELAYS_MS[0]);
    await flush();
    expect(refresh).toHaveBeenCalledTimes(2);

    clock.advance(AUTH_REFRESH_RETRY_DELAYS_MS[1]);
    await flush();

    await expect(pending).resolves.toMatchObject({
      accessTokenExpiresAt: iso(startMs + 15 * 60_000),
    });
    expect(refresh).toHaveBeenCalledTimes(3);

    const definitive = createAuthRefreshCoordinator({
      refresh: vi.fn(async () => {
        throw new AuthClientError("TOKEN_INVALID", "Invalid", 401);
      }),
      clock: new FakeAuthClock(startMs),
    });

    await expect(definitive.refreshNow()).rejects.toMatchObject({ code: "TOKEN_INVALID" });
  });

  it("handles visibility changes without duplicating refresh", async () => {
    const clock = new FakeAuthClock(startMs);
    const visibility = new FakeVisibilityDocument();
    const refresh = vi.fn(async () => ({
      accessTokenExpiresAt: iso(clock.now() + 15 * 60_000),
    }));
    const coordinator = createAuthRefreshCoordinator({
      refresh,
      clock,
      visibilityDocument: visibility,
    });

    coordinator.schedule(iso(startMs + 30_000));
    visibility.setVisibility("hidden");
    visibility.setVisibility("visible");
    visibility.setVisibility("visible");
    await flush();

    expect(refresh).toHaveBeenCalledTimes(1);
  });
});

function iso(timestamp: number) {
  return new Date(timestamp).toISOString();
}

async function flush() {
  await Promise.resolve();
  await Promise.resolve();
}

class FakeAuthClock implements AuthClock {
  private nextId = 1;
  private readonly timers = new Map<number, { at: number; callback: () => void }>();

  constructor(private current: number) {}

  now() {
    return this.current;
  }

  setTimeout(callback: () => void, delayMs: number) {
    const id = this.nextId;
    this.nextId += 1;
    this.timers.set(id, { at: this.current + delayMs, callback });
    return id;
  }

  clearTimeout(handle: unknown) {
    this.timers.delete(Number(handle));
  }

  advance(delayMs: number) {
    this.current += delayMs;
    const due = [...this.timers.entries()]
      .filter(([, timer]) => timer.at <= this.current)
      .sort(([, first], [, second]) => first.at - second.at);

    for (const [id, timer] of due) {
      if (!this.timers.has(id)) {
        continue;
      }
      this.timers.delete(id);
      timer.callback();
    }
  }

  pendingCount() {
    return this.timers.size;
  }
}

class FakeVisibilityDocument implements AuthVisibilityDocument {
  visibilityState: DocumentVisibilityState = "visible";
  private readonly listeners = new Set<() => void>();

  addEventListener(type: "visibilitychange", listener: () => void) {
    void type;
    this.listeners.add(listener);
  }

  removeEventListener(type: "visibilitychange", listener: () => void) {
    void type;
    this.listeners.delete(listener);
  }

  setVisibility(visibilityState: DocumentVisibilityState) {
    this.visibilityState = visibilityState;
    for (const listener of this.listeners) {
      listener();
    }
  }

  listenerCount() {
    return this.listeners.size;
  }
}
