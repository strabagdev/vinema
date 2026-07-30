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
import {
  createAuthStateEngine,
  type AuthState,
  type AuthStateEngine,
} from "@/features/auth/auth-state-engine";

export type AuthService = AccessTokenProvider & {
  register(input: AuthRegisterInput): Promise<AuthenticatedSession>;
  login(input: AuthLoginInput): Promise<AuthenticatedSession>;
  getCurrentSession(): Promise<CurrentSessionResponse>;
  getCurrentDevice(): Promise<CurrentDeviceResponse>;
  isAuthenticated(): boolean;
  clearLocalSession(): void;
  subscribe(listener: (state: AuthState) => void): () => void;
  getState(): AuthState;
};

export type AuthRegisterInput = Omit<RegisterRequest, "device">;
export type AuthLoginInput = Omit<LoginRequest, "device">;

export function createAuthService({
  authClient,
  authStateEngine = createAuthStateEngine(),
  deviceIdentityProvider,
  clock = () => new Date().toISOString(),
  logger,
}: {
  authClient: AuthClient;
  authStateEngine?: AuthStateEngine;
  deviceIdentityProvider: DeviceIdentityProvider;
  clock?: () => string;
  logger?: { warn?(message: string, context?: Record<string, unknown>): void };
}): AuthService {
  let accessToken: string | undefined;

  async function authenticate(
    operation: () => Promise<AuthenticatedSession>,
  ): Promise<AuthenticatedSession> {
    authStateEngine.dispatch({ type: "AUTH_STARTED", at: clock() });
    try {
      const session = await operation();
      accessToken = session.accessToken;
      authStateEngine.dispatch({
        type: "AUTH_SUCCEEDED",
        at: clock(),
        user: session.user,
        workspaceId: session.workspaceId,
        deviceId: session.deviceId,
        accessTokenExpiresAt: session.accessTokenExpiresAt,
      });
      return session;
    } catch (error) {
      const authError = toAuthError(error);
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
      return authenticate(async () =>
        authClient.register({
          ...input,
          device: await deviceIdentityProvider.getDeviceMetadata(),
        }),
      );
    },
    login(input) {
      return authenticate(async () =>
        authClient.login({
          ...input,
          device: await deviceIdentityProvider.getDeviceMetadata(),
        }),
      );
    },
    async getCurrentSession() {
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
          accessTokenExpiresAt: session.tokenExpiresAt,
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
      if (!accessToken) {
        throw new AuthClientError("TOKEN_MISSING", "No hay sesion local.");
      }

      return authClient.getCurrentDevice(accessToken);
    },
    getAccessToken() {
      return accessToken;
    },
    isAuthenticated() {
      return Boolean(accessToken) && authStateEngine.getState().status === "AUTHENTICATED";
    },
    clearLocalSession() {
      accessToken = undefined;
      authStateEngine.dispatch({ type: "AUTH_CLEARED", at: clock() });
    },
    subscribe(listener) {
      return authStateEngine.subscribe(listener);
    },
    getState() {
      return authStateEngine.getState();
    },
  };
}

function toAuthError(error: unknown) {
  if (error instanceof AuthClientError) {
    return error;
  }

  return new AuthClientError("UNEXPECTED_ERROR", "Error inesperado.");
}
