import { describe, expect, it, vi } from "vitest";
import type { AuthClient } from "@/features/auth/auth-client";
import { AuthClientError } from "@/features/auth/auth-client";
import { createAuthController } from "@/features/auth/auth-controller";
import { InMemoryAuthSessionStorage } from "@/features/auth/storage/in-memory-auth-session-storage";
import type { DeviceIdentityProvider } from "@/features/auth/device-identity-provider";

const user = {
  id: "11111111-1111-4111-8111-111111111111",
  email: "user@example.test",
  displayName: "User",
};
const workspaceId = "22222222-2222-4222-8222-222222222222";
const deviceId = "33333333-3333-4333-8333-333333333333";
const sessionId = "44444444-4444-4444-8444-444444444444";
const accessTokenExpiresAt = "2099-07-30T12:15:00.000Z";
const refreshTokenExpiresAt = "2099-08-29T12:00:00.000Z";
const deviceMetadata = {
  clientDeviceId: "local-device",
  name: "Vinema Web",
  platform: "web" as const,
  appType: "WEB" as const,
  appVersion: "test",
};
const session = {
  user,
  workspaceId,
  deviceId,
  device: {
    id: deviceId,
    userId: user.id,
    ...deviceMetadata,
    createdAt: "2026-07-30T12:00:00.000Z",
    updatedAt: "2026-07-30T12:00:00.000Z",
    lastSeenAt: "2026-07-30T12:00:00.000Z",
    revokedAt: null,
  },
  sessionId,
  accessToken: "access-token",
  accessTokenExpiresAt,
  refreshToken: "refresh-token",
  refreshTokenExpiresAt,
};

describe("AuthController", () => {
  it("logs out locally before a hanging remote logout can finish", async () => {
    const storage = new InMemoryAuthSessionStorage();
    let remoteLogoutStarted = false;
    const controller = createAuthController({
      authClient: createAuthClientMock({
        logout: vi.fn(
          async () =>
            new Promise<{ ok: true }>(() => {
              remoteLogoutStarted = true;
            }),
        ),
      }),
      authSessionStorage: storage,
      deviceIdentityProvider: createDeviceIdentityProvider(),
      authenticatedSync: createAuthenticatedSyncMock(),
    });

    await controller.login({ email: user.email, password: "password-123" });
    expect(storage.snapshot()).not.toBeNull();

    await controller.logout();

    expect(remoteLogoutStarted).toBe(true);
    expect(storage.snapshot()).toBeNull();
    expect(controller.getState().status).toBe("UNAUTHENTICATED");
    expect(controller.getAccessToken()).toBeUndefined();
  });

  it("ignores late restore and refresh responses after logout", async () => {
    const storage = new InMemoryAuthSessionStorage();
    await storage.save(validStoredSession());
    let resolveRestore: ((value: typeof session) => void) | undefined;
    let resolveRefresh: ((value: typeof session) => void) | undefined;
    const controller = createAuthController({
      authClient: createAuthClientMock({
        refresh: vi.fn()
          .mockImplementationOnce(
            () =>
              new Promise<typeof session>((resolve) => {
                resolveRestore = resolve;
              }),
          )
          .mockImplementationOnce(
            () =>
              new Promise<typeof session>((resolve) => {
                resolveRefresh = resolve;
              }),
          ),
      }),
      authSessionStorage: storage,
      deviceIdentityProvider: createDeviceIdentityProvider(),
    });

    const restore = controller.initialize();
    await flush();
    await controller.logout();
    resolveRestore?.(session);
    await restore;

    expect(controller.getState().status).toBe("UNAUTHENTICATED");
    expect(storage.snapshot()).toBeNull();

    await storage.save(validStoredSession());
    await controller.initialize();
    const refresh = controller.refresh().catch(() => null);
    await controller.logout();
    resolveRefresh?.({ ...session, accessToken: "late-access-token" });
    await refresh;

    expect(controller.getState().status).toBe("UNAUTHENTICATED");
    expect(controller.getAccessToken()).toBeUndefined();
  });

  it("login cancels pending restore and cannot be overwritten by a late restore", async () => {
    const storage = new InMemoryAuthSessionStorage();
    await storage.save(validStoredSession());
    let resolveRestore: ((value: typeof session) => void) | undefined;
    const controller = createAuthController({
      authClient: createAuthClientMock({
        refresh: vi.fn(
          () =>
            new Promise<typeof session>((resolve) => {
              resolveRestore = resolve;
            }),
        ),
        login: vi.fn(async () => ({
          ...session,
          accessToken: "login-access-token",
          refreshToken: "login-refresh-token",
        })),
      }),
      authSessionStorage: storage,
      deviceIdentityProvider: createDeviceIdentityProvider(),
    });

    const restore = controller.initialize();
    await flush();
    await controller.login({ email: user.email, password: "password-123" });
    resolveRestore?.({ ...session, accessToken: "late-restore-access-token" });
    await restore;

    expect(controller.getState()).toMatchObject({
      status: "AUTHENTICATED_ONLINE",
      workspaceId,
      deviceId,
    });
    expect(controller.getAccessToken()).toBe("login-access-token");
    expect(storage.snapshot()?.refreshToken).toBe("login-refresh-token");
  });

  it("restores offline directly, revalidates on online event and ignores online after logout", async () => {
    const storage = new InMemoryAuthSessionStorage();
    await storage.save(validStoredSession());
    const onlineListeners = new Set<() => void>();
    let online = false;
    const client = createAuthClientMock({
      refresh: vi.fn(async () => ({
        ...session,
        accessToken: "revalidated-access-token",
        refreshToken: "revalidated-refresh-token",
      })),
    });
    const controller = createAuthController({
      authClient: client,
      authSessionStorage: storage,
      deviceIdentityProvider: createDeviceIdentityProvider(),
      isOnline: () => online,
      addOnlineListener(listener) {
        onlineListeners.add(listener);
        return () => onlineListeners.delete(listener);
      },
    });

    await controller.initialize();
    expect(controller.getState().status).toBe("AUTHENTICATED_OFFLINE");
    expect(client.refresh).not.toHaveBeenCalled();

    online = true;
    for (const listener of onlineListeners) {
      listener();
    }
    await flush();

    expect(controller.getState().status).toBe("AUTHENTICATED_ONLINE");
    expect(controller.getAccessToken()).toBe("revalidated-access-token");

    await controller.logout();
    for (const listener of onlineListeners) {
      listener();
    }
    await flush();

    expect(client.refresh).toHaveBeenCalledTimes(1);
    expect(controller.getState().status).toBe("UNAUTHENTICATED");
  });

  it("keeps local session offline on temporary refresh errors and clears it when server rejects", async () => {
    const storage = new InMemoryAuthSessionStorage();
    const networkController = createAuthController({
      authClient: createAuthClientMock({
        refresh: vi.fn(async () => {
          throw new AuthClientError("NETWORK_ERROR", "Offline");
        }),
      }),
      authSessionStorage: storage,
      deviceIdentityProvider: createDeviceIdentityProvider(),
    });

    await networkController.login({ email: user.email, password: "password-123" });
    await expect(networkController.refresh()).rejects.toMatchObject({ code: "NETWORK_ERROR" });
    expect(networkController.getState().status).toBe("AUTHENTICATED_OFFLINE");
    expect(storage.snapshot()).not.toBeNull();

    const invalidController = createAuthController({
      authClient: createAuthClientMock({
        refresh: vi.fn(async () => {
          throw new AuthClientError("TOKEN_INVALID", "Invalid");
        }),
      }),
      authSessionStorage: storage,
      deviceIdentityProvider: createDeviceIdentityProvider(),
    });

    await invalidController.login({ email: user.email, password: "password-123" });
    await expect(invalidController.refresh()).rejects.toMatchObject({ code: "TOKEN_INVALID" });
    expect(invalidController.getState().status).toBe("UNAUTHENTICATED");
    expect(storage.snapshot()).toBeNull();
  });
});

function validStoredSession() {
  return {
    refreshToken: "stored-refresh-token",
    sessionId,
    deviceId,
    storedAt: "2026-07-30T12:00:00.000Z",
    user,
    workspaceId,
    accessTokenExpiresAt,
    refreshTokenExpiresAt,
  };
}

function createAuthClientMock(overrides: Partial<AuthClient> = {}): AuthClient {
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
    getCurrentDevice: vi.fn(async () => ({ device: session.device })),
    ...overrides,
  };
}

function createDeviceIdentityProvider(): DeviceIdentityProvider {
  return {
    getClientDeviceId: vi.fn(async () => deviceId),
    getDeviceMetadata: vi.fn(async () => deviceMetadata),
  };
}

function createAuthenticatedSyncMock() {
  return {
    handleAuthState: vi.fn(),
    syncNow: vi.fn(async () => undefined),
    stop: vi.fn(),
    dispose: vi.fn(),
  };
}

async function flush() {
  await Promise.resolve();
  await Promise.resolve();
}
