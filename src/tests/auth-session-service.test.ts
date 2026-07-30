import { describe, expect, it } from "vitest";
import { loadAuthTokenConfig } from "../../server/src/auth/auth-config";
import { createAuthSessionService } from "../../server/src/auth/auth-session-service";
import { createDeviceService } from "../../server/src/auth/device-service";
import { createRefreshTokenCodec } from "../../server/src/auth/refresh-token-codec";
import { hashPassword } from "../../server/src/auth/password";
import { InMemoryAuthSessionRepository } from "../../server/src/testing/in-memory-auth-session-repository";
import { InMemoryDeviceRepository } from "../../server/src/testing/in-memory-device-repository";
import { InMemoryIdentityRepository } from "../../server/src/testing/in-memory-identity-repository";

const tokenConfig = loadAuthTokenConfig({
  NODE_ENV: "test",
  VINEMA_AUTH_ACCESS_TOKEN_SECRET: "test-auth-secret-with-enough-length",
  VINEMA_AUTH_ISSUER: "vinema-test",
  VINEMA_AUTH_AUDIENCE: "vinema-test-client",
  VINEMA_AUTH_ACCESS_TOKEN_TTL_SECONDS: "900",
  VINEMA_AUTH_REFRESH_TOKEN_TTL_SECONDS: "2592000",
});

describe("persistent auth sessions", () => {
  it("RefreshTokenCodec creates opaque parseable tokens and verifies hashes safely", () => {
    const codec = createRefreshTokenCodec();
    const sessionId = crypto.randomUUID();
    const first = codec.generate(sessionId);
    const second = codec.generate(sessionId);
    const parsed = codec.parse(first);
    const hash = codec.hash(parsed.secret);

    expect(first).not.toBe(second);
    expect(first).toMatch(new RegExp(`^${sessionId}\\.[A-Za-z0-9_-]{43}$`));
    expect(parsed.sessionId).toBe(sessionId);
    expect(first).not.toContain("user@example.test");
    expect(codec.verify(parsed.secret, hash)).toBe(true);
    expect(codec.verify(`${parsed.secret}x`, hash)).toBe(false);
    try {
      codec.parse("malformed");
      throw new Error("Expected malformed token to fail");
    } catch (error) {
      expect(error).toMatchObject({ code: "REFRESH_TOKEN_INVALID" });
    }
  });

  it("creates sessions with hashed refresh tokens and rotates one generation at a time", async () => {
    const setup = await createSetup();
    const created = await setup.sessionService.createSession({
      userId: setup.user.id,
      workspaceId: setup.workspace.id,
      deviceId: setup.device.id,
      now: new Date("2026-07-30T12:00:00.000Z"),
    });
    const stored = setup.sessions.sessions.get(created.session.id);

    expect(stored).toMatchObject({
      userId: setup.user.id,
      deviceId: setup.device.id,
      generation: 1,
      revokedAt: null,
      replacedBySessionId: null,
    });
    expect(stored?.refreshTokenHash).not.toBe(created.refreshToken);
    expect(created.accessToken).toBeTruthy();
    expect(created.refreshTokenExpiresAt).toBe("2026-08-29T12:00:00.000Z");

    const [first, second] = await Promise.allSettled([
      setup.sessionService.refreshSession({
        refreshToken: created.refreshToken,
        now: new Date("2026-07-30T12:01:00.000Z"),
      }),
      setup.sessionService.refreshSession({
        refreshToken: created.refreshToken,
        now: new Date("2026-07-30T12:01:00.000Z"),
      }),
    ]);
    const fulfilled = [first, second].filter((result) => result.status === "fulfilled");
    const rejected = [first, second].filter((result) => result.status === "rejected");

    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    expect(setup.sessions.sessions.get(created.session.id)?.replacedBySessionId).toBeTruthy();
  });

  it("detects reuse, revokes the family, rejects revoked devices and logs out idempotently", async () => {
    const setup = await createSetup();
    const created = await setup.sessionService.createSession({
      userId: setup.user.id,
      workspaceId: setup.workspace.id,
      deviceId: setup.device.id,
      now: new Date("2026-07-30T12:00:00.000Z"),
    });
    const refreshed = await setup.sessionService.refreshSession({
      refreshToken: created.refreshToken,
      now: new Date("2026-07-30T12:01:00.000Z"),
    });

    await expect(
      setup.sessionService.refreshSession({
        refreshToken: created.refreshToken,
        now: new Date("2026-07-30T12:02:00.000Z"),
      }),
    ).rejects.toMatchObject({ code: "REFRESH_TOKEN_REUSED" });
    await expect(
      setup.sessionService.refreshSession({
        refreshToken: refreshed.refreshToken,
        now: new Date("2026-07-30T12:03:00.000Z"),
      }),
    ).rejects.toMatchObject({ code: "REFRESH_TOKEN_REVOKED" });

    const relogin = await setup.sessionService.createSession({
      userId: setup.user.id,
      workspaceId: setup.workspace.id,
      deviceId: setup.device.id,
      revokeExistingForDevice: true,
      now: new Date("2026-07-30T12:04:00.000Z"),
    });
    await setup.sessionService.revokeSession({
      refreshToken: relogin.refreshToken,
      now: new Date("2026-07-30T12:05:00.000Z"),
    });
    await setup.sessionService.revokeSession({
      refreshToken: relogin.refreshToken,
      now: new Date("2026-07-30T12:06:00.000Z"),
    });
    await expect(
      setup.sessionService.refreshSession({
        refreshToken: relogin.refreshToken,
        now: new Date("2026-07-30T12:07:00.000Z"),
      }),
    ).rejects.toMatchObject({ code: "REFRESH_TOKEN_REVOKED" });

    setup.devices.revoke(setup.device.id, new Date("2026-07-30T12:08:00.000Z"));
    await expect(
      setup.sessionService.createSession({
        userId: setup.user.id,
        workspaceId: setup.workspace.id,
        deviceId: setup.device.id,
        now: new Date("2026-07-30T12:09:00.000Z"),
      }),
    ).rejects.toMatchObject({ code: "DEVICE_REVOKED" });
  });
});

async function createSetup() {
  const identity = new InMemoryIdentityRepository();
  const devices = new InMemoryDeviceRepository();
  const sessions = new InMemoryAuthSessionRepository();
  const deviceService = createDeviceService({ repository: devices });
  const { user, workspace } = await identity.createUserWithPersonalWorkspace({
    email: "user@example.test",
    normalizedEmail: "user@example.test",
    passwordHash: await hashPassword("password-123"),
    displayName: "User",
    workspaceName: "Personal",
  });
  const { device } = await deviceService.registerOrUpdateDevice({
    userId: user.id,
    clientDeviceId: "local-device",
    name: "Vinema Web",
    platform: "web",
    appType: "WEB",
    appVersion: "test",
  });
  const sessionService = createAuthSessionService({
    repository: sessions,
    identityRepository: identity,
    deviceRepository: devices,
    tokenConfig,
    refreshTokenCodec: createRefreshTokenCodec(),
  });

  return { identity, devices, sessions, sessionService, user, workspace, device };
}
