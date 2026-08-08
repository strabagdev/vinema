import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import {
  AuthClientError,
  createAuthClient,
} from "@/features/auth/auth-client";
import { createAuthService } from "@/features/auth/auth-service";
import { InMemoryAuthSessionStorage } from "@/features/auth/storage/in-memory-auth-session-storage";
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

  it("AuthClient builds absolute auth URLs without protocol-relative auth hosts", async () => {
    const localFetch = createFetch([
      jsonResponse(session, 201),
      jsonResponse(session),
      jsonResponse({ ...session, accessToken: "refreshed-access", refreshToken: "refresh-2" }),
      jsonResponse({ ok: true }),
      jsonResponse({ user, workspaceId, deviceId, sessionId, tokenExpiresAt: accessTokenExpiresAt }),
      jsonResponse(currentDevice),
    ]);
    const local = createAuthClient({ baseUrl: "http://localhost:8000", fetchFn: localFetch });

    await local.register({ email: user.email, password: "password-123", device: deviceMetadata });
    await local.login({ email: user.email, password: "password-123", device: deviceMetadata });
    await local.refresh({ refreshToken: "refresh-token" });
    await local.logout({ refreshToken: "refresh-2" });
    await local.getSession("access-token");
    await local.getCurrentDevice("access-token");

    expect(localFetch.mock.calls.map(([url]) => String(url))).toEqual([
      "http://localhost:8000/auth/register",
      "http://localhost:8000/auth/login",
      "http://localhost:8000/auth/refresh",
      "http://localhost:8000/auth/logout",
      "http://localhost:8000/auth/session",
      "http://localhost:8000/auth/device",
    ]);
    expect(localFetch.mock.calls.map(([url]) => String(url)).join("\n")).not.toContain(
      "http://auth/",
    );

    const trailingSlashFetch = createFetch([jsonResponse(session, 201)]);
    const trailingSlash = createAuthClient({
      baseUrl: "http://localhost:8000/",
      fetchFn: trailingSlashFetch,
    });
    await trailingSlash.register({
      email: user.email,
      password: "password-123",
      device: deviceMetadata,
    });
    expect(String(trailingSlashFetch.mock.calls[0]?.[0])).toBe(
      "http://localhost:8000/auth/register",
    );

    const railwayFetch = createFetch([jsonResponse(session)]);
    const railway = createAuthClient({
      baseUrl: "https://vinema-api.up.railway.app",
      fetchFn: railwayFetch,
    });
    await railway.login({ email: user.email, password: "password-123", device: deviceMetadata });
    expect(String(railwayFetch.mock.calls[0]?.[0])).toBe(
      "https://vinema-api.up.railway.app/auth/login",
    );
  });

  it("AuthClient rejects unsafe or invalid base URLs before issuing requests", () => {
    expect(() => createAuthClient({ baseUrl: "" })).toThrow();
    expect(() => createAuthClient({ baseUrl: "not-a-url" })).toThrow();
    expect(() => createAuthClient({ baseUrl: "ftp://api.example.test" })).toThrow();
    expect(() => createAuthClient({ baseUrl: "http://auth" })).toThrow();
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

  it("AuthClient logs safe network diagnostics without request bodies or tokens", async () => {
    const warn = vi.fn();
    const client = createAuthClient({
      baseUrl: "https://api.example.test?token=secret",
      fetchFn: vi.fn(async () => {
        throw new TypeError("Failed to fetch because CORS blocked the request");
      }) as unknown as typeof fetch,
      logger: { warn },
    });

    await expect(
      client.login({ email: user.email, password: "password-123", device: deviceMetadata }),
    ).rejects.toMatchObject({ code: "NETWORK_ERROR" });

    expect(warn).toHaveBeenCalledWith("auth request network failure", {
      url: "https://api.example.test/auth/login",
      method: "POST",
      error: "TypeError",
      message: "Failed to fetch because CORS blocked the request",
    });
    expect(JSON.stringify(warn.mock.calls)).not.toContain("password-123");
    expect(JSON.stringify(warn.mock.calls)).not.toContain("token=secret");
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
    expect(started.status).toBe("LOGGING_IN");
    expect(succeeded).toMatchObject({ status: "AUTHENTICATED_ONLINE", user, workspaceId });
    expect(failed).toMatchObject({ status: "UNAUTHENTICATED", error: { code: "SERVER_ERROR" } });
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
    snapshot.status = "UNAUTHENTICATED";

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
      authSessionStorage: new InMemoryAuthSessionStorage(),
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
      authSessionStorage: new InMemoryAuthSessionStorage(),
      deviceIdentityProvider: createDeviceIdentityProvider(),
    });

    await service.login({ email: user.email, password: "password-123" });
    await expect(service.getCurrentSession()).rejects.toMatchObject({
      code: "TOKEN_EXPIRED",
    });
    expect(service.getAccessToken()).toBeUndefined();
  });

  it("AuthService persists register, login and rotated refresh sessions without storing access tokens", async () => {
    const storage = new InMemoryAuthSessionStorage();
    await storage.save({
      refreshToken: "old-refresh-token",
      sessionId: "old-session",
      deviceId: "old-device",
      storedAt: "2026-07-30T11:59:00.000Z",
    });
    const client = {
      register: vi.fn(async () => session),
      login: vi.fn(async () => ({
        ...session,
        refreshToken: "login-refresh-token",
        sessionId: "55555555-5555-4555-8555-555555555555",
      })),
      refresh: vi.fn(async () => ({
        ...session,
        accessToken: "rotated-access-token",
        refreshToken: "rotated-refresh-token",
        sessionId: "66666666-6666-4666-8666-666666666666",
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
      authSessionStorage: storage,
      deviceIdentityProvider: createDeviceIdentityProvider(),
      clock: createClock(),
    });

    await service.register({ email: user.email, password: "password-123" });
    expect(storage.snapshot()).toMatchObject({
      refreshToken: "refresh-token",
      sessionId,
      deviceId,
      storedAt: "2026-07-30T12:00:01.000Z",
      user,
      workspaceId,
      accessTokenExpiresAt,
      refreshTokenExpiresAt,
    });
    expect(JSON.stringify(storage.snapshot())).not.toContain("access-token");

    await service.login({ email: user.email, password: "password-123" });
    expect(storage.snapshot()).toMatchObject({
      refreshToken: "login-refresh-token",
      sessionId: "55555555-5555-4555-8555-555555555555",
      deviceId,
    });
    expect(service.getAccessToken()).toBe("access-token");

    await service.refresh();
    expect(storage.snapshot()).toMatchObject({
      refreshToken: "rotated-refresh-token",
      sessionId: "66666666-6666-4666-8666-666666666666",
      deviceId,
    });
    expect(JSON.stringify(storage.snapshot())).not.toContain("login-refresh-token");
    expect(service.getAccessToken()).toBe("rotated-access-token");
  });

  it("AuthService clears local auth when session persistence fails", async () => {
    const storage = new FailingAuthSessionStorage("save");
    const client = {
      register: vi.fn(async () => session),
      login: vi.fn(async () => session),
      refresh: vi.fn(async () => session),
      logout: vi.fn(async () => ({ ok: true as const })),
      getSession: vi.fn(),
      getCurrentDevice: vi.fn(),
    };
    const service = createAuthService({
      authClient: client,
      authSessionStorage: storage,
      deviceIdentityProvider: createDeviceIdentityProvider(),
    });

    await expect(
      service.login({ email: user.email, password: "password-123" }),
    ).rejects.toMatchObject({
      code: "UNEXPECTED_ERROR",
      message: "No se pudo guardar la sesion local.",
    });
    expect(service.getAccessToken()).toBeUndefined();
    expect(service.getState().status).toBe("UNAUTHENTICATED");
    expect(storage.clearCalls).toBeGreaterThanOrEqual(1);
  });

  it("AuthService clears persisted and memory sessions on refresh persistence failure", async () => {
    const storage = new FailingAuthSessionStorage("save-on-second-call");
    const client = {
      register: vi.fn(async () => session),
      login: vi.fn(async () => session),
      refresh: vi.fn(async () => ({
        ...session,
        accessToken: "rotated-access-token",
        refreshToken: "rotated-refresh-token",
      })),
      logout: vi.fn(async () => ({ ok: true as const })),
      getSession: vi.fn(),
      getCurrentDevice: vi.fn(),
    };
    const service = createAuthService({
      authClient: client,
      authSessionStorage: storage,
      deviceIdentityProvider: createDeviceIdentityProvider(),
    });

    await service.login({ email: user.email, password: "password-123" });
    await expect(service.refresh()).rejects.toMatchObject({
      code: "UNEXPECTED_ERROR",
    });
    expect(service.getAccessToken()).toBeUndefined();
    expect(service.getState().status).toBe("UNAUTHENTICATED");
    expect(storage.clearCalls).toBeGreaterThanOrEqual(1);
    expect(JSON.stringify(storage.snapshot())).not.toContain("refresh-token");
  });

  it("AuthService keeps authenticated state on temporary silent refresh failures", async () => {
    const storage = new InMemoryAuthSessionStorage();
    const client = createMockAuthClient({
      refresh: vi.fn(async () => {
        throw new AuthClientError("NETWORK_ERROR", "Offline");
      }),
    });
    const service = createAuthService({
      authClient: client,
      authSessionStorage: storage,
      deviceIdentityProvider: createDeviceIdentityProvider(),
    });

    await service.login({ email: user.email, password: "password-123" });

    await expect(service.refresh({ silent: true })).rejects.toMatchObject({
      code: "NETWORK_ERROR",
    });

    expect(service.getState()).toMatchObject({
      status: "AUTHENTICATED_OFFLINE",
      user,
      workspaceId,
      deviceId,
    });
    expect(service.getAccessToken()).toBeUndefined();
    expect(storage.snapshot()).toMatchObject({
      refreshToken: "refresh-token",
      sessionId,
      deviceId,
    });
  });

  it("AuthService does not clear active local sessions on non-silent network refresh failures", async () => {
    const storage = new InMemoryAuthSessionStorage();
    const client = createMockAuthClient({
      refresh: vi.fn(async () => {
        throw new AuthClientError("NETWORK_ERROR", "Offline");
      }),
    });
    const service = createAuthService({
      authClient: client,
      authSessionStorage: storage,
      deviceIdentityProvider: createDeviceIdentityProvider(),
    });

    await service.login({ email: user.email, password: "password-123" });
    await expect(service.refresh()).rejects.toMatchObject({ code: "NETWORK_ERROR" });

    expect(service.isAuthenticated()).toBe(true);
    expect(service.getAccessToken()).toBeUndefined();
    expect(storage.snapshot()).toMatchObject({
      refreshToken: "refresh-token",
      workspaceId,
      user,
    });
    expect(service.getState()).toMatchObject({
      status: "AUTHENTICATED_OFFLINE",
      error: { code: "NETWORK_ERROR" },
    });
  });

  it("AuthService clears definitive refresh failures and rejects identity mismatches", async () => {
    const invalidStorage = new InMemoryAuthSessionStorage();
    const invalidService = createAuthService({
      authClient: createMockAuthClient({
        refresh: vi.fn(async () => {
          throw new AuthClientError("TOKEN_INVALID", "Invalid", 401);
        }),
      }),
      authSessionStorage: invalidStorage,
      deviceIdentityProvider: createDeviceIdentityProvider(),
    });

    await invalidService.login({ email: user.email, password: "password-123" });
    await expect(invalidService.refresh({ silent: true })).rejects.toMatchObject({
      code: "TOKEN_INVALID",
    });
    expect(invalidService.getAccessToken()).toBeUndefined();
    expect(invalidStorage.snapshot()).toBeNull();
    expect(invalidService.getState().status).toBe("UNAUTHENTICATED");

    const mismatchStorage = new InMemoryAuthSessionStorage();
    const mismatchService = createAuthService({
      authClient: createMockAuthClient({
        refresh: vi.fn(async () => ({
          ...session,
          deviceId: "99999999-9999-4999-8999-999999999999",
          refreshToken: "mismatch-refresh-token",
        })),
      }),
      authSessionStorage: mismatchStorage,
      deviceIdentityProvider: createDeviceIdentityProvider(),
    });

    await mismatchService.login({ email: user.email, password: "password-123" });
    await expect(mismatchService.refresh({ silent: true })).rejects.toMatchObject({
      code: "UNEXPECTED_ERROR",
    });
    expect(mismatchService.getAccessToken()).toBeUndefined();
    expect(mismatchStorage.snapshot()).toBeNull();
  });

  it("AuthService can interrupt memory auth without deleting persisted refresh credentials", async () => {
    const storage = new InMemoryAuthSessionStorage();
    const service = createAuthService({
      authClient: createMockAuthClient(),
      authSessionStorage: storage,
      deviceIdentityProvider: createDeviceIdentityProvider(),
    });

    await service.login({ email: user.email, password: "password-123" });
    service.interruptSession({
      code: "NETWORK_ERROR",
      message: "No fue posible renovar la sesion.",
    });

    expect(service.getAccessToken()).toBeUndefined();
    expect(storage.snapshot()?.refreshToken).toBe("refresh-token");
    expect(service.getState()).toMatchObject({
      status: "UNAUTHENTICATED",
      error: { code: "NETWORK_ERROR", message: "No fue posible renovar la sesion." },
    });
  });

  it("AuthService ignores and clears late refresh results after logout", async () => {
    const storage = new InMemoryAuthSessionStorage();
    let resolveRefresh: ((value: typeof session) => void) | undefined;
    const client = createMockAuthClient({
      refresh: vi.fn(
        () => new Promise<typeof session>((resolve) => {
          resolveRefresh = resolve;
        }),
      ),
    });
    const service = createAuthService({
      authClient: client,
      authSessionStorage: storage,
      deviceIdentityProvider: createDeviceIdentityProvider(),
    });

    await service.login({ email: user.email, password: "password-123" });
    const pending = service.refresh({ silent: true });
    await service.logout();
    resolveRefresh?.({
      ...session,
      accessToken: "late-access-token",
      refreshToken: "late-refresh-token",
    });
    await pending;

    expect(service.getAccessToken()).toBeUndefined();
    expect(storage.snapshot()).toBeNull();
    expect(service.getState().status).toBe("UNAUTHENTICATED");
  });

  it("AuthService clears persisted session on logout even when the API fails", async () => {
    const storage = new InMemoryAuthSessionStorage();
    const client = {
      register: vi.fn(async () => session),
      login: vi.fn(async () => session),
      refresh: vi.fn(async () => session),
      logout: vi.fn(async () => {
        throw new AuthClientError("NETWORK_ERROR", "Offline");
      }),
      getSession: vi.fn(),
      getCurrentDevice: vi.fn(),
    };
    const service = createAuthService({
      authClient: client,
      authSessionStorage: storage,
      deviceIdentityProvider: createDeviceIdentityProvider(),
    });

    await service.login({ email: user.email, password: "password-123" });
    expect(storage.snapshot()).not.toBeNull();
    await service.logout();
    expect(storage.snapshot()).toBeNull();
    expect(service.getAccessToken()).toBeUndefined();
    expect(service.getState().status).toBe("UNAUTHENTICATED");
  });

  it("AuthService restore skips refresh when no persisted session exists", async () => {
    const client = createMockAuthClient();
    const service = createAuthService({
      authClient: client,
      authSessionStorage: new InMemoryAuthSessionStorage(),
      deviceIdentityProvider: createDeviceIdentityProvider(),
    });

    await expect(service.restoreSession()).resolves.toBeNull();

    expect(client.refresh).not.toHaveBeenCalled();
    expect(service.getState().status).toBe("UNAUTHENTICATED");
  });

  it("AuthService restore refreshes persisted sessions and saves the rotated token before authenticating", async () => {
    const storage = new InMemoryAuthSessionStorage();
    await storage.save({
      refreshToken: "stored-refresh-token",
      sessionId,
      deviceId,
      storedAt: "2026-07-30T11:59:00.000Z",
    });
    const client = createMockAuthClient({
      refresh: vi.fn(async () => ({
        ...session,
        accessToken: "restored-access-token",
        refreshToken: "rotated-refresh-token",
        sessionId: "77777777-7777-4777-8777-777777777777",
      })),
    });
    const service = createAuthService({
      authClient: client,
      authSessionStorage: storage,
      deviceIdentityProvider: createDeviceIdentityProvider(),
      clock: createClock(),
    });

    await expect(service.restoreSession()).resolves.toMatchObject({
      accessToken: "restored-access-token",
      refreshToken: "rotated-refresh-token",
    });

    expect(client.refresh).toHaveBeenCalledWith(
      { refreshToken: "stored-refresh-token" },
      { signal: expect.any(AbortSignal) },
    );
    expect(storage.snapshot()).toMatchObject({
      refreshToken: "rotated-refresh-token",
      sessionId: "77777777-7777-4777-8777-777777777777",
      deviceId,
    });
    expect(JSON.stringify(storage.snapshot())).not.toContain("restored-access-token");
    expect(service.getAccessToken()).toBe("restored-access-token");
    expect(service.getState()).toMatchObject({
      status: "AUTHENTICATED_ONLINE",
      workspaceId,
      deviceId,
      sessionId: "77777777-7777-4777-8777-777777777777",
    });
  });

  it("AuthService restore clears invalid tokens and only restores offline from validated snapshots", async () => {
    const invalidStorage = new InMemoryAuthSessionStorage();
    await invalidStorage.save({
      refreshToken: "stored-refresh-token",
      sessionId,
      deviceId,
      storedAt: "2026-07-30T11:59:00.000Z",
    });
    const invalidClient = createMockAuthClient({
      refresh: vi.fn(async () => {
        throw new AuthClientError("TOKEN_INVALID", "Invalid", 401);
      }),
    });
    const invalidService = createAuthService({
      authClient: invalidClient,
      authSessionStorage: invalidStorage,
      deviceIdentityProvider: createDeviceIdentityProvider(),
    });

    await invalidService.restoreSession();
    expect(invalidStorage.snapshot()).toBeNull();
    expect(invalidService.getState().status).toBe("UNAUTHENTICATED");
    expect(invalidService.getState().error).toBeNull();

    const networkStorage = new InMemoryAuthSessionStorage();
    await networkStorage.save({
      refreshToken: "stored-refresh-token",
      sessionId,
      deviceId,
      storedAt: "2026-07-30T11:59:00.000Z",
    });
    const networkService = createAuthService({
      authClient: createMockAuthClient({
        refresh: vi.fn(async () => {
          throw new AuthClientError("NETWORK_ERROR", "Offline");
        }),
      }),
      authSessionStorage: networkStorage,
      deviceIdentityProvider: createDeviceIdentityProvider(),
    });

    await networkService.restoreSession();
    expect(networkStorage.snapshot()?.refreshToken).toBe("stored-refresh-token");
    expect(networkService.getState()).toMatchObject({
      status: "UNAUTHENTICATED",
      user: null,
      workspaceId: null,
      error: null,
    });

    const offlineStorage = new InMemoryAuthSessionStorage();
    await offlineStorage.save({
      refreshToken: "stored-refresh-token",
      sessionId,
      deviceId,
      storedAt: "2026-07-30T11:59:00.000Z",
      user,
      workspaceId,
      accessTokenExpiresAt,
      refreshTokenExpiresAt,
    });
    const offlineService = createAuthService({
      authClient: createMockAuthClient({
        refresh: vi.fn(async () => {
          throw new AuthClientError("NETWORK_ERROR", "Offline");
        }),
      }),
      authSessionStorage: offlineStorage,
      deviceIdentityProvider: createDeviceIdentityProvider(),
    });

    await offlineService.restoreSession();
    expect(offlineService.isAuthenticated()).toBe(true);
    expect(offlineService.getAccessToken()).toBeUndefined();
    expect(offlineStorage.snapshot()).toMatchObject({
      refreshToken: "stored-refresh-token",
      workspaceId,
      user,
    });
    expect(offlineService.getState()).toMatchObject({
      status: "AUTHENTICATED_OFFLINE",
      user,
      workspaceId,
      deviceId,
      error: { code: "NETWORK_ERROR" },
    });
  });

  it("AuthService restores offline immediately when the browser is already offline", async () => {
    const storage = new InMemoryAuthSessionStorage();
    await storage.save({
      refreshToken: "stored-refresh-token",
      sessionId,
      deviceId,
      storedAt: "2026-07-30T11:59:00.000Z",
      user,
      workspaceId,
      accessTokenExpiresAt,
      refreshTokenExpiresAt,
    });
    const client = createMockAuthClient();
    const service = createAuthService({
      authClient: client,
      authSessionStorage: storage,
      deviceIdentityProvider: createDeviceIdentityProvider(),
      isOnline: () => false,
    });

    await expect(service.restoreSession()).resolves.toBeNull();

    expect(client.refresh).not.toHaveBeenCalled();
    expect(service.isAuthenticated()).toBe(true);
    expect(service.getState()).toMatchObject({
      status: "AUTHENTICATED_OFFLINE",
      workspaceId,
      deviceId,
    });
  });

  it("AuthService sends incomplete offline snapshots to login without a remote refresh", async () => {
    const storage = new InMemoryAuthSessionStorage();
    await storage.save({
      refreshToken: "stored-refresh-token",
      sessionId,
      deviceId,
      storedAt: "2026-07-30T11:59:00.000Z",
    });
    const client = createMockAuthClient();
    const service = createAuthService({
      authClient: client,
      authSessionStorage: storage,
      deviceIdentityProvider: createDeviceIdentityProvider(),
      isOnline: () => false,
    });

    await expect(service.restoreSession()).resolves.toBeNull();

    expect(client.refresh).not.toHaveBeenCalled();
    expect(service.isAuthenticated()).toBe(false);
    expect(service.getState()).toMatchObject({
      status: "UNAUTHENTICATED",
      user: null,
      workspaceId: null,
    });
  });

  it("AuthService times out a pending restore refresh and leaves checking state", async () => {
    vi.useFakeTimers();
    const storage = new InMemoryAuthSessionStorage();
    await storage.save({
      refreshToken: "stored-refresh-token",
      sessionId,
      deviceId,
      storedAt: "2026-07-30T11:59:00.000Z",
      user,
      workspaceId,
      accessTokenExpiresAt,
      refreshTokenExpiresAt,
    });
    const client = createMockAuthClient({
      refresh: vi.fn(
        () =>
          new Promise<typeof session>(() => {
            // Simulates a browser fetch that never resolves while connectivity is lost.
          }),
      ),
    });
    const service = createAuthService({
      authClient: client,
      authSessionStorage: storage,
      deviceIdentityProvider: createDeviceIdentityProvider(),
      restoreTimeoutMs: 50,
    });

    const restore = service.restoreSession();
    expect(service.getState().status).toBe("CHECKING_LOCAL_SESSION");
    await vi.advanceTimersByTimeAsync(50);

    await expect(restore).resolves.toBeNull();
    expect(service.getState()).toMatchObject({
      status: "AUTHENTICATED_OFFLINE",
      workspaceId,
      deviceId,
    });
    expect(service.getState().status).not.toBe("CHECKING_LOCAL_SESSION");
    expect(service.getAccessToken()).toBeUndefined();
    expect(storage.snapshot()?.refreshToken).toBe("stored-refresh-token");
  });

  it("AuthService restore rejects device mismatch and persistence failures safely", async () => {
    const mismatchStorage = new InMemoryAuthSessionStorage();
    await mismatchStorage.save({
      refreshToken: "stored-refresh-token",
      sessionId,
      deviceId,
      storedAt: "2026-07-30T11:59:00.000Z",
    });
    const mismatchService = createAuthService({
      authClient: createMockAuthClient({
        refresh: vi.fn(async () => ({
          ...session,
          deviceId: "99999999-9999-4999-8999-999999999999",
        })),
      }),
      authSessionStorage: mismatchStorage,
      deviceIdentityProvider: createDeviceIdentityProvider(),
    });

    await mismatchService.restoreSession();
    expect(mismatchStorage.snapshot()).toBeNull();
    expect(mismatchService.getAccessToken()).toBeUndefined();
    expect(mismatchService.getState().status).toBe("UNAUTHENTICATED");

    const failingStorage = new FailingAuthSessionStorage("save");
    await InMemoryAuthSessionStorage.prototype.save.call(failingStorage, {
      refreshToken: "stored-refresh-token",
      sessionId,
      deviceId,
      storedAt: "2026-07-30T11:59:00.000Z",
    });
    const failingService = createAuthService({
      authClient: createMockAuthClient(),
      authSessionStorage: failingStorage,
      deviceIdentityProvider: createDeviceIdentityProvider(),
    });

    await failingService.restoreSession();
    expect(failingStorage.snapshot()).toBeNull();
    expect(failingService.getAccessToken()).toBeUndefined();
    expect(failingService.getState().status).toBe("UNAUTHENTICATED");
  });

  it("AuthService restore ignores late responses after logout", async () => {
    const storage = new InMemoryAuthSessionStorage();
    await storage.save({
      refreshToken: "stored-refresh-token",
      sessionId,
      deviceId,
      storedAt: "2026-07-30T11:59:00.000Z",
    });
    let resolveRefresh: ((value: typeof session) => void) | undefined;
    const service = createAuthService({
      authClient: createMockAuthClient({
        refresh: vi.fn(
          () => new Promise<typeof session>((resolve) => {
            resolveRefresh = resolve;
          }),
        ),
      }),
      authSessionStorage: storage,
      deviceIdentityProvider: createDeviceIdentityProvider(),
    });

    const restore = service.restoreSession();
    await service.logout();
    resolveRefresh?.(session);
    await restore;

    expect(service.getAccessToken()).toBeUndefined();
    expect(service.getState().status).toBe("UNAUTHENTICATED");
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
    expect(sync.getState().authentication).toBe("AUTHENTICATED_ONLINE");

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

function createMockAuthClient(
  overrides: Partial<Parameters<typeof createAuthService>[0]["authClient"]> = {},
): Parameters<typeof createAuthService>[0]["authClient"] {
  return {
    register: vi.fn(async () => session),
    login: vi.fn(async () => session),
    refresh: vi.fn(async () => session),
    logout: vi.fn(async () => ({ ok: true as const })),
    getSession: vi.fn(async () => ({
      user,
      workspaceId,
      deviceId,
      sessionId,
      tokenExpiresAt: accessTokenExpiresAt,
    })),
    getCurrentDevice: vi.fn(async () => currentDevice),
    ...overrides,
  };
}

class FailingAuthSessionStorage extends InMemoryAuthSessionStorage {
  clearCalls = 0;
  private saveCalls = 0;

  constructor(private readonly mode: "save" | "save-on-second-call") {
    super();
  }

  override async save(
    session: Parameters<InMemoryAuthSessionStorage["save"]>[0],
  ): Promise<void> {
    this.saveCalls += 1;
    if (this.mode === "save" || this.saveCalls > 1) {
      throw new Error("storage failed");
    }

    await super.save(session);
  }

  override async clear(): Promise<void> {
    this.clearCalls += 1;
    await super.clear();
  }
}
