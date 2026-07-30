import type {
  AuthenticatedSession,
  CurrentSessionResponse,
  LoginRequest,
  RegisterRequest,
} from "@vinema/sync-contracts";
import type { AccessTokenProvider } from "@/features/auth/access-token-provider";
import { AuthClientError, type AuthClient } from "@/features/auth/auth-client";
import {
  createAuthStateEngine,
  type AuthState,
  type AuthStateEngine,
} from "@/features/auth/auth-state-engine";

export type AuthService = AccessTokenProvider & {
  register(input: RegisterRequest): Promise<AuthenticatedSession>;
  login(input: LoginRequest): Promise<AuthenticatedSession>;
  getCurrentSession(): Promise<CurrentSessionResponse>;
  isAuthenticated(): boolean;
  clearLocalSession(): void;
  subscribe(listener: (state: AuthState) => void): () => void;
  getState(): AuthState;
};

export function createAuthService({
  authClient,
  authStateEngine = createAuthStateEngine(),
  clock = () => new Date().toISOString(),
  logger,
}: {
  authClient: AuthClient;
  authStateEngine?: AuthStateEngine;
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
      return authenticate(() => authClient.register(input));
    },
    login(input) {
      return authenticate(() => authClient.login(input));
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
