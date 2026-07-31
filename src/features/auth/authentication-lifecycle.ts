import type { AuthenticatedSession } from "@vinema/sync-contracts";
import type { AuthRefreshCoordinator } from "@/features/auth/auth-refresh-coordinator";
import {
  type AuthLoginInput,
  type AuthRegisterInput,
  type AuthService,
} from "@/features/auth/auth-service";
import type { AuthState } from "@/features/auth/auth-state-engine";
import { PublicApiUrlError } from "@/features/auth/public-api-url";

export type AuthenticationLifecycle = {
  initialize(): Promise<AuthenticatedSession | null>;
  register(input: AuthRegisterInput): Promise<AuthenticatedSession>;
  login(input: AuthLoginInput): Promise<AuthenticatedSession>;
  refresh(): Promise<AuthenticatedSession>;
  logout(): Promise<void>;
  dispose(): void;
  getAccessToken(): string | undefined;
  getState(): AuthState;
  subscribe(listener: (state: AuthState) => void): () => void;
};

export type AuthenticationLifecycleConfig = {
  service: AuthService;
  refreshCoordinator: AuthRefreshCoordinator;
  configError?: PublicApiUrlError | null;
  syncBridge?: { dispose(): void };
  logger?: { warn?(message: string, context?: Record<string, unknown>): void };
};

export function createAuthenticationLifecycle({
  service,
  refreshCoordinator,
  configError = null,
  syncBridge,
  logger,
}: AuthenticationLifecycleConfig): AuthenticationLifecycle {
  let disposed = false;
  let initializePromise: Promise<AuthenticatedSession | null> | null = null;
  const unsubscribeSchedule = service.subscribe((state) => reconcileRefreshSchedule(state));

  function initialize() {
    if (disposed) {
      return Promise.resolve(null);
    }

    initializePromise ??= service.restoreSession()
      .catch((error) => {
        logger?.warn?.("auth lifecycle initialize failed", {
          error: error instanceof Error ? error.name : "Unknown",
        });
        return null;
      })
      .finally(() => {
        initializePromise = null;
      });

    return initializePromise;
  }

  async function register(input: AuthRegisterInput) {
    assertActive();
    assertConfigured();
    return service.register(input);
  }

  async function login(input: AuthLoginInput) {
    assertActive();
    assertConfigured();
    return service.login(input);
  }

  async function refresh() {
    assertActive();
    assertConfigured();
    return refreshCoordinator.refreshNow() as unknown as Promise<AuthenticatedSession>;
  }

  async function logout() {
    if (disposed) {
      return;
    }

    refreshCoordinator.cancel();
    await service.logout();
  }

  function dispose() {
    if (disposed) {
      return;
    }

    disposed = true;
    refreshCoordinator.dispose();
    unsubscribeSchedule();
    syncBridge?.dispose();
    service.dispose();
  }

  function reconcileRefreshSchedule(state: AuthState) {
    if (disposed) {
      return;
    }

    if (state.status === "AUTHENTICATED" && state.accessTokenExpiresAt) {
      try {
        refreshCoordinator.schedule(state.accessTokenExpiresAt);
      } catch {
        refreshCoordinator.cancel();
        service.interruptSession({
          code: "INVALID_ACCESS_TOKEN_EXPIRATION",
          message: "No fue posible mantener la sesion local.",
        });
      }
      return;
    }

    refreshCoordinator.cancel();
  }

  function assertConfigured() {
    if (!configError) {
      return;
    }

    service.interruptSession({
      code: "NETWORK_ERROR",
      message: "La API de Vinema no esta configurada.",
    });
    throw configError;
  }

  function assertActive() {
    if (disposed) {
      throw new Error("El ciclo de autenticacion fue cerrado.");
    }
  }

  return {
    initialize,
    register,
    login,
    refresh,
    logout,
    dispose,
    getAccessToken: () => service.getAccessToken(),
    getState: () => service.getState(),
    subscribe: (listener) => service.subscribe(listener),
  };
}
