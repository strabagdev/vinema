import type { AuthenticatedUser } from "@vinema/sync-contracts";

export type AuthStatus =
  | "UNKNOWN"
  | "AUTHENTICATING"
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
  accessTokenExpiresAt: string | null;
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
      accessTokenExpiresAt: string;
    }
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
  status: "UNKNOWN",
  user: null,
  workspaceId: null,
  deviceId: null,
  accessTokenExpiresAt: null,
  lastAuthenticatedAt: null,
  error: null,
};

export function reduceAuthState(state: AuthState, event: AuthEvent): AuthState {
  switch (event.type) {
    case "AUTH_STARTED":
      return { ...state, status: "AUTHENTICATING", error: null };
    case "AUTH_SUCCEEDED":
      return {
        status: "AUTHENTICATED",
        user: { ...event.user },
        workspaceId: event.workspaceId,
        deviceId: event.deviceId,
        accessTokenExpiresAt: event.accessTokenExpiresAt,
        lastAuthenticatedAt: event.at,
        error: null,
      };
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
    case "AUTH_CLEARED":
      return {
        status: "UNAUTHENTICATED",
        user: null,
        workspaceId: null,
        deviceId: null,
        accessTokenExpiresAt: null,
        lastAuthenticatedAt: state.lastAuthenticatedAt,
        error: null,
      };
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
