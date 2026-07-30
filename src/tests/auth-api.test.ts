import { describe, expect, it } from "vitest";
import { createVinemaApiServer } from "../../server/src/http/create-server";
import { loadAuthTokenConfig } from "../../server/src/auth/auth-config";
import { issueAccessToken } from "../../server/src/auth/access-token";
import { createIdentityService } from "../../server/src/auth/identity-service";
import { hashPassword } from "../../server/src/auth/password";
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
  it("registers with normalized email, hashes password and creates a personal workspace", async () => {
    const setup = createSetup();
    const response = await register(setup.app, "User@Example.Test", "password-123");

    expect(response.statusCode).toBe(201);
    expect(response.json()).toMatchObject({
      user: { email: "User@Example.Test", displayName: "Test User" },
      workspaceId: expect.any(String),
      accessToken: expect.any(String),
      accessTokenExpiresAt: expect.any(String),
    });
    expect(response.body).not.toContain("passwordHash");
    expect(response.body).not.toContain("password-123");

    const stored = await setup.identity.findUserByNormalizedEmail("user@example.test");
    expect(stored).toBeTruthy();
    expect(stored?.passwordHash).not.toBe("password-123");
    expect(stored?.personalWorkspaceId).toBe(response.json().workspaceId);
    expect(setup.sync.workspaces.has(response.json().workspaceId)).toBe(true);
  });

  it("rejects duplicate email, invalid password and invalid credentials safely", async () => {
    const setup = createSetup();
    await register(setup.app, "dupe@example.test", "password-123");

    const duplicate = await register(setup.app, "DUPE@example.test", "password-123");
    const weakPassword = await register(setup.app, "weak@example.test", "short");
    const invalid = await setup.app.inject({
      method: "POST",
      url: "/auth/login",
      payload: { email: "missing@example.test", password: "bad-password" },
    });

    expect(duplicate.statusCode).toBe(409);
    expect(duplicate.json().error.code).toBe("EMAIL_ALREADY_EXISTS");
    expect(weakPassword.statusCode).toBe(400);
    expect(invalid.statusCode).toBe(401);
    expect(invalid.json().error.code).toBe("INVALID_CREDENTIALS");
    expect(invalid.body).not.toContain("passwordHash");
  });

  it("logs in case-insensitively, rejects disabled users and returns current session", async () => {
    const setup = createSetup();
    const registered = await register(setup.app, "Case@Example.Test", "password-123");
    const login = await setup.app.inject({
      method: "POST",
      url: "/auth/login",
      payload: { email: "case@example.test", password: "password-123" },
    });
    const session = await setup.app.inject({
      method: "GET",
      url: "/auth/session",
      headers: { Authorization: `Bearer ${login.json().accessToken}` },
    });
    const user = await setup.identity.findUserByNormalizedEmail("case@example.test");
    setup.identity.disableUser(user!.id);
    const disabled = await setup.app.inject({
      method: "POST",
      url: "/auth/login",
      payload: { email: "case@example.test", password: "password-123" },
    });

    expect(login.statusCode).toBe(200);
    expect(login.json().workspaceId).toBe(registered.json().workspaceId);
    expect(session.statusCode).toBe(200);
    expect(session.json()).toMatchObject({
      workspaceId: registered.json().workspaceId,
      tokenExpiresAt: expect.any(String),
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
          config: { ...tokenConfig, accessTokenTtlSeconds: 1 },
          now: new Date("2026-07-30T12:00:00.000Z"),
        }).accessToken}`,
      },
    });
    const wrongIssuer = tokenWith({ issuer: "wrong", workspaceId: registered.json().workspaceId, userId: registered.json().user.id });
    const wrongAudience = tokenWith({ audience: "wrong", workspaceId: registered.json().workspaceId, userId: registered.json().user.id });

    expect(missing.json().error.code).toBe("TOKEN_MISSING");
    expect(invalid.json().error.code).toBe("TOKEN_INVALID");
    expect(expired.json().error.code).toBe("TOKEN_EXPIRED");
    await expectSessionRejected(setup.app, wrongIssuer, "TOKEN_INVALID");
    await expectSessionRejected(setup.app, wrongAudience, "TOKEN_INVALID");
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
    const pullB = await setup.app.inject({
      method: "GET",
      url: `/api/sync/pull?workspaceId=${userB.json().workspaceId}&cursor=0&limit=10`,
      headers: authHeaders(userB.json().accessToken),
    });

    expect(pushA.statusCode).toBe(200);
    expect(pullA.json().changes).toHaveLength(1);
    expect(forbiddenPush.statusCode).toBe(403);
    expect(forbiddenPull.statusCode).toBe(403);
    expect(pullB.json().changes).toHaveLength(0);
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
  const identityService = createIdentityService({
    repository: identity,
    tokenConfig,
    onWorkspaceCreated: (workspaceId) => {
      sync.workspaces.add(workspaceId);
    },
  });
  const app = createVinemaApiServer({
    store: sync,
    identityService,
    tokenConfig,
  });

  return { app, identity, sync };
}

function register(app: ReturnType<typeof createVinemaApiServer>, email: string, password: string) {
  return app.inject({
    method: "POST",
    url: "/auth/register",
    payload: { email, password, displayName: "Test User" },
  });
}

function authHeaders(accessToken: string) {
  return { Authorization: `Bearer ${accessToken}` };
}

function tokenWith({
  userId,
  workspaceId,
  issuer = tokenConfig.issuer,
  audience = tokenConfig.audience,
}: {
  userId: string;
  workspaceId: string;
  issuer?: string;
  audience?: string;
}) {
  return issueAccessToken({
    userId,
    workspaceId,
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
