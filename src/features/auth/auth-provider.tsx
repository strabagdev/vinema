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
  AuthClientError,
  createAuthClient,
  type AuthClient,
} from "@/features/auth/auth-client";
import {
  createAuthController,
  type AuthController,
} from "@/features/auth/auth-controller";
import { createAppResumeLifecycle } from "@/features/auth/app-resume-lifecycle";
import {
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
  authStatus: AuthState["status"];
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
  controller: AuthController;
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
  const [state, setState] = useState<AuthState>(() => runtime.controller.getState());
  const [syncState, setSyncState] = useState<SyncState>(() =>
    runtime.syncStateEngine.getState(),
  );
  const [accessToken, setAccessToken] = useState<string | undefined>(() =>
    runtime.controller.getAccessToken(),
  );
  const disposeGenerationRef = useRef(0);

  useEffect(() => runtime.controller.subscribe((nextState) => {
    setState(nextState);
    setAccessToken(runtime.controller.getAccessToken());
  }), [runtime]);
  useEffect(() => runtime.syncStateEngine.subscribe(setSyncState), [runtime]);
  useEffect(() => {
    const lifecycle = createAppResumeLifecycle({
      getAuthState: () => runtime.controller.getState(),
      revalidate: async () => {
        await runtime.controller.revalidate();
        return runtime.controller.getState();
      },
      syncNow: () => runtime.controller.syncNow(),
      setConnectivity: (connectivity) => {
        runtime.syncStateEngine.dispatch({
          type: "CONNECTIVITY_CHANGED",
          connectivity,
        });
      },
      logger: process.env.NODE_ENV === "development" ? console : undefined,
    });

    return () => lifecycle.dispose();
  }, [runtime]);

  useEffect(() => {
    let mounted = true;
    disposeGenerationRef.current += 1;

    runtime.controller.initialize()
      .catch(() => undefined)
      .finally(() => {
        if (mounted) {
          setAccessToken(runtime.controller.getAccessToken());
        }
      });

    return () => {
      mounted = false;
      disposeGenerationRef.current += 1;
      const disposeGeneration = disposeGenerationRef.current;
      queueMicrotask(() => {
        if (disposeGenerationRef.current === disposeGeneration) {
          runtime.controller.dispose();
        }
      });
    };
  }, [runtime]);

  const register = useCallback(
    async (input: AuthRegisterInput) => {
      await runtime.controller.register(input);
      setAccessToken(runtime.controller.getAccessToken());
    },
    [runtime],
  );

  const login = useCallback(
    async (input: AuthLoginInput) => {
      await runtime.controller.login(input);
      setAccessToken(runtime.controller.getAccessToken());
    },
    [runtime],
  );

  const refresh = useCallback(async () => {
    await runtime.controller.refresh();
    setAccessToken(runtime.controller.getAccessToken());
  }, [runtime]);

  const logout = useCallback(async () => {
    await runtime.controller.logout();
    setAccessToken(undefined);
  }, [runtime]);

  const syncNow = useCallback(async () => {
    await runtime.controller.syncNow();
  }, [runtime]);

  const hasLocalAuthenticatedSession = hasUsableLocalSession(state);
  const value = useMemo<AuthContextValue>(() => ({
    state,
    user: state.user,
    workspaceId: state.workspaceId,
    deviceId: state.deviceId,
    accessToken,
    authStatus: state.status,
    syncState,
    isAuthenticated:
      state.status === "AUTHENTICATED_ONLINE" ||
      state.status === "AUTHENTICATED_OFFLINE" ||
      ((state.status === "REFRESHING" || state.status === "REVALIDATING") &&
        hasLocalAuthenticatedSession),
    isLoading: isBlockingAuthState(state, hasLocalAuthenticatedSession),
    error: state.error,
    register,
    refresh,
    syncNow,
    login,
    logout,
  }), [
    accessToken,
    hasLocalAuthenticatedSession,
    login,
    logout,
    refresh,
    register,
    state,
    syncNow,
    syncState,
  ]);

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

  const controllerRef: { current?: AuthController } = {};
  const authenticatedSync = apiBaseUrl
    ? createAuthenticatedSyncLifecycle({
      createRuntime({ workspaceId, deviceId }) {
        const syncClient = createSyncClient({
          baseUrl: apiBaseUrl,
          accessTokenProvider: {
            getAccessToken: () => controllerRef.current?.getAccessToken(),
          },
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

  const controller = createAuthController({
    authClient,
    authSessionStorage: authSessionStorage ?? createWebAuthSessionStorage(),
    authStateEngine,
    deviceIdentityProvider: createDeviceIdentityProvider(),
    authenticatedSync,
    logger: process.env.NODE_ENV === "development" ? console : undefined,
  });
  controllerRef.current = controller;
  const syncBridge = createAuthSyncStateBridge({
    authStateEngine,
    syncStateEngine,
  });
  void configError;

  const originalDispose = controller.dispose;
  controller.dispose = () => {
    syncBridge.dispose();
    originalDispose();
  };

  return { controller, syncStateEngine };
}

function hasUsableLocalSession(state: AuthState) {
  return Boolean(
    state.user &&
      state.workspaceId &&
      state.deviceId &&
      state.sessionId &&
      state.refreshTokenExpiresAt,
  );
}

function isBlockingAuthState(
  state: AuthState,
  hasLocalAuthenticatedSession: boolean,
) {
  switch (state.status) {
    case "BOOT":
    case "CHECKING_LOCAL_SESSION":
    case "VALIDATING_REMOTE":
      return true;
    case "LOGGING_IN":
      return !hasLocalAuthenticatedSession;
    case "REFRESHING":
    case "REVALIDATING":
      return !hasLocalAuthenticatedSession;
    default:
      return false;
  }
}

function createUnavailableAuthClient(error: PublicApiUrlError): AuthClient {
  const reject = async (): Promise<never> => {
    throw new AuthClientError("NETWORK_ERROR", error.message);
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
