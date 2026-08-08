import type { AuthenticatedSession, AuthenticatedUser } from "@vinema/sync-contracts";
import { AuthClientError, type AuthClient } from "@/features/auth/auth-client";
import type { AuthLoginInput, AuthRegisterInput } from "@/features/auth/auth-service";
import {
  createAuthStateEngine,
  initialAuthState,
  type AuthState,
  type AuthStateEngine,
} from "@/features/auth/auth-state-engine";
import type { DeviceIdentityProvider } from "@/features/auth/device-identity-provider";
import type {
  AuthSessionStorage,
  LocalAuthIdentityStorage,
  StoredLocalAuthIdentity,
  StoredAuthSession,
} from "@/features/auth/storage/auth-session-storage";
import { isMigratedLocalAuthIdentity } from "@/features/auth/storage/auth-session-storage";
import type { AccessTokenProvider } from "@/features/auth/access-token-provider";
import type { AuthenticatedSyncLifecycle } from "@/features/sync/authenticated-sync-lifecycle";

const RESTORE_TIMEOUT_MS = 4_000;
const REFRESH_EARLY_MS = 60_000;
const MIN_REFRESH_DELAY_MS = 1_000;

type AuthControllerIntent =
  | "IDLE"
  | "RESTORE"
  | "LOGIN"
  | "REGISTER"
  | "ENTER_LOCAL"
  | "REFRESH"
  | "REVALIDATE"
  | "LOGOUT"
  | "DISPOSE";

export type AuthController = AccessTokenProvider & {
  initialize(): Promise<AuthenticatedSession | null>;
  login(input: AuthLoginInput): Promise<AuthenticatedSession>;
  register(input: AuthRegisterInput): Promise<AuthenticatedSession>;
  enterLocalMode(): Promise<AuthState>;
  refresh(): Promise<AuthenticatedSession>;
  revalidate(): Promise<AuthenticatedSession | null>;
  logout(): Promise<void>;
  syncNow(): Promise<void>;
  dispose(): void;
  subscribe(listener: (state: AuthState) => void): () => void;
  getState(): AuthState;
};

export type AuthControllerConfig = {
  authClient: AuthClient;
  authSessionStorage: AuthSessionStorage;
  localAuthIdentityStorage?: LocalAuthIdentityStorage;
  deviceIdentityProvider: DeviceIdentityProvider;
  ensureLocalWorkspaceId?: () => Promise<string>;
  authStateEngine?: AuthStateEngine;
  authenticatedSync?: Pick<
    AuthenticatedSyncLifecycle,
    "handleAuthState" | "syncNow" | "stop" | "dispose"
  >;
  clock?: () => string;
  nowMs?: () => number;
  setTimeoutFn?: typeof setTimeout;
  clearTimeoutFn?: typeof clearTimeout;
  isOnline?: () => boolean;
  addOnlineListener?: (listener: () => void) => () => void;
  restoreTimeoutMs?: number;
  logger?: { warn?(message: string, context?: Record<string, unknown>): void };
};

export function createAuthController({
  authClient,
  authSessionStorage,
  localAuthIdentityStorage = createVolatileLocalAuthIdentityStorage(),
  deviceIdentityProvider,
  ensureLocalWorkspaceId = async () => createId(),
  authStateEngine = createAuthStateEngine(initialAuthState),
  authenticatedSync,
  clock = () => new Date().toISOString(),
  nowMs = () => Date.now(),
  setTimeoutFn = setTimeout,
  clearTimeoutFn = clearTimeout,
  isOnline = defaultIsOnline,
  addOnlineListener = defaultAddOnlineListener,
  restoreTimeoutMs = RESTORE_TIMEOUT_MS,
  logger,
}: AuthControllerConfig): AuthController {
  let accessToken: string | undefined;
  let refreshToken: string | undefined;
  let generation = 0;
  let activeIntent: AuthControllerIntent = "IDLE";
  let disposed = false;
  let initializePromise: Promise<AuthenticatedSession | null> | null = null;
  let inFlightRefresh: Promise<AuthenticatedSession> | null = null;
  let refreshTimer: ReturnType<typeof setTimeout> | null = null;
  const abortControllers = new Set<AbortController>();

  const unsubscribeSync = authStateEngine.subscribe((state) => {
    reconcileRefreshTimer(state);
    authenticatedSync?.handleAuthState(state);
  });
  const removeOnlineListener = addOnlineListener(() => {
    if (disposed || activeIntent === "LOGOUT") {
      return;
    }

    if (authStateEngine.getState().status === "AUTHENTICATED_OFFLINE") {
      void revalidate().catch(() => undefined);
    }
  });

  async function initialize() {
    if (disposed) {
      return null;
    }

    initializePromise ??= restoreLocalSession().finally(() => {
      initializePromise = null;
    });
    return initializePromise;
  }

  async function login(input: AuthLoginInput) {
    assertActive();
    return authenticate("LOGIN", async (signal) =>
      authClient.login({
        ...input,
        device: await deviceIdentityProvider.getDeviceMetadata(),
      }, { signal }),
    );
  }

  async function register(input: AuthRegisterInput) {
    assertActive();
    return authenticate("REGISTER", async (signal) =>
      authClient.register({
        ...input,
        device: await deviceIdentityProvider.getDeviceMetadata(),
      }, { signal }),
    );
  }

  async function enterLocalMode() {
    assertActive();
    const operationId = beginIntent("ENTER_LOCAL");
    authStateEngine.dispatch({ type: "LOGIN_STARTED", at: clock() });

    try {
      authenticatedSync?.stop();
      accessToken = undefined;
      refreshToken = undefined;
      await clearStoredSession();
      const identity = await getOrCreateLocalIdentity();
      if (!isCurrent(operationId, "ENTER_LOCAL")) {
        throw new AuthCancelledError();
      }

      const activeIdentity: StoredLocalAuthIdentity = {
        ...identity,
        active: true,
        updatedAt: clock(),
      };
      await localAuthIdentityStorage.save(activeIdentity);
      if (!isCurrent(operationId, "ENTER_LOCAL")) {
        throw new AuthCancelledError();
      }

      activateLocalSession(activeIdentity);
      activeIntent = "IDLE";
      return authStateEngine.getState();
    } catch (error) {
      if (error instanceof AuthCancelledError || !isCurrent(operationId, "ENTER_LOCAL")) {
        throw error;
      }

      accessToken = undefined;
      refreshToken = undefined;
      authStateEngine.dispatch({
        type: "UNAUTHENTICATED",
        at: clock(),
        error: { message: "No se pudo iniciar el modo local." },
      });
      activeIntent = "IDLE";
      throw error;
    }
  }

  async function refresh() {
    assertActive();
    if (authStateEngine.getState().status === "AUTHENTICATED_LOCAL") {
      throw new AuthClientError("TOKEN_MISSING", "El modo local no usa tokens remotos.");
    }

    if (inFlightRefresh) {
      return inFlightRefresh;
    }

    inFlightRefresh = refreshSession("REFRESH").finally(() => {
      inFlightRefresh = null;
    });
    return inFlightRefresh;
  }

  async function revalidate() {
    assertActive();
    if (authStateEngine.getState().status === "AUTHENTICATED_LOCAL") {
      return null;
    }

    if (inFlightRefresh) {
      try {
        return await inFlightRefresh;
      } catch {
        return null;
      }
    }

    if (!refreshToken) {
      return null;
    }

    try {
      return await refreshSession("REVALIDATE");
    } catch {
      return null;
    }
  }

  async function logout() {
    if (disposed || activeIntent === "LOGOUT") {
      return;
    }

    const currentState = authStateEngine.getState();
    const localIdentity = currentState.status === "AUTHENTICATED_LOCAL"
      ? await localAuthIdentityStorage.load().catch(() => null)
      : null;
    const remoteRefreshToken = currentState.status === "AUTHENTICATED_LOCAL"
      ? undefined
      : refreshToken;
    beginIntent("LOGOUT");
    authStateEngine.dispatch({ type: "LOGOUT_STARTED", at: clock() });
    authenticatedSync?.stop();
    accessToken = undefined;
    refreshToken = undefined;

    if (localIdentity) {
      await localAuthIdentityStorage.save({
        ...localIdentity,
        active: false,
        updatedAt: clock(),
      }).catch((error) => {
        logger?.warn?.("local mode deactivate failed", {
          error: error instanceof Error ? error.name : "Unknown",
        });
      });
    } else {
      try {
        await authSessionStorage.clear();
      } catch (error) {
        logger?.warn?.("auth logout local clear failed", {
          error: error instanceof Error ? error.name : "Unknown",
        });
      }
    }

    authStateEngine.dispatch({ type: "UNAUTHENTICATED", at: clock(), error: null });
    activeIntent = "IDLE";

    if (remoteRefreshToken) {
      void authClient.logout({ refreshToken: remoteRefreshToken }).catch((error) => {
        logger?.warn?.("auth logout remote failed", {
          code: toAuthError(error).code,
        });
      });
    }
  }

  async function syncNow() {
    if (authStateEngine.getState().status === "AUTHENTICATED_LOCAL") {
      return;
    }

    await authenticatedSync?.syncNow();
  }

  function dispose() {
    if (disposed) {
      return;
    }

    disposed = true;
    beginIntent("DISPOSE");
    clearRefreshTimer();
    removeOnlineListener();
    authenticatedSync?.dispose();
    unsubscribeSync();
    accessToken = undefined;
    refreshToken = undefined;
    authStateEngine.dispatch({ type: "DISPOSE_STARTED", at: clock() });
  }

  function getAccessToken() {
    return accessToken;
  }

  async function authenticate(
    intent: "LOGIN" | "REGISTER",
    operation: (signal: AbortSignal) => Promise<AuthenticatedSession>,
  ) {
    const operationId = beginIntent(intent);
    authStateEngine.dispatch({ type: "LOGIN_STARTED", at: clock() });
    const controller = createAbortController();

    try {
      const session = await operation(controller.signal);
      if (!isCurrent(operationId, intent)) {
        throw new AuthCancelledError();
      }

      await persistSession(session);
      if (!isCurrent(operationId, intent)) {
        throw new AuthCancelledError();
      }

      activateOnlineSession(session);
      activeIntent = "IDLE";
      return session;
    } catch (error) {
      if (error instanceof AuthCancelledError || !isCurrent(operationId, intent)) {
        throw error;
      }

      const authError = toAuthError(error);
      accessToken = undefined;
      refreshToken = undefined;
      authStateEngine.dispatch({
        type: "UNAUTHENTICATED",
        at: clock(),
        error: { code: authError.code, message: authError.message },
      });
      activeIntent = "IDLE";
      throw error;
    } finally {
      abortControllers.delete(controller);
    }
  }

  async function restoreLocalSession() {
    const operationId = beginIntent("RESTORE");
    authStateEngine.dispatch({ type: "CHECK_LOCAL_SESSION_STARTED", at: clock() });

    try {
      const storedSession = await authSessionStorage.load();
      const localIdentity = await localAuthIdentityStorage.load().catch(() => null);
      if (!isCurrent(operationId, "RESTORE")) {
        return null;
      }

      if (localIdentity?.active) {
        accessToken = undefined;
        refreshToken = undefined;
        activateLocalSession(localIdentity);
        activeIntent = "IDLE";
        return null;
      }

      if (!canRestoreOffline(storedSession)) {
        accessToken = undefined;
        refreshToken = undefined;
        authStateEngine.dispatch({ type: "UNAUTHENTICATED", at: clock(), error: null });
        activeIntent = "IDLE";
        return null;
      }

      if (!isOnline()) {
        restoreStoredSessionOffline(storedSession);
        activeIntent = "IDLE";
        return null;
      }

      authStateEngine.dispatch({ type: "REMOTE_VALIDATION_STARTED", at: clock() });
      const session = await refreshStoredSessionWithTimeout(storedSession.refreshToken);
      if (!isCurrent(operationId, "RESTORE")) {
        return null;
      }

      if (session.deviceId !== storedSession.deviceId) {
        await clearStoredSession();
        authStateEngine.dispatch({ type: "UNAUTHENTICATED", at: clock(), error: null });
        activeIntent = "IDLE";
        return null;
      }

      await persistSession(session);
      if (!isCurrent(operationId, "RESTORE")) {
        return null;
      }

      activateOnlineSession(session);
      activeIntent = "IDLE";
      return session;
    } catch (error) {
      if (!isCurrent(operationId, "RESTORE")) {
        return null;
      }

      const authError = toAuthError(error);
      const storedSession = await authSessionStorage.load().catch(() => null);
      if (authError.code === "NETWORK_ERROR" && canRestoreOffline(storedSession)) {
        restoreStoredSessionOffline(storedSession);
        activeIntent = "IDLE";
        return null;
      }

      if (shouldClearStoredSession(authError)) {
        await clearStoredSession();
      }

      accessToken = undefined;
      refreshToken = undefined;
      authStateEngine.dispatch({ type: "UNAUTHENTICATED", at: clock(), error: null });
      activeIntent = "IDLE";
      return null;
    }
  }

  async function refreshSession(intent: "REFRESH" | "REVALIDATE") {
    if (!refreshToken) {
      throw new AuthClientError("TOKEN_MISSING", "No hay sesion local.");
    }

    const operationId = beginIntent(intent);
    authStateEngine.dispatch({
      type: intent === "REFRESH" ? "REFRESH_STARTED" : "REVALIDATE_STARTED",
      at: clock(),
    });
    const currentRefreshToken = refreshToken;
    const controller = createAbortController();

    try {
      const session = await authClient.refresh(
        { refreshToken: currentRefreshToken },
        { signal: controller.signal },
      );
      if (!isCurrent(operationId, intent)) {
        throw new AuthCancelledError();
      }

      assertSessionConsistency(session);
      await persistSession(session);
      if (!isCurrent(operationId, intent)) {
        throw new AuthCancelledError();
      }

      activateOnlineSession(session);
      activeIntent = "IDLE";
      return session;
    } catch (error) {
      if (error instanceof AuthCancelledError || !isCurrent(operationId, intent)) {
        throw error;
      }

      const authError = toAuthError(error);
      if (isTemporaryAuthError(authError)) {
        restoreCurrentStateOffline("Sesion local disponible sin conexion.");
        activeIntent = "IDLE";
        throw error;
      }

      await clearStoredSession();
      accessToken = undefined;
      refreshToken = undefined;
      authStateEngine.dispatch({ type: "UNAUTHENTICATED", at: clock(), error: null });
      activeIntent = "IDLE";
      throw error;
    } finally {
      abortControllers.delete(controller);
    }
  }

  function beginIntent(intent: AuthControllerIntent) {
    generation += 1;
    activeIntent = intent;
    abortAll();
    clearRefreshTimer();
    if (intent === "LOGIN" || intent === "REGISTER") {
      initializePromise = null;
      inFlightRefresh = null;
    }
    return generation;
  }

  function createAbortController() {
    const controller = new AbortController();
    abortControllers.add(controller);
    return controller;
  }

  function abortAll() {
    for (const controller of abortControllers) {
      controller.abort();
    }
    abortControllers.clear();
  }

  function isCurrent(operationId: number, intent: AuthControllerIntent) {
    return !disposed && generation === operationId && activeIntent === intent;
  }

  async function persistSession(session: AuthenticatedSession) {
    await authSessionStorage.save({
      refreshToken: session.refreshToken,
      sessionId: session.sessionId,
      deviceId: session.deviceId,
      storedAt: clock(),
      user: session.user,
      workspaceId: session.workspaceId,
      accessTokenExpiresAt: session.accessTokenExpiresAt,
      refreshTokenExpiresAt: session.refreshTokenExpiresAt,
    });
  }

  async function clearStoredSession() {
    try {
      await authSessionStorage.clear();
    } catch (error) {
      logger?.warn?.("auth session storage clear failed", {
        error: error instanceof Error ? error.name : "Unknown",
      });
    }
  }

  function activateOnlineSession(session: AuthenticatedSession) {
    accessToken = session.accessToken;
    refreshToken = session.refreshToken;
    authStateEngine.dispatch({
      type: "AUTHENTICATED_ONLINE",
      at: clock(),
      user: session.user,
      workspaceId: session.workspaceId,
      deviceId: session.deviceId,
      sessionId: session.sessionId,
      accessTokenExpiresAt: session.accessTokenExpiresAt,
      refreshTokenExpiresAt: session.refreshTokenExpiresAt,
    });
  }

  function restoreStoredSessionOffline(session: RestorableStoredAuthSession) {
    accessToken = undefined;
    refreshToken = session.refreshToken;
    authStateEngine.dispatch({
      type: "AUTHENTICATED_OFFLINE",
      at: clock(),
      user: session.user,
      workspaceId: session.workspaceId,
      deviceId: session.deviceId,
      sessionId: session.sessionId,
      accessTokenExpiresAt: session.accessTokenExpiresAt,
      refreshTokenExpiresAt: session.refreshTokenExpiresAt,
      message: "Sesion local disponible sin conexion.",
    });
  }

  async function getOrCreateLocalIdentity() {
    const existing = await localAuthIdentityStorage.load();
    if (existing && !isMigratedLocalAuthIdentity(existing)) {
      return existing;
    }

    const now = clock();
    const [workspaceId, deviceId] = await Promise.all([
      ensureLocalWorkspaceId(),
      deviceIdentityProvider.getClientDeviceId(),
    ]);

    return {
      sessionMode: "local" as const,
      active: true,
      userId: createId(),
      workspaceId,
      deviceId,
      sessionId: createId(),
      createdAt: now,
      updatedAt: now,
    };
  }

  function activateLocalSession(identity: StoredLocalAuthIdentity) {
    accessToken = undefined;
    refreshToken = undefined;
    authStateEngine.dispatch({
      type: "AUTHENTICATED_LOCAL",
      at: clock(),
      user: createLocalUser(identity.userId),
      workspaceId: identity.workspaceId,
      deviceId: identity.deviceId,
      sessionId: identity.sessionId,
    });
  }

  async function refreshStoredSessionWithTimeout(refreshTokenInput: string) {
    const controller = createAbortController();
    let timeoutId: ReturnType<typeof setTimeout> | null = null;

    const timeout = new Promise<never>((_resolve, reject) => {
      timeoutId = setTimeoutFn(() => {
        controller.abort();
        reject(new AuthClientError("NETWORK_ERROR", "La restauracion remota excedio el tiempo limite."));
      }, normalizedTimeoutMs(restoreTimeoutMs));
    });

    try {
      return await Promise.race([
        authClient.refresh({ refreshToken: refreshTokenInput }, { signal: controller.signal }),
        timeout,
      ]);
    } finally {
      if (timeoutId) {
        clearTimeoutFn(timeoutId);
      }
      abortControllers.delete(controller);
    }
  }

  function restoreCurrentStateOffline(message: string) {
    const current = authStateEngine.getState();
    if (!canUseCurrentStateOffline(current) || !refreshToken) {
      return false;
    }

    accessToken = undefined;
    authStateEngine.dispatch({
      type: "AUTHENTICATED_OFFLINE",
      at: clock(),
      user: current.user,
      workspaceId: current.workspaceId,
      deviceId: current.deviceId,
      sessionId: current.sessionId,
      accessTokenExpiresAt: current.accessTokenExpiresAt,
      refreshTokenExpiresAt: current.refreshTokenExpiresAt,
      message,
    });
    return true;
  }

  function reconcileRefreshTimer(state: AuthState) {
    if (disposed || activeIntent === "LOGOUT") {
      return;
    }

    if (state.status !== "AUTHENTICATED_ONLINE" || !state.accessTokenExpiresAt) {
      clearRefreshTimer();
      return;
    }

    const expiresAtMs = Date.parse(state.accessTokenExpiresAt);
    if (!Number.isFinite(expiresAtMs)) {
      return;
    }

    clearRefreshTimer();
    const delayMs = Math.max(MIN_REFRESH_DELAY_MS, expiresAtMs - nowMs() - REFRESH_EARLY_MS);
    refreshTimer = setTimeoutFn(() => {
      refreshTimer = null;
      void refresh().catch(() => undefined);
    }, delayMs);
  }

  function clearRefreshTimer() {
    if (refreshTimer) {
      clearTimeoutFn(refreshTimer);
      refreshTimer = null;
    }
  }

  function assertSessionConsistency(session: AuthenticatedSession) {
    const current = authStateEngine.getState();
    if (!current.user || !current.workspaceId || !current.deviceId) {
      return;
    }

    if (
      session.user.id !== current.user.id ||
      session.workspaceId !== current.workspaceId ||
      session.deviceId !== current.deviceId
    ) {
      throw new AuthClientError(
        "UNEXPECTED_ERROR",
        "La sesion renovada no coincide con la sesion local.",
      );
    }
  }

  function assertActive() {
    if (disposed) {
      throw new AuthClientError("UNEXPECTED_ERROR", "El ciclo de autenticacion fue cerrado.");
    }
  }

  return {
    initialize,
    login,
    register,
    enterLocalMode,
    refresh,
    revalidate,
    logout,
    syncNow,
    dispose,
    getAccessToken,
    getState: () => authStateEngine.getState(),
    subscribe: (listener) => authStateEngine.subscribe(listener),
  };
}

class AuthCancelledError extends Error {
  constructor() {
    super("Auth operation cancelled.");
    this.name = "AuthCancelledError";
  }
}

type RestorableStoredAuthSession = StoredAuthSession & {
  user: NonNullable<StoredAuthSession["user"]>;
  workspaceId: string;
  accessTokenExpiresAt: string;
  refreshTokenExpiresAt: string;
};

function canRestoreOffline(session: StoredAuthSession | null): session is RestorableStoredAuthSession {
  return Boolean(
    session?.user &&
      session.workspaceId &&
      session.accessTokenExpiresAt &&
      session.refreshTokenExpiresAt,
  );
}

function canUseCurrentStateOffline(state: AuthState): state is AuthState & {
  user: NonNullable<AuthState["user"]>;
  workspaceId: string;
  deviceId: string;
  sessionId: string;
  accessTokenExpiresAt: string;
  refreshTokenExpiresAt: string;
} {
  return Boolean(
    state.user &&
      state.workspaceId &&
      state.deviceId &&
      state.sessionId &&
      state.accessTokenExpiresAt &&
      state.refreshTokenExpiresAt &&
      (state.status === "AUTHENTICATED_ONLINE" ||
        state.status === "AUTHENTICATED_OFFLINE" ||
        state.status === "REFRESHING" ||
        state.status === "REVALIDATING"),
  );
}

function toAuthError(error: unknown) {
  if (error instanceof AuthClientError) {
    return error;
  }

  return new AuthClientError("UNEXPECTED_ERROR", "Error inesperado.");
}

function isTemporaryAuthError(error: AuthClientError) {
  return error.code === "NETWORK_ERROR" || error.code === "SERVER_ERROR";
}

function shouldClearStoredSession(error: AuthClientError) {
  return !isTemporaryAuthError(error);
}

function defaultIsOnline() {
  if (typeof navigator === "undefined") {
    return true;
  }

  return navigator.onLine !== false;
}

function defaultAddOnlineListener(listener: () => void) {
  if (typeof window === "undefined") {
    return () => undefined;
  }

  window.addEventListener("online", listener);
  return () => window.removeEventListener("online", listener);
}

function normalizedTimeoutMs(value: number) {
  return Number.isFinite(value) && value > 0 ? value : RESTORE_TIMEOUT_MS;
}

function createLocalUser(userId: string): AuthenticatedUser {
  return {
    id: userId,
    email: "local@vinema.local",
    displayName: "Modo local",
  };
}

function createId() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }

  return `local-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}

function createVolatileLocalAuthIdentityStorage(): LocalAuthIdentityStorage {
  let identity: StoredLocalAuthIdentity | null = null;

  return {
    async load() {
      return identity ? { ...identity } : null;
    },
    async save(nextIdentity) {
      identity = { ...nextIdentity };
    },
  };
}
