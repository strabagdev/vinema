import { describe, expect, it } from "vitest";
import { createVinemaApiServer } from "../../server/src/http/create-server";
import { loadAuthTokenConfig } from "../../server/src/auth/auth-config";
import { issueAccessToken } from "../../server/src/auth/access-token";
import { createAuthSessionService } from "../../server/src/auth/auth-session-service";
import { createDeviceService } from "../../server/src/auth/device-service";
import { createIdentityService } from "../../server/src/auth/identity-service";
import { hashPassword } from "../../server/src/auth/password";
import { createRefreshTokenCodec } from "../../server/src/auth/refresh-token-codec";
import { InMemoryAuthSessionRepository } from "../../server/src/testing/in-memory-auth-session-repository";
import { InMemoryDeviceRepository } from "../../server/src/testing/in-memory-device-repository";
import { InMemoryIdentityRepository } from "../../server/src/testing/in-memory-identity-repository";
import { InMemorySyncStore } from "../../server/src/testing/in-memory-sync-store";

const tokenConfig = loadAuthTokenConfig({
  NODE_ENV: "test",
  VINEMA_AUTH_ACCESS_TOKEN_SECRET: "test-auth-secret-with-enough-length",
  VINEMA_AUTH_ISSUER: "vinema-test",
  VINEMA_AUTH_AUDIENCE: "vinema-test-client",
  VINEMA_AUTH_ACCESS_TOKEN_TTL_SECONDS: "900",
});

describe("Vinema auth API", () => {
  it("registers with normalized email, hashes password, creates workspace and device", async () => {
    const setup = createSetup();
    const response = await register(setup.app, "User@Example.Test", "password-123");

    expect(response.statusCode).toBe(201);
    expect(response.json()).toMatchObject({
      user: { email: "User@Example.Test", displayName: "Test User" },
      workspaceId: expect.any(String),
      deviceId: expect.any(String),
      sessionId: expect.any(String),
      accessToken: expect.any(String),
      accessTokenExpiresAt: expect.any(String),
      refreshToken: expect.any(String),
      refreshTokenExpiresAt: expect.any(String),
    });
    expect(response.body).not.toContain("passwordHash");
    expect(response.body).not.toContain("refreshTokenHash");
    expect(response.body).not.toContain("password-123");

    const stored = await setup.identity.findUserByNormalizedEmail("user@example.test");
    expect(stored).toBeTruthy();
    expect(stored?.passwordHash).not.toBe("password-123");
    expect(stored?.personalWorkspaceId).toBe(response.json().workspaceId);
    expect(setup.sync.workspaces.has(response.json().workspaceId)).toBe(true);
    expect([...setup.devices.devices.values()][0]).toMatchObject({
      id: response.json().deviceId,
      userId: response.json().user.id,
      clientDeviceId: "register-device",
      appType: "WEB",
      revokedAt: null,
    });
  });

  it("rejects duplicate email, invalid password and invalid credentials safely", async () => {
    const setup = createSetup();
    await register(setup.app, "dupe@example.test", "password-123");

    const duplicate = await register(setup.app, "DUPE@example.test", "password-123");
    const weakPassword = await register(setup.app, "weak@example.test", "short");
    const invalid = await setup.app.inject({
      method: "POST",
      url: "/auth/login",
      payload: {
        email: "missing@example.test",
        password: "bad-password",
        device: devicePayload("missing-device"),
      },
    });

    expect(duplicate.statusCode).toBe(409);
    expect(duplicate.json().error.code).toBe("EMAIL_ALREADY_EXISTS");
    expect(weakPassword.statusCode).toBe(400);
    expect(invalid.statusCode).toBe(401);
    expect(invalid.json().error.code).toBe("INVALID_CREDENTIALS");
    expect(invalid.body).not.toContain("passwordHash");
  });

  it("logs in case-insensitively, rejects disabled users and returns current session/device", async () => {
    const setup = createSetup();
    const registered = await register(setup.app, "Case@Example.Test", "password-123");
    const login = await setup.app.inject({
      method: "POST",
      url: "/auth/login",
      payload: {
        email: "case@example.test",
        password: "password-123",
        device: devicePayload("login-device"),
      },
    });
    const session = await setup.app.inject({
      method: "GET",
      url: "/auth/session",
      headers: authHeaders(login.json().accessToken),
    });
    const currentDevice = await setup.app.inject({
      method: "GET",
      url: "/auth/device",
      headers: authHeaders(login.json().accessToken),
    });
    const user = await setup.identity.findUserByNormalizedEmail("case@example.test");
    setup.identity.disableUser(user!.id);
    const disabled = await setup.app.inject({
      method: "POST",
      url: "/auth/login",
      payload: {
        email: "case@example.test",
        password: "password-123",
        device: devicePayload("disabled-device"),
      },
    });

    expect(login.statusCode).toBe(200);
    expect(login.json().workspaceId).toBe(registered.json().workspaceId);
    expect(session.statusCode).toBe(200);
    expect(session.json()).toMatchObject({
      workspaceId: registered.json().workspaceId,
      deviceId: login.json().deviceId,
      sessionId: login.json().sessionId,
      tokenExpiresAt: expect.any(String),
    });
    expect(currentDevice.statusCode).toBe(200);
    expect(currentDevice.json().device).toMatchObject({
      id: login.json().deviceId,
      clientDeviceId: "login-device",
      appType: "WEB",
    });
    expect(disabled.statusCode).toBe(401);
    expect(disabled.json().error.code).toBe("USER_DISABLED");
  });

  it("rejects missing, invalid, expired, wrong issuer and wrong audience tokens", async () => {
    const setup = createSetup();
    const registered = await register(setup.app, "token@example.test", "password-123");
    const missing = await setup.app.inject({ method: "GET", url: "/auth/session" });
    const invalid = await setup.app.inject({
      method: "GET",
      url: "/auth/session",
      headers: { Authorization: "Bearer invalid" },
    });
    const expired = await setup.app.inject({
      method: "GET",
      url: "/auth/session",
      headers: {
        Authorization: `Bearer ${issueAccessToken({
          userId: registered.json().user.id,
          workspaceId: registered.json().workspaceId,
          deviceId: registered.json().deviceId,
          sessionId: registered.json().sessionId,
          config: { ...tokenConfig, accessTokenTtlSeconds: 1 },
          now: new Date("2026-07-30T12:00:00.000Z"),
        }).accessToken}`,
      },
    });
    const wrongIssuer = tokenWith({
      issuer: "wrong",
      workspaceId: registered.json().workspaceId,
      userId: registered.json().user.id,
      deviceId: registered.json().deviceId,
    });
    const wrongAudience = tokenWith({
      audience: "wrong",
      workspaceId: registered.json().workspaceId,
      userId: registered.json().user.id,
      deviceId: registered.json().deviceId,
    });

    expect(missing.json().error.code).toBe("TOKEN_MISSING");
    expect(invalid.json().error.code).toBe("TOKEN_INVALID");
    expect(expired.json().error.code).toBe("TOKEN_EXPIRED");
    await expectSessionRejected(setup.app, wrongIssuer, "TOKEN_INVALID");
    await expectSessionRejected(setup.app, wrongAudience, "TOKEN_INVALID");
  });

  it("reuses devices per user, allows same clientDeviceId for other users and rejects revoked devices", async () => {
    const setup = createSetup();
    const first = await register(setup.app, "device-a@example.test", "password-123", "shared-client");
    const secondLogin = await setup.app.inject({
      method: "POST",
      url: "/auth/login",
      payload: {
        email: "device-a@example.test",
        password: "password-123",
        device: devicePayload("shared-client", { name: "Renamed Device" }),
      },
    });
    const otherUser = await register(setup.app, "device-b@example.test", "password-123", "shared-client");

    expect(secondLogin.statusCode).toBe(200);
    expect(secondLogin.json().deviceId).toBe(first.json().deviceId);
    expect(setup.devices.devices.size).toBe(2);
    expect(otherUser.json().deviceId).not.toBe(first.json().deviceId);

    setup.devices.revoke(first.json().deviceId);
    const revokedLogin = await setup.app.inject({
      method: "POST",
      url: "/auth/login",
      payload: {
        email: "device-a@example.test",
        password: "password-123",
        device: devicePayload("shared-client"),
      },
    });
    const revokedDevice = await setup.app.inject({
      method: "GET",
      url: "/auth/device",
      headers: authHeaders(first.json().accessToken),
    });

    expect(revokedLogin.statusCode).toBe(403);
    expect(revokedLogin.json().error.code).toBe("DEVICE_REVOKED");
    expect(revokedDevice.statusCode).toBe(403);
    expect(revokedDevice.json().error.code).toBe("DEVICE_REVOKED");
  });

  it("protects sync with real auth and forbids cross-user workspaces", async () => {
    const setup = createSetup();
    const userA = await register(setup.app, "a@example.test", "password-123");
    const userB = await register(setup.app, "b@example.test", "password-123");
    const mutation = captureMutation();
    const pushA = await setup.app.inject({
      method: "POST",
      url: "/api/sync/push",
      headers: authHeaders(userA.json().accessToken),
      payload: {
        workspaceId: userA.json().workspaceId,
        deviceId: crypto.randomUUID(),
        mutations: [mutation],
      },
    });
    const pullA = await setup.app.inject({
      method: "GET",
      url: `/api/sync/pull?workspaceId=${userA.json().workspaceId}&cursor=0&limit=10`,
      headers: authHeaders(userA.json().accessToken),
    });
    const forbiddenPush = await setup.app.inject({
      method: "POST",
      url: "/api/sync/push",
      headers: authHeaders(userA.json().accessToken),
      payload: {
        workspaceId: userB.json().workspaceId,
        deviceId: crypto.randomUUID(),
        mutations: [],
      },
    });
    const forbiddenPull = await setup.app.inject({
      method: "GET",
      url: `/api/sync/pull?workspaceId=${userB.json().workspaceId}&cursor=0&limit=10`,
      headers: authHeaders(userA.json().accessToken),
    });
    const forbiddenInventory = await setup.app.inject({
      method: "GET",
      url: `/api/sync/inventory?workspaceId=${userB.json().workspaceId}&cursor=0&limit=10`,
      headers: authHeaders(userA.json().accessToken),
    });
    const pullB = await setup.app.inject({
      method: "GET",
      url: `/api/sync/pull?workspaceId=${userB.json().workspaceId}&cursor=0&limit=10`,
      headers: authHeaders(userB.json().accessToken),
    });

    expect(pushA.statusCode).toBe(200);
    expect(pullA.json().changes).toHaveLength(1);
    expect(forbiddenPush.statusCode).toBe(403);
    expect(forbiddenPull.statusCode).toBe(403);
    expect(forbiddenInventory.statusCode).toBe(403);
    expect(pullB.json().changes).toHaveLength(0);
  });

  it("refreshes by rotating refresh tokens and rejects reused generations", async () => {
    const setup = createSetup();
    const registered = await register(setup.app, "refresh@example.test", "password-123");
    const firstRefreshToken = registered.json().refreshToken;
    const firstSessionId = registered.json().sessionId;
    const refreshed = await setup.app.inject({
      method: "POST",
      url: "/auth/refresh",
      payload: { refreshToken: firstRefreshToken },
    });
    const reused = await setup.app.inject({
      method: "POST",
      url: "/auth/refresh",
      payload: { refreshToken: firstRefreshToken },
    });
    const familyRevoked = await setup.app.inject({
      method: "POST",
      url: "/auth/refresh",
      payload: { refreshToken: refreshed.json().refreshToken },
    });

    expect(refreshed.statusCode).toBe(200);
    expect(refreshed.json()).toMatchObject({
      user: { id: registered.json().user.id },
      workspaceId: registered.json().workspaceId,
      deviceId: registered.json().deviceId,
      sessionId: expect.any(String),
      accessToken: expect.any(String),
      refreshToken: expect.any(String),
    });
    expect(refreshed.json().sessionId).not.toBe(firstSessionId);
    expect(refreshed.json().refreshToken).not.toBe(firstRefreshToken);
    expect(setup.sessions.sessions.get(firstSessionId)?.replacedBySessionId).toBe(
      refreshed.json().sessionId,
    );
    expect(reused.statusCode).toBe(401);
    expect(reused.json().error.code).toBe("REFRESH_TOKEN_REUSED");
    expect(familyRevoked.statusCode).toBe(401);
  });

  it("logout revokes only the current session and is idempotent", async () => {
    const setup = createSetup();
    const first = await register(setup.app, "logout@example.test", "password-123", "device-a");
    const second = await setup.app.inject({
      method: "POST",
      url: "/auth/login",
      payload: {
        email: "logout@example.test",
        password: "password-123",
        device: devicePayload("device-b"),
      },
    });
    const logout = await setup.app.inject({
      method: "POST",
      url: "/auth/logout",
      payload: { refreshToken: first.json().refreshToken },
    });
    const logoutAgain = await setup.app.inject({
      method: "POST",
      url: "/auth/logout",
      payload: { refreshToken: first.json().refreshToken },
    });
    const firstRefresh = await setup.app.inject({
      method: "POST",
      url: "/auth/refresh",
      payload: { refreshToken: first.json().refreshToken },
    });
    const secondRefresh = await setup.app.inject({
      method: "POST",
      url: "/auth/refresh",
      payload: { refreshToken: second.json().refreshToken },
    });

    expect(logout.statusCode).toBe(200);
    expect(logout.json()).toEqual({ ok: true });
    expect(logoutAgain.statusCode).toBe(200);
    expect(firstRefresh.statusCode).toBe(401);
    expect(firstRefresh.json().error.code).toBe("REFRESH_TOKEN_REVOKED");
    expect(secondRefresh.statusCode).toBe(200);
  });

  it("requires auth secret outside tests", () => {
    expect(() =>
      loadAuthTokenConfig({ NODE_ENV: "production" }),
    ).toThrow(/VINEMA_AUTH_ACCESS_TOKEN_SECRET/);
  });

  it("hashPassword produces verifiable non-plain hashes", async () => {
    const passwordHash = await hashPassword("password-123");

    expect(passwordHash).not.toBe("password-123");
    expect(passwordHash).toContain("scrypt-v1");
  });
});

function createSetup() {
  const sync = new InMemorySyncStore();
  const identity = new InMemoryIdentityRepository();
  const devices = new InMemoryDeviceRepository();
  const sessions = new InMemoryAuthSessionRepository();
  const deviceService = createDeviceService({ repository: devices });
  const sessionService = createAuthSessionService({
    repository: sessions,
    identityRepository: identity,
    deviceRepository: devices,
    tokenConfig,
    refreshTokenCodec: createRefreshTokenCodec(),
  });
  const identityService = createIdentityService({
    repository: identity,
    deviceService,
    sessionService,
    onWorkspaceCreated: (workspaceId) => {
      sync.workspaces.add(workspaceId);
    },
  });
  const app = createVinemaApiServer({
    store: sync,
    identityService,
    tokenConfig,
  });

  return { app, identity, sync, devices, sessions };
}

function register(
  app: ReturnType<typeof createVinemaApiServer>,
  email: string,
  password: string,
  clientDeviceId = "register-device",
) {
  return app.inject({
    method: "POST",
    url: "/auth/register",
    payload: { email, password, displayName: "Test User", device: devicePayload(clientDeviceId) },
  });
}

function devicePayload(clientDeviceId: string, overrides: Record<string, unknown> = {}) {
  return {
    clientDeviceId,
    name: "Vinema Web",
    platform: "web",
    appType: "WEB",
    appVersion: "test",
    ...overrides,
  };
}

function authHeaders(accessToken: string) {
  return { Authorization: `Bearer ${accessToken}` };
}

function tokenWith({
  userId,
  workspaceId,
  deviceId,
  issuer = tokenConfig.issuer,
  audience = tokenConfig.audience,
}: {
  userId: string;
  workspaceId: string;
  deviceId: string;
  issuer?: string;
  audience?: string;
}) {
  return issueAccessToken({
    userId,
    workspaceId,
    deviceId,
    sessionId: crypto.randomUUID(),
    config: { ...tokenConfig, issuer, audience },
  }).accessToken;
}

async function expectSessionRejected(
  app: ReturnType<typeof createVinemaApiServer>,
  accessToken: string,
  code: string,
) {
  const response = await app.inject({
    method: "GET",
    url: "/auth/session",
    headers: authHeaders(accessToken),
  });
  expect(response.statusCode).toBe(401);
  expect(response.json().error.code).toBe(code);
}

function captureMutation() {
  const at = "2026-07-30T12:00:00.000Z";
  return {
    mutationId: crypto.randomUUID(),
    entityType: "capture",
    operation: "upsert",
    entityId: crypto.randomUUID(),
    baseVersion: null,
    payload: {
      content: "Auth sync capture",
      createdAt: at,
      updatedAt: at,
      archivedAt: null,
    },
  };
}
