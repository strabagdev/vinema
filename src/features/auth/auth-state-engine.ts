import type { AuthenticatedUser } from "@vinema/sync-contracts";

export type AuthStatus =
  | "BOOT"
  | "CHECKING_LOCAL_SESSION"
  | "VALIDATING_REMOTE"
  | "UNAUTHENTICATED"
  | "LOGGING_IN"
  | "LOGGING_OUT"
  | "AUTHENTICATED_ONLINE"
  | "AUTHENTICATED_OFFLINE"
  | "REFRESHING"
  | "REVALIDATING"
  | "DISPOSING";

export type AuthStateError = {
  code?: string;
  message: string;
  occurredAt: string;
};

export type AuthState = {
  status: AuthStatus;
  user: AuthenticatedUser | null;
  workspaceId: string | null;
  deviceId: string | null;
  sessionId: string | null;
  accessTokenExpiresAt: string | null;
  refreshTokenExpiresAt: string | null;
  lastAuthenticatedAt: string | null;
  error: AuthStateError | null;
};

export type AuthEvent =
  | { type: "CHECK_LOCAL_SESSION_STARTED"; at: string }
  | { type: "REMOTE_VALIDATION_STARTED"; at: string }
  | { type: "LOGIN_STARTED"; at: string }
  | { type: "REFRESH_STARTED"; at: string }
  | { type: "REVALIDATE_STARTED"; at: string }
  | { type: "LOGOUT_STARTED"; at: string }
  | { type: "DISPOSE_STARTED"; at: string }
  | {
      type: "AUTHENTICATED_ONLINE";
      at: string;
      user: AuthenticatedUser;
      workspaceId: string;
      deviceId: string;
      sessionId: string;
      accessTokenExpiresAt: string;
      refreshTokenExpiresAt: string;
    }
  | {
      type: "AUTHENTICATED_OFFLINE";
      at: string;
      user: AuthenticatedUser;
      workspaceId: string;
      deviceId: string;
      sessionId: string;
      accessTokenExpiresAt: string;
      refreshTokenExpiresAt: string;
      message?: string;
    }
  | { type: "UNAUTHENTICATED"; at: string; error?: { code?: string; message: string } | null }
  | { type: "AUTH_RESET" }
  // Transitional event aliases retained for non-runtime tests and code paths during the refactor.
  | { type: "AUTH_STARTED"; at: string }
  | { type: "RESTORE_STARTED"; at: string }
  | { type: "AUTH_SUCCEEDED"; at: string; user: AuthenticatedUser; workspaceId: string; deviceId: string; sessionId: string; accessTokenExpiresAt: string; refreshTokenExpiresAt: string }
  | { type: "REFRESH_SUCCEEDED"; at: string; user: AuthenticatedUser; workspaceId: string; deviceId: string; sessionId: string; accessTokenExpiresAt: string; refreshTokenExpiresAt: string }
  | { type: "AUTH_OFFLINE_RESTORED"; at: string; user: AuthenticatedUser; workspaceId: string; deviceId: string; sessionId: string; accessTokenExpiresAt: string; refreshTokenExpiresAt: string; message: string }
  | { type: "AUTH_FAILED"; at: string; code?: string; message: string }
  | { type: "REFRESH_FAILED"; at: string; code?: string; message: string }
  | { type: "RESTORE_FAILED"; at: string; code?: string; message: string }
  | { type: "AUTH_INTERRUPTED"; at: string; code?: string; message: string }
  | { type: "AUTH_CLEARED"; at: string }
  | { type: "LOGOUT_COMPLETED"; at: string };

export type AuthStateEngine = {
  getState(): AuthState;
  dispatch(event: AuthEvent): AuthState;
  subscribe(listener: (state: AuthState) => void): () => void;
  reset(): AuthState;
};

export const initialAuthState: AuthState = {
  status: "BOOT",
  user: null,
  workspaceId: null,
  deviceId: null,
  sessionId: null,
  accessTokenExpiresAt: null,
  refreshTokenExpiresAt: null,
  lastAuthenticatedAt: null,
  error: null,
};

export function reduceAuthState(state: AuthState, event: AuthEvent): AuthState {
  if (state.status === "DISPOSING" && event.type !== "AUTH_RESET") {
    return state;
  }

  switch (event.type) {
    case "CHECK_LOCAL_SESSION_STARTED":
    case "RESTORE_STARTED":
      return { ...state, status: "CHECKING_LOCAL_SESSION", error: null };
    case "REMOTE_VALIDATION_STARTED":
      return { ...state, status: "VALIDATING_REMOTE", error: null };
    case "LOGIN_STARTED":
    case "AUTH_STARTED":
      return { ...state, status: "LOGGING_IN", error: null };
    case "REFRESH_STARTED":
      return { ...state, status: "REFRESHING", error: null };
    case "REVALIDATE_STARTED":
      return { ...state, status: "REVALIDATING", error: null };
    case "LOGOUT_STARTED":
      return { ...state, status: "LOGGING_OUT", error: null };
    case "DISPOSE_STARTED":
      return {
        ...state,
        status: "DISPOSING",
        user: null,
        workspaceId: null,
        deviceId: null,
        sessionId: null,
        accessTokenExpiresAt: null,
        refreshTokenExpiresAt: null,
        error: null,
      };
    case "AUTHENTICATED_ONLINE":
    case "AUTH_SUCCEEDED":
    case "REFRESH_SUCCEEDED":
      return {
        status: "AUTHENTICATED_ONLINE",
        user: { ...event.user },
        workspaceId: event.workspaceId,
        deviceId: event.deviceId,
        sessionId: event.sessionId,
        accessTokenExpiresAt: event.accessTokenExpiresAt,
        refreshTokenExpiresAt: event.refreshTokenExpiresAt,
        lastAuthenticatedAt: event.at,
        error: null,
      };
    case "AUTHENTICATED_OFFLINE":
    case "AUTH_OFFLINE_RESTORED":
      return {
        status: "AUTHENTICATED_OFFLINE",
        user: { ...event.user },
        workspaceId: event.workspaceId,
        deviceId: event.deviceId,
        sessionId: event.sessionId,
        accessTokenExpiresAt: event.accessTokenExpiresAt,
        refreshTokenExpiresAt: event.refreshTokenExpiresAt,
        lastAuthenticatedAt: state.lastAuthenticatedAt ?? event.at,
        error: event.message
          ? { code: "NETWORK_ERROR", message: event.message, occurredAt: event.at }
          : null,
      };
    case "UNAUTHENTICATED":
      return unauthenticatedState(state, event.at, event.error);
    case "AUTH_FAILED":
    case "REFRESH_FAILED":
    case "RESTORE_FAILED":
    case "AUTH_INTERRUPTED":
      return unauthenticatedState(state, event.at, {
        code: event.code,
        message: event.message,
      });
    case "AUTH_CLEARED":
    case "LOGOUT_COMPLETED":
      return unauthenticatedState(state, event.at, null);
    case "AUTH_RESET":
      return cloneState(initialAuthState);
    default:
      return assertNever(event);
  }
}

export function createAuthStateEngine(
  initialState: AuthState = initialAuthState,
): AuthStateEngine {
  const listeners = new Set<(state: AuthState) => void>();
  let state = cloneState(initialState);

  function getState() {
    return cloneState(state);
  }

  function dispatch(event: AuthEvent) {
    const next = reduceAuthState(state, event);
    if (JSON.stringify(next) === JSON.stringify(state)) {
      return getState();
    }

    state = cloneState(next);
    const snapshot = getState();
    for (const listener of listeners) {
      try {
        listener(snapshot);
      } catch {
        // Auth consumers must not break the engine.
      }
    }

    return getState();
  }

  return {
    getState,
    dispatch,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    reset() {
      return dispatch({ type: "AUTH_RESET" });
    },
  };
}

function unauthenticatedState(
  state: AuthState,
  at: string,
  error?: { code?: string; message: string } | null,
): AuthState {
  return {
    status: "UNAUTHENTICATED",
    user: null,
    workspaceId: null,
    deviceId: null,
    sessionId: null,
    accessTokenExpiresAt: null,
    refreshTokenExpiresAt: null,
    lastAuthenticatedAt: state.lastAuthenticatedAt,
    error: error
      ? {
          code: error.code,
          message: error.message,
          occurredAt: at,
        }
      : null,
  };
}

function cloneState(state: AuthState): AuthState {
  return {
    ...state,
    user: state.user ? { ...state.user } : null,
    error: state.error ? { ...state.error } : null,
  };
}

function assertNever(value: never): never {
  throw new Error(`Unhandled AuthEvent: ${JSON.stringify(value)}`);
}
