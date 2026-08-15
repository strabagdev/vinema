import "fake-indexeddb/auto";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { AuthClient } from "@/features/auth/auth-client";
import { AuthClientError } from "@/features/auth/auth-client";
import {
  createAuthController,
  type AuthController,
} from "@/features/auth/auth-controller";
import {
  InMemoryAuthSessionStorage,
  InMemoryLocalAuthIdentityStorage,
} from "@/features/auth/storage/in-memory-auth-session-storage";
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
const activeControllers = new Set<AuthController>();

describe("AuthController", () => {
  afterEach(async () => {
    for (const controller of activeControllers) {
      controller.dispose();
    }
    activeControllers.clear();
    TestBroadcastChannel.reset();
  });

  it("enters local mode without remote auth and persists a reusable identity", async () => {
    const authStorage = new InMemoryAuthSessionStorage();
    const localStorage = new InMemoryLocalAuthIdentityStorage();
    const client = createAuthClientMock();
    const authenticatedSync = createAuthenticatedSyncMock();
    const controller = trackController(createAuthController({
      authClient: client,
      authSessionStorage: authStorage,
      localAuthIdentityStorage: localStorage,
      deviceIdentityProvider: createDeviceIdentityProvider(),
      ensureLocalWorkspaceId: async () => workspaceId,
      authenticatedSync,
      clock: () => "2026-08-08T12:00:00.000Z",
    }));

    const state = await controller.enterLocalMode();

    expect(state).toMatchObject({
      status: "AUTHENTICATED_LOCAL",
      workspaceId,
      deviceId,
      sessionMode: "local",
    });
    expect(controller.getAccessToken()).toBeUndefined();
    expect(authStorage.snapshot()).toBeNull();
    expect(localStorage.snapshot()).toMatchObject({
      active: true,
      workspaceId,
      deviceId,
    });
    expect(client.login).not.toHaveBeenCalled();
    expect(client.register).not.toHaveBeenCalled();
    expect(client.refresh).not.toHaveBeenCalled();
    expect(authenticatedSync.handleAuthState).toHaveBeenCalledWith(
      expect.objectContaining({ status: "AUTHENTICATED_LOCAL" }),
    );

    await controller.syncNow();
    expect(authenticatedSync.syncNow).not.toHaveBeenCalled();
  });

  it("restores active local mode immediately and reuses it after local exit", async () => {
    const authStorage = new InMemoryAuthSessionStorage();
    const localStorage = new InMemoryLocalAuthIdentityStorage();
    const client = createAuthClientMock();
    const first = trackController(createAuthController({
      authClient: client,
      authSessionStorage: authStorage,
      localAuthIdentityStorage: localStorage,
      deviceIdentityProvider: createDeviceIdentityProvider(),
      ensureLocalWorkspaceId: async () => workspaceId,
    }));

    await first.enterLocalMode();
    const initialIdentity = localStorage.snapshot();
    await first.logout();

    expect(localStorage.snapshot()).toMatchObject({
      active: false,
      workspaceId,
    });
    expect(client.logout).not.toHaveBeenCalled();

    await first.enterLocalMode();
    expect(localStorage.snapshot()).toMatchObject({
      active: true,
      userId: initialIdentity?.userId,
      workspaceId: initialIdentity?.workspaceId,
      sessionId: initialIdentity?.sessionId,
    });

    const restored = trackController(createAuthController({
      authClient: client,
      authSessionStorage: authStorage,
      localAuthIdentityStorage: localStorage,
      deviceIdentityProvider: createDeviceIdentityProvider(),
      ensureLocalWorkspaceId: async () => "new-workspace",
    }));
    await restored.initialize();

    expect(restored.getState()).toMatchObject({
      status: "AUTHENTICATED_LOCAL",
      workspaceId,
      deviceId,
      sessionMode: "local",
    });
    expect(client.refresh).not.toHaveBeenCalled();
  });

  it("logs out locally before a hanging remote logout can finish", async () => {
    const storage = new InMemoryAuthSessionStorage();
    let remoteLogoutStarted = false;
    const controller = trackController(createAuthController({
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
    }));

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
    const controller = trackController(createAuthController({
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
    }));

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
    const controller = trackController(createAuthController({
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
    }));

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
    const controller = trackController(createAuthController({
      authClient: client,
      authSessionStorage: storage,
      deviceIdentityProvider: createDeviceIdentityProvider(),
      webLocks: new TestWebLocks(),
      isOnline: () => online,
      addOnlineListener(listener) {
        onlineListeners.add(listener);
        return () => onlineListeners.delete(listener);
      },
    }));

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

  it("shares an in-flight refresh when resume revalidation arrives after a suspended timer", async () => {
    const storage = new InMemoryAuthSessionStorage();
    let resolveRefresh: ((value: typeof session) => void) | undefined;
    const client = createAuthClientMock({
      refresh: vi.fn(
        () =>
          new Promise<typeof session>((resolve) => {
            resolveRefresh = resolve;
          }),
      ),
    });
    const controller = trackController(createAuthController({
      authClient: client,
      authSessionStorage: storage,
      deviceIdentityProvider: createDeviceIdentityProvider(),
      webLocks: new TestWebLocks(),
    }));

    await controller.login({ email: user.email, password: "password-123" });
    const refresh = controller.refresh();
    const revalidate = controller.revalidate();
    await flush();

    expect(client.refresh).toHaveBeenCalledTimes(1);
    resolveRefresh?.({
      ...session,
      accessToken: "resumed-access-token",
      refreshToken: "resumed-refresh-token",
    });

    await expect(refresh).resolves.toMatchObject({
      accessToken: "resumed-access-token",
    });
    await expect(revalidate).resolves.toMatchObject({
      accessToken: "resumed-access-token",
    });
    expect(controller.getAccessToken()).toBe("resumed-access-token");
  });

  it("keeps local session offline on temporary refresh errors and clears it when server rejects", async () => {
    const storage = new InMemoryAuthSessionStorage();
    const networkController = trackController(createAuthController({
      authClient: createAuthClientMock({
        refresh: vi.fn(async () => {
          throw new AuthClientError("NETWORK_ERROR", "Offline");
        }),
      }),
      authSessionStorage: storage,
      deviceIdentityProvider: createDeviceIdentityProvider(),
    }));

    await networkController.login({ email: user.email, password: "password-123" });
    await expect(networkController.refresh()).rejects.toMatchObject({ code: "NETWORK_ERROR" });
    expect(networkController.getState().status).toBe("AUTHENTICATED_OFFLINE");
    expect(storage.snapshot()).not.toBeNull();

    const invalidController = trackController(createAuthController({
      authClient: createAuthClientMock({
        refresh: vi.fn(async () => {
          throw new AuthClientError("TOKEN_INVALID", "Invalid");
        }),
      }),
      authSessionStorage: storage,
      deviceIdentityProvider: createDeviceIdentityProvider(),
    }));

    await invalidController.login({ email: user.email, password: "password-123" });
    await expect(invalidController.refresh()).rejects.toMatchObject({ code: "TOKEN_INVALID" });
    expect(invalidController.getState().status).toBe("UNAUTHENTICATED");
    expect(storage.snapshot()).toBeNull();
  });

  it("serializes simultaneous refresh across controllers and adopts the renewed session", async () => {
    const storage = new InMemoryAuthSessionStorage();
    await storage.save(validStoredSession());
    const channelFactory = TestBroadcastChannel.factory();
    const webLocks = new TestWebLocks();
    const refresh = vi.fn(async () => renewedSession());
    const first = createSharedController({
      storage,
      channelFactory,
      webLocks,
      authClient: createAuthClientMock({ refresh }),
      online: false,
    });
    const second = createSharedController({
      storage,
      channelFactory,
      webLocks,
      authClient: createAuthClientMock({ refresh }),
      online: false,
    });

    await first.initialize();
    await second.initialize();
    const [firstRefresh, secondRefresh] = await Promise.all([
      first.refresh(),
      second.refresh(),
    ]);
    await flush();

    expect(refresh).toHaveBeenCalledTimes(1);
    expect(firstRefresh.refreshToken).toBe("renewed-refresh-token");
    expect(secondRefresh.refreshToken).toBe("renewed-refresh-token");
    expect(first.getAccessToken()).toBe("renewed-access-token");
    expect(second.getAccessToken()).toBe("renewed-access-token");
    expect(storage.snapshot()?.refreshToken).toBe("renewed-refresh-token");
  });

  it("serializes simultaneous restore across controllers", async () => {
    const storage = new InMemoryAuthSessionStorage();
    await storage.save(validStoredSession());
    const channelFactory = TestBroadcastChannel.factory();
    const webLocks = new TestWebLocks();
    const refresh = vi.fn(async () => renewedSession({
      accessToken: "restored-access-token",
      refreshToken: "restored-refresh-token",
    }));
    const first = createSharedController({
      storage,
      channelFactory,
      webLocks,
      authClient: createAuthClientMock({ refresh }),
    });
    const second = createSharedController({
      storage,
      channelFactory,
      webLocks,
      authClient: createAuthClientMock({ refresh }),
    });

    await Promise.all([first.initialize(), second.initialize()]);
    await flush();

    expect(refresh).toHaveBeenCalledTimes(1);
    expect(first.getAccessToken()).toBe("restored-access-token");
    expect(second.getAccessToken()).toBe("restored-access-token");
    expect(storage.snapshot()?.refreshToken).toBe("restored-refresh-token");
  });

  it("propagates manual logout to another controller with the same session", async () => {
    const storage = new InMemoryAuthSessionStorage();
    await storage.save(validStoredSession());
    const channelFactory = TestBroadcastChannel.factory();
    const first = createSharedController({ storage, channelFactory, online: false });
    const second = createSharedController({ storage, channelFactory, online: false });

    await first.initialize();
    await second.initialize();
    await first.logout();
    await flush();

    expect(first.getState().status).toBe("UNAUTHENTICATED");
    expect(second.getState().status).toBe("UNAUTHENTICATED");
    expect(storage.snapshot()).toBeNull();
  });

  it("does not let a late rejected refresh delete a newer session", async () => {
    const storage = new InMemoryAuthSessionStorage();
    await storage.save(validStoredSession());
    let rejectRefresh: ((error: unknown) => void) | undefined;
    const controller = createSharedController({
      storage,
      online: false,
      authClient: createAuthClientMock({
        refresh: vi.fn(
          () =>
            new Promise<typeof session>((_resolve, reject) => {
              rejectRefresh = reject;
            }),
        ),
      }),
    });

    await controller.initialize();
    const refreshPromise = controller.refresh().catch(() => null);
    await flush();
    await storage.save({
      ...validStoredSession(),
      refreshToken: "newer-refresh-token",
      sessionId: "55555555-5555-4555-8555-555555555555",
      storedAt: "2026-07-30T12:05:00.000Z",
    });

    rejectRefresh?.(new AuthClientError("TOKEN_INVALID", "Invalid"));
    await refreshPromise;

    expect(storage.snapshot()?.refreshToken).toBe("newer-refresh-token");
  });

  it("uses the IndexedDB lease fallback when Web Locks is unavailable", async () => {
    const storage = new InMemoryAuthSessionStorage();
    await storage.save(validStoredSession());
    const channelFactory = TestBroadcastChannel.factory();
    const refresh = vi.fn(async () => renewedSession({
      accessToken: "fallback-access-token",
      refreshToken: "fallback-refresh-token",
    }));
    const first = createSharedController({
      storage,
      channelFactory,
      webLocks: null,
      authClient: createAuthClientMock({ refresh }),
      online: false,
    });
    const second = createSharedController({
      storage,
      channelFactory,
      webLocks: null,
      authClient: createAuthClientMock({ refresh }),
      online: false,
    });

    await first.initialize();
    await second.initialize();
    await Promise.all([first.refresh(), second.refresh()]);
    await flush();

    expect(refresh).toHaveBeenCalledTimes(1);
    expect(first.getAccessToken()).toBe("fallback-access-token");
    expect(second.getAccessToken()).toBe("fallback-access-token");
    expect(storage.snapshot()?.refreshToken).toBe("fallback-refresh-token");
  });

  it("keeps shared sessions offline on temporary coordinated refresh errors", async () => {
    const storage = new InMemoryAuthSessionStorage();
    await storage.save(validStoredSession());
    const controller = createSharedController({
      storage,
      online: false,
      authClient: createAuthClientMock({
        refresh: vi.fn(async () => {
          throw new AuthClientError("NETWORK_ERROR", "Offline");
        }),
      }),
    });

    await controller.initialize();
    await expect(controller.refresh()).rejects.toMatchObject({ code: "NETWORK_ERROR" });

    expect(controller.getState().status).toBe("AUTHENTICATED_OFFLINE");
    expect(storage.snapshot()).not.toBeNull();
  });

  it("disposes cross-tab channels and global listeners", async () => {
    const storage = new InMemoryAuthSessionStorage();
    await storage.save(validStoredSession());
    const onlineListeners = new Set<() => void>();
    const channelFactory = TestBroadcastChannel.factory();
    const controller = createAuthController({
      authClient: createAuthClientMock(),
      authSessionStorage: storage,
      localAuthIdentityStorage: new InMemoryLocalAuthIdentityStorage(),
      deviceIdentityProvider: createDeviceIdentityProvider(),
      broadcastChannelFactory: channelFactory,
      webLocks: new TestWebLocks(),
      isOnline: () => false,
      addOnlineListener(listener) {
        onlineListeners.add(listener);
        return () => onlineListeners.delete(listener);
      },
    });

    expect(TestBroadcastChannel.openCount()).toBe(1);
    expect(TestBroadcastChannel.listenerCount()).toBe(1);
    expect(onlineListeners.size).toBe(1);

    controller.dispose();

    expect(TestBroadcastChannel.openCount()).toBe(0);
    expect(TestBroadcastChannel.listenerCount()).toBe(0);
    expect(onlineListeners.size).toBe(0);
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
  for (let index = 0; index < 10; index += 1) {
    await Promise.resolve();
  }
  await new Promise((resolve) => setTimeout(resolve, 0));
}

function renewedSession(overrides: Partial<typeof session> = {}) {
  return {
    ...session,
    accessToken: "renewed-access-token",
    refreshToken: "renewed-refresh-token",
    sessionId: "55555555-5555-4555-8555-555555555555",
    ...overrides,
  };
}

function createSharedController({
  storage,
  authClient = createAuthClientMock(),
  channelFactory = TestBroadcastChannel.factory(),
  webLocks = new TestWebLocks(),
  online = true,
}: {
  storage: InMemoryAuthSessionStorage;
  authClient?: AuthClient;
  channelFactory?: (name: string) => TestBroadcastChannel;
  webLocks?: TestWebLocks | null;
  online?: boolean;
}) {
  return trackController(createAuthController({
    authClient,
    authSessionStorage: storage,
    localAuthIdentityStorage: new InMemoryLocalAuthIdentityStorage(),
    deviceIdentityProvider: createDeviceIdentityProvider(),
    broadcastChannelFactory: channelFactory,
    webLocks,
    isOnline: () => online,
  }));
}

function trackController(controller: AuthController) {
  activeControllers.add(controller);
  return controller;
}

class TestWebLocks {
  private queues = new Map<string, Promise<unknown>>();

  request<T>(
    name: string,
    _options: { mode: "exclusive" },
    callback: () => T | Promise<T>,
  ): Promise<T> {
    const previous = this.queues.get(name) ?? Promise.resolve();
    const next = previous.catch(() => undefined).then(callback);
    this.queues.set(name, next.catch(() => undefined));
    return next;
  }
}

class TestBroadcastChannel {
  private static channels = new Map<string, Set<TestBroadcastChannel>>();
  private listener: ((event: { data: unknown }) => void) | null = null;

  static factory() {
    return (name: string) => new TestBroadcastChannel(name);
  }

  static reset() {
    this.channels.clear();
  }

  static openCount() {
    return Array.from(this.channels.values()).reduce(
      (count, channels) => count + channels.size,
      0,
    );
  }

  static listenerCount() {
    return Array.from(this.channels.values()).reduce(
      (count, channels) =>
        count +
        Array.from(channels).filter((channel) => channel.listener !== null).length,
      0,
    );
  }

  constructor(private readonly name: string) {
    const channels = TestBroadcastChannel.channels.get(name) ?? new Set();
    channels.add(this);
    TestBroadcastChannel.channels.set(name, channels);
  }

  postMessage(message: unknown) {
    for (const channel of TestBroadcastChannel.channels.get(this.name) ?? []) {
      if (channel === this) {
        continue;
      }

      queueMicrotask(() => {
        channel.listener?.({ data: message });
      });
    }
  }

  addEventListener(_type: "message", listener: (event: { data: unknown }) => void) {
    this.listener = listener;
  }

  removeEventListener(_type: "message", listener: (event: { data: unknown }) => void) {
    if (this.listener === listener) {
      this.listener = null;
    }
  }

  close() {
    TestBroadcastChannel.channels.get(this.name)?.delete(this);
    this.listener = null;
  }
}
