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
import { createAuthClient } from "@/features/auth/auth-client";
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
  logout(): void;
};

type AuthRuntime = {
  service: AuthService;
  authStateEngine: AuthStateEngine;
  configError: PublicApiUrlError | null;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [runtime] = useState(createAuthRuntime);
  const [state, setState] = useState<AuthState>(() => runtime.service.getState());
  const [accessToken, setAccessToken] = useState<string | undefined>(() =>
    runtime.service.getAccessToken(),
  );

  useEffect(() => runtime.service.subscribe(setState), [runtime]);

  useEffect(() => {
    const syncStateEngine = createSyncStateEngine();
    const bridge = createAuthSyncStateBridge({
      authStateEngine: runtime.authStateEngine,
      syncStateEngine,
    });

    return () => bridge.dispose();
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

  const logout = useCallback(() => {
    runtime.service.clearLocalSession();
    setAccessToken(undefined);
  }, [runtime]);

  const value = useMemo<AuthContextValue>(() => ({
    state,
    user: state.user,
    workspaceId: state.workspaceId,
    accessToken,
    isAuthenticated: Boolean(accessToken) && state.status === "AUTHENTICATED",
    isLoading: state.status === "UNKNOWN" || state.status === "AUTHENTICATING",
    error: state.error,
    register,
    login,
    logout,
  }), [accessToken, login, logout, register, state]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const value = useContext(AuthContext);
  if (!value) {
    throw new Error("useAuth debe usarse dentro de AuthProvider.");
  }

  return value;
}

function createAuthRuntime(): AuthRuntime {
  const authStateEngine = createAuthStateEngine({
    ...initialAuthState,
    status: "UNAUTHENTICATED",
  });

  let configError: PublicApiUrlError | null = null;
  let baseUrl = "http://localhost:8000";
  try {
    baseUrl = getPublicApiUrl();
  } catch (error) {
    if (error instanceof PublicApiUrlError) {
      configError = error;
    } else {
      throw error;
    }
  }

  const service = createAuthService({
    authClient: createAuthClient({ baseUrl }),
    authStateEngine,
    deviceIdentityProvider: createDeviceIdentityProvider(),
    logger: process.env.NODE_ENV === "development" ? console : undefined,
  });

  return { service, authStateEngine, configError };
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
