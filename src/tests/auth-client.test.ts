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
const sessionId = "44444444-4444-4444-8444-444444444444";
const accessTokenExpiresAt = "2026-07-30T12:15:00.000Z";
const refreshTokenExpiresAt = "2026-08-29T12:00:00.000Z";
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
const session = {
  user,
  workspaceId,
  deviceId,
  device: currentDevice.device,
  sessionId,
  accessToken: "access-token",
  accessTokenExpiresAt,
  refreshToken: "refresh-token",
  refreshTokenExpiresAt,
};

describe("auth client and state", () => {
  it("AuthClient registers, logs in and gets session", async () => {
    const fetchFn = createFetch([
      jsonResponse(session, 201),
      jsonResponse(session),
      jsonResponse({ ...session, accessToken: "refreshed-access", refreshToken: "refresh-2" }),
      jsonResponse({ ok: true }),
      jsonResponse({ user, workspaceId, deviceId, sessionId, tokenExpiresAt: accessTokenExpiresAt }),
      jsonResponse(currentDevice),
    ]);
    const client = createAuthClient({ baseUrl: "https://api.example.test", fetchFn });

    await expect(
      client.register({ email: user.email, password: "password-123", device: deviceMetadata }),
    ).resolves.toEqual(session);
    await expect(
      client.login({ email: user.email, password: "password-123", device: deviceMetadata }),
    ).resolves.toEqual(session);
    await expect(client.refresh({ refreshToken: "refresh-token" })).resolves.toMatchObject({
      accessToken: "refreshed-access",
      refreshToken: "refresh-2",
    });
    await expect(client.logout({ refreshToken: "refresh-2" })).resolves.toEqual({ ok: true });
    await expect(client.getSession("access-token")).resolves.toMatchObject({
      workspaceId,
    });
    await expect(client.getCurrentDevice("access-token")).resolves.toEqual(currentDevice);
    expect(fetchFn).toHaveBeenCalledTimes(6);
  });

  it("AuthClient uses the configured base URL for auth endpoints", async () => {
    const fetchMock = createFetch([
      jsonResponse(session, 201),
      jsonResponse(session),
      jsonResponse({ ...session, accessToken: "refreshed-access", refreshToken: "refresh-2" }),
      jsonResponse({ ok: true }),
    ]);
    const client = createAuthClient({
      baseUrl: "https://api.example.test/vinema/",
      fetchFn: fetchMock,
    });

    await client.register({ email: user.email, password: "password-123", device: deviceMetadata });
    await client.login({ email: user.email, password: "password-123", device: deviceMetadata });
    await client.refresh({ refreshToken: "refresh-token" });
    await client.logout({ refreshToken: "refresh-2" });

    expect(fetchMock.mock.calls.map(([url]) => String(url))).toEqual([
      "https://api.example.test/vinema/auth/register",
      "https://api.example.test/vinema/auth/login",
      "https://api.example.test/vinema/auth/refresh",
      "https://api.example.test/vinema/auth/logout",
    ]);
  });

  it("AuthClient rejects empty base URLs before issuing requests", () => {
    expect(() => createAuthClient({ baseUrl: "" })).toThrow();
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
    ).rejects.toMatchObject({
      code: "VALIDATION_ERROR",
      status: 400,
      message: "Bad",
    });

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
      message: "No se pudo establecer conexion con la API.",
    });

    const aborted = createAuthClient({
      baseUrl: "https://api.example.test",
      fetchFn: vi.fn(async () => {
        throw new DOMException("aborted", "AbortError");
      }) as unknown as typeof fetch,
    });
    await expect(aborted.getSession("token")).rejects.toMatchObject({
      code: "NETWORK_ERROR",
    });
  });

  it("AuthClient preserves HTTP auth errors and does not classify them as network errors", async () => {
    const duplicate = createAuthClient({
      baseUrl: "https://api.example.test",
      fetchFn: createFetch([
        jsonResponse(
          { error: { code: "EMAIL_ALREADY_EXISTS", message: "Already exists" } },
          409,
        ),
      ]),
    });
    await expect(
      duplicate.register({ email: user.email, password: "password-123", device: deviceMetadata }),
    ).rejects.toMatchObject({
      code: "EMAIL_ALREADY_EXISTS",
      status: 409,
      message: "Already exists",
    });

    const server = createAuthClient({
      baseUrl: "https://api.example.test",
      fetchFn: createFetch([
        jsonResponse({ error: { code: "SERVER_ERROR", message: "Try later" } }, 500),
      ]),
    });
    await expect(
      server.login({ email: user.email, password: "password-123", device: deviceMetadata }),
    ).rejects.toMatchObject({
      code: "SERVER_ERROR",
      status: 500,
      message: "Try later",
    });

    const invalidBody = createAuthClient({
      baseUrl: "https://api.example.test",
      fetchFn: createFetch([textResponse("Not found", 404)]),
    });
    await expect(invalidBody.refresh({ refreshToken: "refresh-token" })).rejects.toMatchObject({
      code: "UNEXPECTED_ERROR",
      status: 404,
      message: "La solicitud de autenticacion fallo.",
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
      sessionId,
      accessTokenExpiresAt,
      refreshTokenExpiresAt,
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
      refresh: vi.fn(async () => ({
        ...session,
        accessToken: "refreshed-access-token",
        refreshToken: "refresh-token-2",
      })),
      logout: vi.fn(async () => ({ ok: true as const })),
      getSession: vi.fn(async () => ({
        user,
        workspaceId,
        deviceId,
        sessionId,
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
    expect(service.getState()).not.toHaveProperty("refreshToken");

    await service.getCurrentSession();
    expect(service.isAuthenticated()).toBe(true);

    await service.refresh();
    expect(service.getAccessToken()).toBe("refreshed-access-token");

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
      refresh: vi.fn(async () => session),
      logout: vi.fn(async () => ({ ok: true as const })),
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
      sessionId,
      accessTokenExpiresAt,
      refreshTokenExpiresAt,
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
  return vi.fn(async (...args: Parameters<typeof fetch>) => {
    void args;
    return responses.shift() ?? jsonResponse({}, 500);
  });
}

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function textResponse(body: string, status = 200) {
  return new Response(body, {
    status,
    headers: { "Content-Type": "text/plain" },
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
