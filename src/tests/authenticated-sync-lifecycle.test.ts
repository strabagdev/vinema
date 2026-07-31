import { describe, expect, it, vi } from "vitest";
import type { PushRequest } from "@vinema/sync-contracts";
import {
  createAuthenticatedSyncLifecycle,
} from "@/features/sync/authenticated-sync-lifecycle";
import { createSyncClient } from "@/features/sync/sync-client";
import type { AuthState } from "@/features/auth/auth-state-engine";

const workspaceId = "22222222-2222-4222-8222-222222222222";
const deviceId = "33333333-3333-4333-8333-333333333333";

describe("authenticated sync lifecycle", () => {
  it("starts sync once for an authenticated session and runs initial sync once", () => {
    const runtime = createRuntimeMock();
    const lifecycle = createAuthenticatedSyncLifecycle({
      createRuntime: vi.fn(() => runtime),
    });

    lifecycle.handleAuthState(authenticatedState());
    lifecycle.handleAuthState(authenticatedState());

    expect(runtime.orchestrator.start).toHaveBeenCalledTimes(2);
    expect(runtime.orchestrator.syncNow).toHaveBeenCalledTimes(1);
  });

  it("does not start during restoring or without workspace/device", () => {
    const createRuntime = vi.fn(() => createRuntimeMock());
    const lifecycle = createAuthenticatedSyncLifecycle({ createRuntime });

    lifecycle.handleAuthState({ ...authenticatedState(), status: "RESTORING" });
    lifecycle.handleAuthState({ ...authenticatedState(), workspaceId: null });
    lifecycle.handleAuthState({ ...authenticatedState(), deviceId: null });

    expect(createRuntime).not.toHaveBeenCalled();
  });

  it("stops and cancels current runs on logout-like states and dispose", () => {
    const runtime = createRuntimeMock();
    const lifecycle = createAuthenticatedSyncLifecycle({
      createRuntime: vi.fn(() => runtime),
    });

    lifecycle.handleAuthState(authenticatedState());
    lifecycle.handleAuthState({ ...authenticatedState(), status: "UNAUTHENTICATED" });

    expect(runtime.orchestrator.stop).toHaveBeenCalledTimes(1);
    expect(runtime.orchestrator.cancelCurrentRun).toHaveBeenCalledTimes(1);

    lifecycle.dispose();
    lifecycle.dispose();

    expect(runtime.dispose).toHaveBeenCalledTimes(1);
  });

  it("recreates sync when workspace or device changes", () => {
    const first = createRuntimeMock();
    const second = createRuntimeMock();
    const createRuntime = vi.fn()
      .mockReturnValueOnce(first)
      .mockReturnValueOnce(second);
    const lifecycle = createAuthenticatedSyncLifecycle({ createRuntime });

    lifecycle.handleAuthState(authenticatedState());
    lifecycle.handleAuthState({
      ...authenticatedState(),
      deviceId: "44444444-4444-4444-8444-444444444444",
    });

    expect(createRuntime).toHaveBeenCalledTimes(2);
    expect(first.dispose).toHaveBeenCalledTimes(1);
    expect(second.orchestrator.syncNow).toHaveBeenCalledTimes(1);
  });

  it("SyncClient uses a dynamic access token provider on every request", async () => {
    let token = "access-token-1";
    const fetchFn = vi.fn(
      async (...args: Parameters<typeof fetch>) => {
        void args;
        return jsonResponse({
          accepted: [],
          rejected: [],
          conflicts: [],
          serverCursor: "1",
        });
      },
    );
    const client = createSyncClient({
      baseUrl: "https://api.example.test",
      accessTokenProvider: {
        getAccessToken: () => token,
      },
      fetchFn: fetchFn as unknown as typeof fetch,
    });

    await client.push(pushRequest());
    token = "access-token-2";
    await client.push(pushRequest());

    expect(fetchFn.mock.calls.map(([, init]) => init?.headers)).toEqual([
      {
        Authorization: "Bearer access-token-1",
        "Content-Type": "application/json",
      },
      {
        Authorization: "Bearer access-token-2",
        "Content-Type": "application/json",
      },
    ]);
  });
});

function authenticatedState(): AuthState {
  return {
    status: "AUTHENTICATED",
    user: {
      id: "11111111-1111-4111-8111-111111111111",
      email: "user@example.test",
      displayName: "User",
    },
    workspaceId,
    deviceId,
    sessionId: "55555555-5555-4555-8555-555555555555",
    accessTokenExpiresAt: "2099-07-30T12:00:00.000Z",
    refreshTokenExpiresAt: "2099-08-29T12:00:00.000Z",
    lastAuthenticatedAt: "2026-07-30T12:00:00.000Z",
    error: null,
  };
}

function pushRequest(): PushRequest {
  return {
    workspaceId,
    deviceId,
    mutations: [],
  };
}

function createRuntimeMock() {
  return {
    orchestrator: {
      start: vi.fn(),
      stop: vi.fn(),
      syncNow: vi.fn(async () => ({
        status: "SUCCESS" as const,
        startedAt: "2026-07-30T12:00:00.000Z",
        finishedAt: "2026-07-30T12:00:01.000Z",
      })),
      cancelCurrentRun: vi.fn(),
    },
    dispose: vi.fn(),
  };
}

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
