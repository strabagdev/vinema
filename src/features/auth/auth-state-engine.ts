import type { AuthenticatedUser } from "@vinema/sync-contracts";

export type AuthStatus =
  | "RESTORING"
  | "UNKNOWN"
  | "AUTHENTICATING"
  | "REFRESHING"
  | "LOGGING_OUT"
  | "AUTHENTICATED"
  | "UNAUTHENTICATED"
  | "ERROR";

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
  | { type: "AUTH_STARTED"; at: string }
  | {
      type: "AUTH_SUCCEEDED";
      at: string;
      user: AuthenticatedUser;
      workspaceId: string;
      deviceId: string;
      sessionId: string;
      accessTokenExpiresAt: string;
      refreshTokenExpiresAt: string;
    }
  | { type: "REFRESH_STARTED"; at: string }
  | {
      type: "REFRESH_SUCCEEDED";
      at: string;
      user: AuthenticatedUser;
      workspaceId: string;
      deviceId: string;
      sessionId: string;
      accessTokenExpiresAt: string;
      refreshTokenExpiresAt: string;
    }
  | { type: "RESTORE_STARTED"; at: string }
  | { type: "RESTORE_FAILED"; at: string; code?: string; message: string }
  | { type: "REFRESH_FAILED"; at: string; code?: string; message: string }
  | { type: "LOGOUT_STARTED"; at: string }
  | { type: "LOGOUT_COMPLETED"; at: string }
  | { type: "AUTH_FAILED"; at: string; code?: string; message: string }
  | { type: "AUTH_CLEARED"; at: string }
  | { type: "AUTH_RESET" };

export type AuthStateEngine = {
  getState(): AuthState;
  dispatch(event: AuthEvent): AuthState;
  subscribe(listener: (state: AuthState) => void): () => void;
  reset(): AuthState;
};

export const initialAuthState: AuthState = {
  status: "RESTORING",
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
  switch (event.type) {
    case "AUTH_STARTED":
      return { ...state, status: "AUTHENTICATING", error: null };
    case "RESTORE_STARTED":
      return { ...state, status: "RESTORING", error: null };
    case "REFRESH_STARTED":
      return { ...state, status: "REFRESHING", error: null };
    case "LOGOUT_STARTED":
      return { ...state, status: "LOGGING_OUT", error: null };
    case "AUTH_SUCCEEDED":
    case "REFRESH_SUCCEEDED":
      return {
        status: "AUTHENTICATED",
        user: { ...event.user },
        workspaceId: event.workspaceId,
        deviceId: event.deviceId,
        sessionId: event.sessionId,
        accessTokenExpiresAt: event.accessTokenExpiresAt,
        refreshTokenExpiresAt: event.refreshTokenExpiresAt,
        lastAuthenticatedAt: event.at,
        error: null,
      };
    case "REFRESH_FAILED":
    case "AUTH_FAILED":
      return {
        ...state,
        status: "ERROR",
        error: {
          code: event.code,
          message: event.message,
          occurredAt: event.at,
        },
      };
    case "RESTORE_FAILED":
      return {
        status: "UNAUTHENTICATED",
        user: null,
        workspaceId: null,
        deviceId: null,
        sessionId: null,
        accessTokenExpiresAt: null,
        refreshTokenExpiresAt: null,
        lastAuthenticatedAt: state.lastAuthenticatedAt,
        error: {
          code: event.code,
          message: event.message,
          occurredAt: event.at,
        },
      };
    case "AUTH_CLEARED":
      return {
        status: "UNAUTHENTICATED",
        user: null,
        workspaceId: null,
        deviceId: null,
        sessionId: null,
        accessTokenExpiresAt: null,
        refreshTokenExpiresAt: null,
        lastAuthenticatedAt: state.lastAuthenticatedAt,
        error: null,
      };
    case "LOGOUT_COMPLETED":
      return reduceAuthState(state, { type: "AUTH_CLEARED", at: event.at });
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
