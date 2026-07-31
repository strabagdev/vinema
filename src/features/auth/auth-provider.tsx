"use client";

import type {
  AuthenticatedUser,
} from "@vinema/sync-contracts";
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import {
  createAuthClient,
  type AuthClient,
} from "@/features/auth/auth-client";
import {
  createAuthRefreshCoordinator,
  type AuthRefreshCoordinator,
} from "@/features/auth/auth-refresh-coordinator";
import {
  createAuthService,
  type AuthLoginInput,
  type AuthRegisterInput,
  type AuthService,
} from "@/features/auth/auth-service";
import {
  createAuthStateEngine,
  initialAuthState,
  type AuthState,
  type AuthStateEngine,
} from "@/features/auth/auth-state-engine";
import { createAuthSyncStateBridge } from "@/features/auth/auth-sync-state-bridge";
import { createDeviceIdentityProvider } from "@/features/auth/device-identity-provider";
import {
  getPublicApiUrl,
  PublicApiUrlError,
} from "@/features/auth/public-api-url";
import type { AuthSessionStorage } from "@/features/auth/storage/auth-session-storage";
import { createWebAuthSessionStorage } from "@/features/auth/storage/web-auth-session-storage";
import { createSyncStateEngine } from "@/features/sync/sync-state-engine";

export type AuthContextValue = {
  state: AuthState;
  user: AuthenticatedUser | null;
  workspaceId: string | null;
  accessToken: string | undefined;
  isAuthenticated: boolean;
  isLoading: boolean;
  error: AuthState["error"];
  register(input: AuthRegisterInput): Promise<void>;
  login(input: AuthLoginInput): Promise<void>;
  refresh(): Promise<void>;
  logout(): Promise<void>;
};

type AuthRuntime = {
  service: AuthService;
  refreshCoordinator: AuthRefreshCoordinator;
  authStateEngine: AuthStateEngine;
  configError: PublicApiUrlError | null;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({
  children,
  authSessionStorage,
}: {
  children: React.ReactNode;
  authSessionStorage?: AuthSessionStorage;
}) {
  const [runtime] = useState(() => createAuthRuntime(authSessionStorage));
  const [state, setState] = useState<AuthState>(() => runtime.service.getState());
  const [accessToken, setAccessToken] = useState<string | undefined>(() =>
    runtime.service.getAccessToken(),
  );

  useEffect(() => runtime.service.subscribe((nextState) => {
    setState(nextState);
    setAccessToken(runtime.service.getAccessToken());
  }), [runtime]);

  useEffect(() => {
    const syncStateEngine = createSyncStateEngine();
    const bridge = createAuthSyncStateBridge({
      authStateEngine: runtime.authStateEngine,
      syncStateEngine,
    });

    return () => bridge.dispose();
  }, [runtime]);

  useEffect(() => {
    let mounted = true;

    runtime.service.restoreSession()
      .catch(() => undefined)
      .finally(() => {
        if (mounted) {
          setAccessToken(runtime.service.getAccessToken());
        }
      });

    return () => {
      mounted = false;
    };
  }, [runtime]);

  useEffect(() => {
    if (state.status === "AUTHENTICATED" && state.accessTokenExpiresAt) {
      try {
        runtime.refreshCoordinator.schedule(state.accessTokenExpiresAt);
      } catch {
        runtime.refreshCoordinator.cancel();
        runtime.service.interruptSession({
          code: "INVALID_ACCESS_TOKEN_EXPIRATION",
          message: "No fue posible mantener la sesion local.",
        });
      }
      return;
    }

    runtime.refreshCoordinator.cancel();
  }, [runtime, state.accessTokenExpiresAt, state.status]);

  useEffect(() => () => {
    runtime.refreshCoordinator.dispose();
  }, [runtime]);

  const register = useCallback(
    async (input: AuthRegisterInput) => {
      assertAuthConfigured(runtime);
      await runtime.service.register(input);
      setAccessToken(runtime.service.getAccessToken());
    },
    [runtime],
  );

  const login = useCallback(
    async (input: AuthLoginInput) => {
      assertAuthConfigured(runtime);
      await runtime.service.login(input);
      setAccessToken(runtime.service.getAccessToken());
    },
    [runtime],
  );

  const refresh = useCallback(async () => {
    assertAuthConfigured(runtime);
    await runtime.refreshCoordinator.refreshNow();
    setAccessToken(runtime.service.getAccessToken());
  }, [runtime]);

  const logout = useCallback(async () => {
    runtime.refreshCoordinator.cancel();
    await runtime.service.logout();
    setAccessToken(undefined);
  }, [runtime]);

  const value = useMemo<AuthContextValue>(() => ({
    state,
    user: state.user,
    workspaceId: state.workspaceId,
    accessToken,
    isAuthenticated: Boolean(accessToken) && state.status === "AUTHENTICATED",
    isLoading:
      state.status === "RESTORING" ||
      state.status === "UNKNOWN" ||
      state.status === "AUTHENTICATING" ||
      state.status === "REFRESHING" ||
      state.status === "LOGGING_OUT",
    error: state.error,
    register,
    refresh,
    login,
    logout,
  }), [accessToken, login, logout, refresh, register, state]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const value = useContext(AuthContext);
  if (!value) {
    throw new Error("useAuth debe usarse dentro de AuthProvider.");
  }

  return value;
}

function createAuthRuntime(authSessionStorage?: AuthSessionStorage): AuthRuntime {
  const authStateEngine = createAuthStateEngine({
    ...initialAuthState,
    status: "RESTORING",
  });

  let configError: PublicApiUrlError | null = null;
  let authClient: AuthClient;
  try {
    const baseUrl = getPublicApiUrl();
    if (!baseUrl) {
      throw new PublicApiUrlError("NEXT_PUBLIC_API_URL no esta configurada.");
    }
    authClient = createAuthClient({ baseUrl });
  } catch (error) {
    if (error instanceof PublicApiUrlError) {
      configError = error;
      authClient = createUnavailableAuthClient(error);
    } else {
      throw error;
    }
  }

  const service = createAuthService({
    authClient,
    authSessionStorage: authSessionStorage ?? createWebAuthSessionStorage(),
    authStateEngine,
    deviceIdentityProvider: createDeviceIdentityProvider(),
    logger: process.env.NODE_ENV === "development" ? console : undefined,
  });
  const refreshCoordinator = createAuthRefreshCoordinator({
    refresh: () => service.refresh({ silent: true }),
    visibilityDocument: typeof document === "undefined" ? undefined : document,
    onRefreshFailed(error, { tokenExpired }) {
      if (!tokenExpired) {
        return;
      }

      service.interruptSession({
        code: error instanceof Error ? error.name : undefined,
        message:
          "No fue posible renovar la sesion. Revisa tu conexion e inicia sesion nuevamente si el problema continua.",
      });
    },
    logger: process.env.NODE_ENV === "development" ? console : undefined,
  });

  return { service, refreshCoordinator, authStateEngine, configError };
}

function createUnavailableAuthClient(error: PublicApiUrlError): AuthClient {
  const reject = async (): Promise<never> => {
    throw error;
  };

  return {
    register: reject,
    login: reject,
    refresh: reject,
    logout: reject,
    getSession: reject,
    getCurrentDevice: reject,
  };
}

function assertAuthConfigured(runtime: AuthRuntime) {
  if (!runtime.configError) {
    return;
  }

  runtime.authStateEngine.dispatch({
    type: "AUTH_FAILED",
    at: new Date().toISOString(),
    code: "NETWORK_ERROR",
    message: "La API de Vinema no esta configurada.",
  });
  throw runtime.configError;
}
