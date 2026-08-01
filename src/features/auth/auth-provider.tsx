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
  useRef,
  useState,
} from "react";
import {
  createAuthClient,
  type AuthClient,
} from "@/features/auth/auth-client";
import {
  createAuthenticationLifecycle,
  type AuthenticationLifecycle,
} from "@/features/auth/authentication-lifecycle";
import {
  createAuthRefreshCoordinator,
} from "@/features/auth/auth-refresh-coordinator";
import {
  createAuthService,
  type AuthLoginInput,
  type AuthRegisterInput,
} from "@/features/auth/auth-service";
import {
  createAuthStateEngine,
  initialAuthState,
  type AuthState,
} from "@/features/auth/auth-state-engine";
import { createAuthSyncStateBridge } from "@/features/auth/auth-sync-state-bridge";
import { createDeviceIdentityProvider } from "@/features/auth/device-identity-provider";
import {
  getPublicApiUrl,
  PublicApiUrlError,
} from "@/features/auth/public-api-url";
import type { AuthSessionStorage } from "@/features/auth/storage/auth-session-storage";
import { createWebAuthSessionStorage } from "@/features/auth/storage/web-auth-session-storage";
import { createAutomaticSyncOrchestrator } from "@/features/sync/automatic-sync-orchestrator";
import { createAuthenticatedSyncLifecycle } from "@/features/sync/authenticated-sync-lifecycle";
import { createOrchestratorSyncStateBridge } from "@/features/sync/orchestrator-sync-state-bridge";
import { createPullCoordinator } from "@/features/sync/pull-coordinator";
import { createPushCoordinator } from "@/features/sync/push-coordinator";
import { createSyncClient } from "@/features/sync/sync-client";
import {
  IndexedDbSyncMetadataRepository,
  IndexedDbSyncOutboxRepository,
} from "@/features/sync/sync-outbox-repository";
import {
  createSyncStateEngine,
  type SyncState,
} from "@/features/sync/sync-state-engine";

const AUTHENTICATED_SYNC_INTERVAL_MS = 10_000;

export type AuthContextValue = {
  state: AuthState;
  user: AuthenticatedUser | null;
  workspaceId: string | null;
  deviceId: string | null;
  accessToken: string | undefined;
  syncState: SyncState;
  isAuthenticated: boolean;
  isLoading: boolean;
  error: AuthState["error"];
  register(input: AuthRegisterInput): Promise<void>;
  login(input: AuthLoginInput): Promise<void>;
  refresh(): Promise<void>;
  syncNow(): Promise<void>;
  logout(): Promise<void>;
};

type AuthRuntime = {
  lifecycle: AuthenticationLifecycle;
  syncStateEngine: ReturnType<typeof createSyncStateEngine>;
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
  const [state, setState] = useState<AuthState>(() => runtime.lifecycle.getState());
  const [syncState, setSyncState] = useState<SyncState>(() =>
    runtime.syncStateEngine.getState(),
  );
  const [accessToken, setAccessToken] = useState<string | undefined>(() =>
    runtime.lifecycle.getAccessToken(),
  );
  const disposeGenerationRef = useRef(0);

  useEffect(() => runtime.lifecycle.subscribe((nextState) => {
    setState(nextState);
    setAccessToken(runtime.lifecycle.getAccessToken());
  }), [runtime]);
  useEffect(() => runtime.syncStateEngine.subscribe(setSyncState), [runtime]);

  useEffect(() => {
    let mounted = true;
    disposeGenerationRef.current += 1;

    runtime.lifecycle.initialize()
      .catch(() => undefined)
      .finally(() => {
        if (mounted) {
          setAccessToken(runtime.lifecycle.getAccessToken());
        }
      });

    return () => {
      mounted = false;
      disposeGenerationRef.current += 1;
      const disposeGeneration = disposeGenerationRef.current;
      queueMicrotask(() => {
        if (disposeGenerationRef.current === disposeGeneration) {
          runtime.lifecycle.dispose();
        }
      });
    };
  }, [runtime]);

  const register = useCallback(
    async (input: AuthRegisterInput) => {
      await runtime.lifecycle.register(input);
      setAccessToken(runtime.lifecycle.getAccessToken());
    },
    [runtime],
  );

  const login = useCallback(
    async (input: AuthLoginInput) => {
      await runtime.lifecycle.login(input);
      setAccessToken(runtime.lifecycle.getAccessToken());
    },
    [runtime],
  );

  const refresh = useCallback(async () => {
    await runtime.lifecycle.refresh();
    setAccessToken(runtime.lifecycle.getAccessToken());
  }, [runtime]);

  const logout = useCallback(async () => {
    await runtime.lifecycle.logout();
    setAccessToken(undefined);
  }, [runtime]);

  const syncNow = useCallback(async () => {
    await runtime.lifecycle.syncNow();
  }, [runtime]);

  const value = useMemo<AuthContextValue>(() => ({
    state,
    user: state.user,
    workspaceId: state.workspaceId,
    deviceId: state.deviceId,
    accessToken,
    syncState,
    isAuthenticated: Boolean(accessToken) && state.status === "AUTHENTICATED",
    isLoading:
      state.status === "BOOT" ||
      state.status === "RESTORING" ||
      state.status === "UNKNOWN" ||
      state.status === "AUTHENTICATING" ||
      state.status === "REFRESHING" ||
      state.status === "LOGGING_OUT" ||
      state.status === "DISPOSING",
    error: state.error,
    register,
    refresh,
    syncNow,
    login,
    logout,
  }), [accessToken, login, logout, refresh, register, state, syncNow, syncState]);

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
  const authStateEngine = createAuthStateEngine(initialAuthState);
  const syncStateEngine = createSyncStateEngine();

  let configError: PublicApiUrlError | null = null;
  let apiBaseUrl: string | null = null;
  let authClient: AuthClient;
  try {
    const baseUrl = getPublicApiUrl();
    if (!baseUrl) {
      throw new PublicApiUrlError("NEXT_PUBLIC_API_URL no esta configurada.");
    }
    apiBaseUrl = baseUrl;
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
  const syncBridge = createAuthSyncStateBridge({
    authStateEngine,
    syncStateEngine,
  });
  const authenticatedSync = apiBaseUrl
    ? createAuthenticatedSyncLifecycle({
      createRuntime({ workspaceId, deviceId }) {
        const syncClient = createSyncClient({
          baseUrl: apiBaseUrl,
          accessTokenProvider: service,
        });
        const outboxRepository = new IndexedDbSyncOutboxRepository();
        const metadataRepository = new IndexedDbSyncMetadataRepository();
        const pushCoordinator = createPushCoordinator({
          workspaceId,
          deviceId,
          syncClient,
          outboxRepository,
          metadataRepository,
          logger: process.env.NODE_ENV === "development" ? console : undefined,
        });
        const pullCoordinator = createPullCoordinator({
          workspaceId,
          deviceId,
          syncClient,
          logger: process.env.NODE_ENV === "development" ? console : undefined,
        });
        const orchestrator = createAutomaticSyncOrchestrator({
          pushCoordinator,
          pullCoordinator,
          config: {
            runOnStart: false,
            syncIntervalMs: AUTHENTICATED_SYNC_INTERVAL_MS,
          },
          logger: process.env.NODE_ENV === "development" ? console : undefined,
        });
        const orchestratorBridge = createOrchestratorSyncStateBridge({
          orchestrator,
          engine: syncStateEngine,
        });

        return {
          orchestrator,
          dispose() {
            orchestratorBridge.dispose();
          },
        };
      },
      logger: process.env.NODE_ENV === "development" ? console : undefined,
    })
    : undefined;
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
  const lifecycle = createAuthenticationLifecycle({
    service,
    refreshCoordinator,
    configError,
    syncBridge,
    authenticatedSync,
    logger: process.env.NODE_ENV === "development" ? console : undefined,
  });

  return { lifecycle, syncStateEngine };
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
