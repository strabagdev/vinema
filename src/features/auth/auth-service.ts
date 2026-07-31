import type {
  AuthenticatedSession,
  CurrentDeviceResponse,
  CurrentSessionResponse,
  LoginRequest,
  RegisterRequest,
} from "@vinema/sync-contracts";
import type { AccessTokenProvider } from "@/features/auth/access-token-provider";
import { AuthClientError, type AuthClient } from "@/features/auth/auth-client";
import type { DeviceIdentityProvider } from "@/features/auth/device-identity-provider";
import type { AuthSessionStorage } from "@/features/auth/storage/auth-session-storage";
import {
  createAuthStateEngine,
  type AuthState,
  type AuthStateEngine,
} from "@/features/auth/auth-state-engine";

export type AuthService = AccessTokenProvider & {
  register(input: AuthRegisterInput): Promise<AuthenticatedSession>;
  login(input: AuthLoginInput): Promise<AuthenticatedSession>;
  restoreSession(): Promise<AuthenticatedSession | null>;
  refresh(options?: AuthRefreshOptions): Promise<AuthenticatedSession>;
  logout(): Promise<void>;
  getCurrentSession(): Promise<CurrentSessionResponse>;
  getCurrentDevice(): Promise<CurrentDeviceResponse>;
  isAuthenticated(): boolean;
  clearLocalSession(): void;
  interruptSession(input: AuthSessionInterruption): void;
  dispose(): void;
  subscribe(listener: (state: AuthState) => void): () => void;
  getState(): AuthState;
};

export type AuthRegisterInput = Omit<RegisterRequest, "device">;
export type AuthLoginInput = Omit<LoginRequest, "device">;
export type AuthRefreshOptions = {
  silent?: boolean;
};
export type AuthSessionInterruption = {
  code?: string;
  message: string;
};

export function createAuthService({
  authClient,
  authSessionStorage,
  authStateEngine = createAuthStateEngine(),
  deviceIdentityProvider,
  clock = () => new Date().toISOString(),
  logger,
}: {
  authClient: AuthClient;
  authSessionStorage: AuthSessionStorage;
  authStateEngine?: AuthStateEngine;
  deviceIdentityProvider: DeviceIdentityProvider;
  clock?: () => string;
  logger?: { warn?(message: string, context?: Record<string, unknown>): void };
}): AuthService {
  let accessToken: string | undefined;
  let refreshToken: string | undefined;
  let operationGeneration = 0;
  let restorePromise: Promise<AuthenticatedSession | null> | null = null;
  let disposed = false;

  async function authenticate(
    operation: () => Promise<AuthenticatedSession>,
  ): Promise<AuthenticatedSession> {
    authStateEngine.dispatch({ type: "AUTH_STARTED", at: clock() });
    const generation = nextOperationGeneration();
    try {
      const session = await operation();
      if (!(await persistSessionForCurrentOperation(session, generation))) {
        return session;
      }
      activateSession(session, "AUTH_SUCCEEDED");
      return session;
    } catch (error) {
      const authError = toAuthError(error);
      if (!isCurrentOperation(generation)) {
        throw error;
      }
      accessToken = undefined;
      refreshToken = undefined;
      authStateEngine.dispatch({
        type: "AUTH_FAILED",
        at: clock(),
        code: authError.code,
        message: authError.message,
      });
      throw error;
    }
  }

  return {
    register(input) {
      assertNotDisposed();
      return authenticate(async () =>
        authClient.register({
          ...input,
          device: await deviceIdentityProvider.getDeviceMetadata(),
        }),
      );
    },
    login(input) {
      assertNotDisposed();
      return authenticate(async () =>
        authClient.login({
          ...input,
          device: await deviceIdentityProvider.getDeviceMetadata(),
        }),
      );
    },
    restoreSession() {
      if (disposed) {
        return Promise.resolve(null);
      }
      restorePromise ??= restorePersistedSession().finally(() => {
        restorePromise = null;
      });

      return restorePromise;
    },
    async getCurrentSession() {
      assertNotDisposed();
      if (!accessToken) {
        throw new AuthClientError("TOKEN_MISSING", "No hay sesion local.");
      }

      try {
        const session = await authClient.getSession(accessToken);
        authStateEngine.dispatch({
          type: "AUTH_SUCCEEDED",
          at: clock(),
          user: session.user,
          workspaceId: session.workspaceId,
          deviceId: session.deviceId,
          sessionId: session.sessionId,
          accessTokenExpiresAt: session.tokenExpiresAt,
          refreshTokenExpiresAt:
            authStateEngine.getState().refreshTokenExpiresAt ?? session.tokenExpiresAt,
        });
        return session;
      } catch (error) {
        const authError = toAuthError(error);
        if (authError.code === "TOKEN_INVALID" || authError.code === "TOKEN_EXPIRED") {
          accessToken = undefined;
          authStateEngine.dispatch({ type: "AUTH_CLEARED", at: clock() });
        } else {
          logger?.warn?.("auth session refresh failed", { code: authError.code });
          authStateEngine.dispatch({
            type: "AUTH_FAILED",
            at: clock(),
            code: authError.code,
            message: authError.message,
          });
        }
        throw error;
      }
    },
    async getCurrentDevice() {
      assertNotDisposed();
      if (!accessToken) {
        throw new AuthClientError("TOKEN_MISSING", "No hay sesion local.");
      }

      return authClient.getCurrentDevice(accessToken);
    },
    getAccessToken() {
      return accessToken;
    },
    async refresh(options = {}) {
      assertNotDisposed();
      if (!refreshToken) {
        throw new AuthClientError("TOKEN_MISSING", "No hay sesion local.");
      }

      if (!options.silent) {
        authStateEngine.dispatch({ type: "REFRESH_STARTED", at: clock() });
      }
      const generation = nextOperationGeneration();
      try {
        const session = await authClient.refresh({ refreshToken });
        if (!isCurrentOperation(generation)) {
          return session;
        }
        assertRefreshSessionConsistency(session);
        if (!(await persistSessionForCurrentOperation(session, generation))) {
          return session;
        }
        activateSession(session, "REFRESH_SUCCEEDED");
        return session;
      } catch (error) {
        const authError = toAuthError(error);
        if (!isCurrentOperation(generation)) {
          throw error;
        }
        if (options.silent && isTemporaryRefreshError(authError)) {
          logger?.warn?.("silent auth refresh failed temporarily", { code: authError.code });
          throw error;
        }
        accessToken = undefined;
        refreshToken = undefined;
        await clearStoredSession(logger);
        authStateEngine.dispatch({
          type: "REFRESH_FAILED",
          at: clock(),
          code: authError.code,
          message: authError.message,
        });
        authStateEngine.dispatch({ type: "AUTH_CLEARED", at: clock() });
        throw error;
      }
    },
    async logout() {
      if (disposed) {
        return;
      }
      nextOperationGeneration();
      const token = refreshToken;
      authStateEngine.dispatch({ type: "LOGOUT_STARTED", at: clock() });
      accessToken = undefined;
      refreshToken = undefined;
      try {
        if (token) {
          await authClient.logout({ refreshToken: token });
        }
      } catch (error) {
        const authError = toAuthError(error);
        logger?.warn?.("auth logout remote failed", { code: authError.code });
      } finally {
        await clearStoredSession(logger);
        authStateEngine.dispatch({ type: "LOGOUT_COMPLETED", at: clock() });
      }
    },
    isAuthenticated() {
      return Boolean(accessToken) && authStateEngine.getState().status === "AUTHENTICATED";
    },
    clearLocalSession() {
      if (disposed) {
        return;
      }
      nextOperationGeneration();
      accessToken = undefined;
      refreshToken = undefined;
      authStateEngine.dispatch({ type: "AUTH_CLEARED", at: clock() });
    },
    interruptSession(input) {
      if (disposed) {
        return;
      }
      nextOperationGeneration();
      accessToken = undefined;
      refreshToken = undefined;
      authStateEngine.dispatch({
        type: "AUTH_INTERRUPTED",
        at: clock(),
        code: input.code,
        message: input.message,
      });
    },
    dispose() {
      if (disposed) {
        return;
      }

      disposed = true;
      nextOperationGeneration();
      restorePromise = null;
      accessToken = undefined;
      refreshToken = undefined;
      authStateEngine.dispatch({ type: "DISPOSE_STARTED", at: clock() });
    },
    subscribe(listener) {
      return authStateEngine.subscribe(listener);
    },
    getState() {
      return authStateEngine.getState();
    },
  };

  async function persistSessionOrFail(session: AuthenticatedSession) {
    try {
      await authSessionStorage.save({
        refreshToken: session.refreshToken,
        sessionId: session.sessionId,
        deviceId: session.deviceId,
        storedAt: clock(),
      });
    } catch (error) {
      logger?.warn?.("auth session persistence failed");
      await clearStoredSession(logger);
      throw new AuthClientError(
        "UNEXPECTED_ERROR",
        "No se pudo guardar la sesion local.",
        undefined,
        error,
      );
    }
  }

  async function restorePersistedSession(): Promise<AuthenticatedSession | null> {
    const generation = nextOperationGeneration();
    authStateEngine.dispatch({ type: "RESTORE_STARTED", at: clock() });

    try {
      const storedSession = await authSessionStorage.load();
      if (!storedSession) {
        if (isCurrentOperation(generation)) {
          authStateEngine.dispatch({ type: "AUTH_CLEARED", at: clock() });
        }
        return null;
      }

      const session = await authClient.refresh({
        refreshToken: storedSession.refreshToken,
      });

      if (session.deviceId !== storedSession.deviceId) {
        await clearStoredSession(logger);
        throw new AuthClientError(
          "UNEXPECTED_ERROR",
          "La sesion local no coincide con este dispositivo.",
        );
      }

      if (!(await persistSessionForCurrentOperation(session, generation))) {
        return session;
      }
      activateSession(session, "AUTH_SUCCEEDED");
      return session;
    } catch (error) {
      const authError = toAuthError(error);

      if (shouldClearStoredSessionAfterRestoreFailure(authError)) {
        await clearStoredSession(logger);
      }

      if (!isCurrentOperation(generation)) {
        return null;
      }

      accessToken = undefined;
      refreshToken = undefined;

      if (authError.code === "NETWORK_ERROR") {
        authStateEngine.dispatch({
          type: "RESTORE_FAILED",
          at: clock(),
          code: authError.code,
          message: "No fue posible restaurar la sesion. Puedes iniciar sesion nuevamente.",
        });
        return null;
      }

      authStateEngine.dispatch({ type: "AUTH_CLEARED", at: clock() });
      return null;
    }
  }

  async function clearStoredSession(
    clearLogger?: { warn?(message: string, context?: Record<string, unknown>): void },
  ) {
    try {
      await authSessionStorage.clear();
    } catch (error) {
      clearLogger?.warn?.("auth session storage clear failed", {
        error: error instanceof Error ? error.name : "Unknown",
      });
    }
  }

  function nextOperationGeneration() {
    operationGeneration += 1;
    return operationGeneration;
  }

  function isCurrentOperation(generation: number) {
    return !disposed && generation === operationGeneration;
  }

  function assertNotDisposed() {
    if (disposed) {
      throw new AuthClientError("UNEXPECTED_ERROR", "El ciclo de autenticacion fue cerrado.");
    }
  }

  async function persistSessionForCurrentOperation(
    session: AuthenticatedSession,
    generation: number,
  ) {
    if (!isCurrentOperation(generation)) {
      return false;
    }

    await persistSessionOrFail(session);
    if (!isCurrentOperation(generation)) {
      await clearStoredSession(logger);
      return false;
    }

    return true;
  }

  function activateSession(
    session: AuthenticatedSession,
    eventType: "AUTH_SUCCEEDED" | "REFRESH_SUCCEEDED",
  ) {
    accessToken = session.accessToken;
    refreshToken = session.refreshToken;
    authStateEngine.dispatch({
      type: eventType,
      at: clock(),
      user: session.user,
      workspaceId: session.workspaceId,
      deviceId: session.deviceId,
      sessionId: session.sessionId,
      accessTokenExpiresAt: session.accessTokenExpiresAt,
      refreshTokenExpiresAt: session.refreshTokenExpiresAt,
    });
  }

  function assertRefreshSessionConsistency(session: AuthenticatedSession) {
    const current = authStateEngine.getState();
    if (current.status !== "AUTHENTICATED") {
      return;
    }

    if (
      (current.user && session.user.id !== current.user.id) ||
      (current.workspaceId && session.workspaceId !== current.workspaceId) ||
      (current.deviceId && session.deviceId !== current.deviceId)
    ) {
      throw new AuthClientError(
        "UNEXPECTED_ERROR",
        "La sesion renovada no coincide con la sesion local.",
      );
    }
  }
}

function toAuthError(error: unknown) {
  if (error instanceof AuthClientError) {
    return error;
  }

  return new AuthClientError("UNEXPECTED_ERROR", "Error inesperado.");
}

function shouldClearStoredSessionAfterRestoreFailure(error: AuthClientError) {
  return error.code !== "NETWORK_ERROR";
}

function isTemporaryRefreshError(error: AuthClientError) {
  return error.code === "NETWORK_ERROR" || error.code === "SERVER_ERROR";
}
