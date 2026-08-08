import { describe, expect, it, vi } from "vitest";
import {
  createAuthenticationLifecycle,
} from "@/features/auth/authentication-lifecycle";
import type { AuthRefreshCoordinator } from "@/features/auth/auth-refresh-coordinator";
import { createAuthService } from "@/features/auth/auth-service";
import { PublicApiUrlError } from "@/features/auth/public-api-url";
import { InMemoryAuthSessionStorage } from "@/features/auth/storage/in-memory-auth-session-storage";
import {
  createAuthStateEngine,
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

describe("AuthenticationLifecycle", () => {
  it("initializes once, restores and schedules refresh from the published state", async () => {
    const storage = new InMemoryAuthSessionStorage();
    await storage.save({
      refreshToken: "stored-refresh-token",
      sessionId,
      deviceId,
      storedAt: "2026-07-30T12:00:00.000Z",
    });
    const client = createAuthClientMock({
      refresh: vi.fn(async () => ({
        ...session,
        accessToken: "restored-access-token",
        refreshToken: "rotated-refresh-token",
      })),
    });
    const coordinator = createRefreshCoordinatorMock();
    const authenticatedSync = createAuthenticatedSyncMock();
    const lifecycle = createAuthenticationLifecycle({
      service: createAuthService({
        authClient: client,
        authSessionStorage: storage,
        deviceIdentityProvider: createDeviceIdentityProvider(),
      }),
      refreshCoordinator: coordinator,
      authenticatedSync,
    });

    const first = lifecycle.initialize();
    const second = lifecycle.initialize();

    expect(first).toBe(second);
    await expect(first).resolves.toMatchObject({
      accessToken: "restored-access-token",
    });
    expect(client.refresh).toHaveBeenCalledTimes(1);
    expect(coordinator.schedule).toHaveBeenCalledWith(accessTokenExpiresAt);
    expect(authenticatedSync.handleAuthState).toHaveBeenCalledWith(
      expect.objectContaining({
        status: "AUTHENTICATED_ONLINE",
        workspaceId,
        deviceId,
      }),
    );
    expect(lifecycle.getState().status).toBe("AUTHENTICATED_ONLINE");
  });

  it("delegates login, register, refresh and logout through one lifecycle authority", async () => {
    const client = createAuthClientMock();
    const coordinator = createRefreshCoordinatorMock({
      refreshNow: vi.fn(async () => ({
        ...session,
        accessToken: "manual-refresh-token",
        refreshToken: "manual-refresh-rotated",
      })),
    });
    const authenticatedSync = createAuthenticatedSyncMock();
    const lifecycle = createAuthenticationLifecycle({
      service: createAuthService({
        authClient: client,
        authSessionStorage: new InMemoryAuthSessionStorage(),
        deviceIdentityProvider: createDeviceIdentityProvider(),
      }),
      refreshCoordinator: coordinator,
      authenticatedSync,
    });

    await lifecycle.register({ email: user.email, password: "password-123" });
    expect(client.register).toHaveBeenCalledTimes(1);
    expect(coordinator.schedule).toHaveBeenCalledWith(accessTokenExpiresAt);
    expect(authenticatedSync.handleAuthState).toHaveBeenCalledWith(
      expect.objectContaining({ status: "AUTHENTICATED_ONLINE" }),
    );

    await lifecycle.login({ email: user.email, password: "password-123" });
    expect(client.login).toHaveBeenCalledTimes(1);

    await expect(lifecycle.refresh()).resolves.toMatchObject({
      accessToken: "manual-refresh-token",
    });
    expect(coordinator.refreshNow).toHaveBeenCalledTimes(1);

    await lifecycle.logout();
    await lifecycle.logout();
    expect(coordinator.cancel).toHaveBeenCalled();
    expect(authenticatedSync.stop).toHaveBeenCalled();
    expect(client.logout).toHaveBeenCalledTimes(1);
    expect(lifecycle.getState().status).toBe("UNAUTHENTICATED");
  });

  it("disposes all resources idempotently and ignores late restore results", async () => {
    const storage = new InMemoryAuthSessionStorage();
    await storage.save({
      refreshToken: "stored-refresh-token",
      sessionId,
      deviceId,
      storedAt: "2026-07-30T12:00:00.000Z",
    });
    let resolveRefresh: ((value: typeof session) => void) | undefined;
    const service = createAuthService({
      authClient: createAuthClientMock({
        refresh: vi.fn(
          () => new Promise<typeof session>((resolve) => {
            resolveRefresh = resolve;
          }),
        ),
      }),
      authSessionStorage: storage,
      deviceIdentityProvider: createDeviceIdentityProvider(),
    });
    const coordinator = createRefreshCoordinatorMock();
    const syncBridge = { dispose: vi.fn() };
    const authenticatedSync = createAuthenticatedSyncMock();
    const lifecycle = createAuthenticationLifecycle({
      service,
      refreshCoordinator: coordinator,
      syncBridge,
      authenticatedSync,
    });

    const restore = lifecycle.initialize();
    await flush();
    lifecycle.dispose();
    lifecycle.dispose();
    resolveRefresh?.(session);
    await restore;

    expect(coordinator.dispose).toHaveBeenCalledTimes(1);
    expect(authenticatedSync.dispose).toHaveBeenCalledTimes(1);
    expect(syncBridge.dispose).toHaveBeenCalledTimes(1);
    expect(lifecycle.getAccessToken()).toBeUndefined();
    expect(lifecycle.getState().status).toBe("DISPOSING");
  });

  it("handles configuration errors without issuing auth requests", async () => {
    const client = createAuthClientMock();
    const lifecycle = createAuthenticationLifecycle({
      service: createAuthService({
        authClient: client,
        authSessionStorage: new InMemoryAuthSessionStorage(),
        deviceIdentityProvider: createDeviceIdentityProvider(),
      }),
      refreshCoordinator: createRefreshCoordinatorMock(),
      configError: new PublicApiUrlError("NEXT_PUBLIC_API_URL no esta configurada."),
    });

    await expect(
      lifecycle.login({ email: user.email, password: "password-123" }),
    ).rejects.toBeInstanceOf(PublicApiUrlError);
    expect(client.login).not.toHaveBeenCalled();
    expect(lifecycle.getState()).toMatchObject({
      status: "UNAUTHENTICATED",
      error: { message: "La API de Vinema no esta configurada." },
    });
  });

  it("publishes sync only from public auth states", async () => {
    const authStateEngine = createAuthStateEngine();
    const syncStateEngine = createSyncStateEngine();
    const bridge = createAuthSyncStateBridge({ authStateEngine, syncStateEngine });
    const lifecycle = createAuthenticationLifecycle({
      service: createAuthService({
        authClient: createAuthClientMock(),
        authSessionStorage: new InMemoryAuthSessionStorage(),
        authStateEngine,
        deviceIdentityProvider: createDeviceIdentityProvider(),
      }),
      refreshCoordinator: createRefreshCoordinatorMock(),
      syncBridge: bridge,
    });

    authStateEngine.dispatch({ type: "RESTORE_STARTED", at: "2026-07-30T12:00:00.000Z" });
    expect(syncStateEngine.getState().authentication).toBe("UNKNOWN");

    await lifecycle.login({ email: user.email, password: "password-123" });
    expect(syncStateEngine.getState().authentication).toBe("AUTHENTICATED_ONLINE");

    authStateEngine.dispatch({
      type: "AUTHENTICATED_LOCAL",
      at: "2026-07-30T12:00:00.000Z",
      user,
      workspaceId,
      deviceId,
      sessionId,
    });
    expect(syncStateEngine.getState().authentication).toBe("AUTHENTICATED_LOCAL");

    await lifecycle.logout();
    expect(syncStateEngine.getState().authentication).toBe("UNAUTHENTICATED");
  });

  it("ignores invalid state transitions after disposing", () => {
    const disposing = reduceAuthState(
      {
        status: "AUTHENTICATED_ONLINE",
        user,
        workspaceId,
        deviceId,
        sessionId,
        accessTokenExpiresAt,
        refreshTokenExpiresAt,
        lastAuthenticatedAt: "2026-07-30T12:00:00.000Z",
        error: null,
      },
      { type: "DISPOSE_STARTED", at: "2026-07-30T12:01:00.000Z" },
    );
    const lateAuth = reduceAuthState(disposing, {
      type: "AUTH_SUCCEEDED",
      at: "2026-07-30T12:02:00.000Z",
      user,
      workspaceId,
      deviceId,
      sessionId,
      accessTokenExpiresAt,
      refreshTokenExpiresAt,
    });

    expect(disposing.status).toBe("DISPOSING");
    expect(lateAuth).toEqual(disposing);
  });
});

function createAuthClientMock(
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
    getCurrentDevice: vi.fn(async () => ({ device: session.device })),
    ...overrides,
  };
}

function createRefreshCoordinatorMock(
  overrides: Partial<AuthRefreshCoordinator> = {},
): AuthRefreshCoordinator {
  return {
    schedule: vi.fn(),
    refreshNow: vi.fn(async () => session),
    cancel: vi.fn(),
    dispose: vi.fn(),
    ...overrides,
  };
}

function createAuthenticatedSyncMock() {
  return {
    handleAuthState: vi.fn(),
    syncNow: vi.fn(),
    stop: vi.fn(),
    dispose: vi.fn(),
  };
}

function createDeviceIdentityProvider(): DeviceIdentityProvider {
  return {
    getClientDeviceId: async () => deviceMetadata.clientDeviceId,
    getDeviceMetadata: async () => deviceMetadata,
  };
}

async function flush() {
  await Promise.resolve();
  await Promise.resolve();
}
