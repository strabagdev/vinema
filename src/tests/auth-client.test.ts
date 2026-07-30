import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import {
  AuthClientError,
  createAuthClient,
} from "@/features/auth/auth-client";
import { createAuthService } from "@/features/auth/auth-service";
import {
  createAuthStateEngine,
  initialAuthState,
  reduceAuthState,
} from "@/features/auth/auth-state-engine";
import { createAuthSyncStateBridge } from "@/features/auth/auth-sync-state-bridge";
import type { DeviceIdentityProvider } from "@/features/auth/device-identity-provider";
import { createSyncStateEngine } from "@/features/sync/sync-state-engine";

const user = {
  id: "11111111-1111-4111-8111-111111111111",
  email: "user@example.test",
  displayName: "User",
};
const workspaceId = "22222222-2222-4222-8222-222222222222";
const deviceId = "33333333-3333-4333-8333-333333333333";
const accessTokenExpiresAt = "2026-07-30T12:15:00.000Z";
const session = {
  user,
  workspaceId,
  deviceId,
  accessToken: "access-token",
  accessTokenExpiresAt,
};
const deviceMetadata = {
  clientDeviceId: "local-device",
  name: "Vinema Web",
  platform: "web" as const,
  appType: "WEB" as const,
  appVersion: "test",
};
const currentDevice = {
  device: {
    id: deviceId,
    userId: user.id,
    ...deviceMetadata,
    appVersion: "test",
    createdAt: "2026-07-30T12:00:00.000Z",
    updatedAt: "2026-07-30T12:00:00.000Z",
    lastSeenAt: "2026-07-30T12:00:00.000Z",
    revokedAt: null,
  },
};

describe("auth client and state", () => {
  it("AuthClient registers, logs in and gets session", async () => {
    const fetchFn = createFetch([
      jsonResponse(session, 201),
      jsonResponse(session),
      jsonResponse({ user, workspaceId, deviceId, tokenExpiresAt: accessTokenExpiresAt }),
      jsonResponse(currentDevice),
    ]);
    const client = createAuthClient({ baseUrl: "https://api.example.test", fetchFn });

    await expect(
      client.register({ email: user.email, password: "password-123", device: deviceMetadata }),
    ).resolves.toEqual(session);
    await expect(
      client.login({ email: user.email, password: "password-123", device: deviceMetadata }),
    ).resolves.toEqual(session);
    await expect(client.getSession("access-token")).resolves.toMatchObject({
      workspaceId,
    });
    await expect(client.getCurrentDevice("access-token")).resolves.toEqual(currentDevice);
    expect(fetchFn).toHaveBeenCalledTimes(4);
  });

  it("AuthClient maps validation, credentials, token expired, network and abort errors", async () => {
    const validation = createAuthClient({
      baseUrl: "https://api.example.test",
      fetchFn: createFetch([
        jsonResponse({ error: { code: "VALIDATION_ERROR", message: "Bad" } }, 400),
      ]),
    });
    await expect(
      validation.register({ email: user.email, password: "password-123", device: deviceMetadata }),
    ).rejects.toMatchObject({ code: "VALIDATION_ERROR" });

    const invalid = createAuthClient({
      baseUrl: "https://api.example.test",
      fetchFn: createFetch([
        jsonResponse({ error: { code: "INVALID_CREDENTIALS", message: "No" } }, 401),
      ]),
    });
    await expect(
      invalid.login({ email: user.email, password: "bad", device: deviceMetadata }),
    ).rejects.toMatchObject({ code: "INVALID_CREDENTIALS" });

    const expired = createAuthClient({
      baseUrl: "https://api.example.test",
      fetchFn: createFetch([
        jsonResponse({ error: { code: "TOKEN_EXPIRED", message: "Expired" } }, 401),
      ]),
    });
    await expect(expired.getSession("expired")).rejects.toMatchObject({
      code: "TOKEN_EXPIRED",
    });

    const network = createAuthClient({
      baseUrl: "https://api.example.test",
      fetchFn: vi.fn(async () => {
        throw new TypeError("network");
      }) as unknown as typeof fetch,
    });
    await expect(network.getSession("token")).rejects.toMatchObject({
      code: "NETWORK_ERROR",
    });
  });

  it("AuthStateEngine reduces auth lifecycle without mutation", () => {
    const previous = initialAuthState;
    const started = reduceAuthState(previous, {
      type: "AUTH_STARTED",
      at: "2026-07-30T12:00:00.000Z",
    });
    const succeeded = reduceAuthState(started, {
      type: "AUTH_SUCCEEDED",
      at: "2026-07-30T12:01:00.000Z",
      user,
      workspaceId,
      deviceId,
      accessTokenExpiresAt,
    });
    const failed = reduceAuthState(succeeded, {
      type: "AUTH_FAILED",
      at: "2026-07-30T12:02:00.000Z",
      code: "SERVER_ERROR",
      message: "Temporal",
    });
    const cleared = reduceAuthState(failed, {
      type: "AUTH_CLEARED",
      at: "2026-07-30T12:03:00.000Z",
    });

    expect(previous).toEqual(initialAuthState);
    expect(started.status).toBe("AUTHENTICATING");
    expect(succeeded).toMatchObject({ status: "AUTHENTICATED", user, workspaceId });
    expect(failed).toMatchObject({ status: "ERROR", error: { code: "SERVER_ERROR" } });
    expect(cleared).toMatchObject({ status: "UNAUTHENTICATED", user: null });
  });

  it("AuthStateEngine supports subscribe, unsubscribe, listener isolation and defensive getState", () => {
    const engine = createAuthStateEngine();
    const good = vi.fn();
    const bad = vi.fn(() => {
      throw new Error("bad listener");
    });
    const unsubscribe = engine.subscribe(good);
    engine.subscribe(bad);

    engine.dispatch({ type: "AUTH_STARTED", at: "2026-07-30T12:00:00.000Z" });
    unsubscribe();
    engine.dispatch({ type: "AUTH_CLEARED", at: "2026-07-30T12:01:00.000Z" });
    const snapshot = engine.getState();
    snapshot.status = "ERROR";

    expect(good).toHaveBeenCalledTimes(1);
    expect(bad).toHaveBeenCalledTimes(2);
    expect(engine.getState().status).toBe("UNAUTHENTICATED");
  });

  it("AuthService registers, logs in, encapsulates token and clears local session", async () => {
    const engine = createAuthStateEngine();
    const client = {
      register: vi.fn(async () => session),
      login: vi.fn(async () => session),
      getSession: vi.fn(async () => ({
        user,
        workspaceId,
        deviceId,
        tokenExpiresAt: accessTokenExpiresAt,
      })),
      getCurrentDevice: vi.fn(async () => currentDevice),
    };
    const service = createAuthService({
      authClient: client,
      authStateEngine: engine,
      deviceIdentityProvider: createDeviceIdentityProvider(),
      clock: createClock(),
    });

    await service.register({ email: user.email, password: "password-123" });
    expect(service.getAccessToken()).toBe("access-token");
    expect(client.register).toHaveBeenCalledWith({
      email: user.email,
      password: "password-123",
      device: deviceMetadata,
    });
    expect(service.getState()).not.toHaveProperty("accessToken");

    await service.getCurrentSession();
    expect(service.isAuthenticated()).toBe(true);

    service.clearLocalSession();
    expect(service.getAccessToken()).toBeUndefined();
    expect(service.getState().status).toBe("UNAUTHENTICATED");

    await service.login({ email: user.email, password: "password-123" });
    expect(service.getAccessToken()).toBe("access-token");
    await expect(service.getCurrentDevice()).resolves.toEqual(currentDevice);
  });

  it("AuthService clears session on invalid or expired token", async () => {
    const client = {
      register: vi.fn(async () => session),
      login: vi.fn(async () => session),
      getCurrentDevice: vi.fn(async () => currentDevice),
      getSession: vi.fn(async () => {
        throw new AuthClientError("TOKEN_EXPIRED", "Expired");
      }),
    };
    const service = createAuthService({
      authClient: client,
      deviceIdentityProvider: createDeviceIdentityProvider(),
    });

    await service.login({ email: user.email, password: "password-123" });
    await expect(service.getCurrentSession()).rejects.toMatchObject({
      code: "TOKEN_EXPIRED",
    });
    expect(service.getAccessToken()).toBeUndefined();
  });

  it("AuthSyncStateBridge publishes auth status and disposes", () => {
    const auth = createAuthStateEngine();
    const sync = createSyncStateEngine();
    const bridge = createAuthSyncStateBridge({
      authStateEngine: auth,
      syncStateEngine: sync,
    });

    auth.dispatch({
      type: "AUTH_SUCCEEDED",
      at: "2026-07-30T12:00:00.000Z",
      user,
      workspaceId,
      deviceId,
      accessTokenExpiresAt,
    });
    expect(sync.getState().authentication).toBe("AUTHENTICATED");

    auth.dispatch({ type: "AUTH_CLEARED", at: "2026-07-30T12:01:00.000Z" });
    expect(sync.getState().authentication).toBe("UNAUTHENTICATED");

    bridge.dispose();
    auth.dispatch({ type: "AUTH_STARTED", at: "2026-07-30T12:02:00.000Z" });
    expect(sync.getState().authentication).toBe("UNAUTHENTICATED");
  });

  it("auth client code does not depend on React, window or navigator", () => {
    const source = readFileSync("src/features/auth/auth-client.ts", "utf8");

    expect(source).not.toContain("react");
    expect(source).not.toContain("window");
    expect(source).not.toContain("navigator");
  });
});

function createFetch(responses: Response[]) {
  return vi.fn(async () => responses.shift() ?? jsonResponse({}, 500)) as unknown as typeof fetch;
}

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function createClock() {
  let current = Date.parse("2026-07-30T12:00:00.000Z");
  return () => {
    const value = new Date(current).toISOString();
    current += 1_000;
    return value;
  };
}

function createDeviceIdentityProvider(): DeviceIdentityProvider {
  return {
    getClientDeviceId: async () => deviceMetadata.clientDeviceId,
    getDeviceMetadata: async () => deviceMetadata,
  };
}
