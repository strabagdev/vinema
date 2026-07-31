import { AuthClientError } from "@/features/auth/auth-client";

export const AUTH_REFRESH_EARLY_MS = 60_000;
export const AUTH_REFRESH_MIN_DELAY_MS = 1_000;
export const AUTH_REFRESH_RETRY_DELAYS_MS = [5_000, 15_000] as const;
export const AUTH_REFRESH_MAX_TIMEOUT_MS = 2_147_483_647;

export type AuthRefreshSession = {
  accessTokenExpiresAt: string;
};

export type AuthClock = {
  now(): number;
  setTimeout(callback: () => void, delayMs: number): unknown;
  clearTimeout(handle: unknown): void;
};

export type AuthVisibilityDocument = {
  visibilityState: DocumentVisibilityState;
  addEventListener(type: "visibilitychange", listener: () => void): void;
  removeEventListener(type: "visibilitychange", listener: () => void): void;
};

export type AuthRefreshCoordinator = {
  schedule(expiresAt: string): void;
  refreshNow(): Promise<AuthRefreshSession>;
  cancel(): void;
  dispose(): void;
};

export type AuthRefreshCoordinatorConfig = {
  refresh: () => Promise<AuthRefreshSession>;
  clock?: AuthClock;
  visibilityDocument?: AuthVisibilityDocument;
  onRefreshFailed?: (error: unknown, context: { tokenExpired: boolean }) => void;
  logger?: { warn?(message: string, context?: Record<string, unknown>): void };
};

export class AuthRefreshCancelledError extends Error {
  constructor() {
    super("Auth refresh cancelled.");
    this.name = "AuthRefreshCancelledError";
  }
}

export class AuthRefreshScheduleError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AuthRefreshScheduleError";
  }
}

export function createAuthRefreshCoordinator({
  refresh,
  clock = browserAuthClock,
  visibilityDocument,
  onRefreshFailed,
  logger,
}: AuthRefreshCoordinatorConfig): AuthRefreshCoordinator {
  let disposed = false;
  let generation = 0;
  let timeoutHandle: unknown | null = null;
  let timeoutCancel: (() => void) | null = null;
  let inFlight: Promise<AuthRefreshSession> | null = null;
  let latestExpiresAt: string | null = null;

  const onVisibilityChange = () => {
    if (disposed || visibilityDocument?.visibilityState !== "visible" || !latestExpiresAt) {
      return;
    }

    if (shouldRefreshNow(latestExpiresAt, clock.now())) {
      void runRefreshNow().catch((error) => {
        if (error instanceof AuthRefreshCancelledError) {
          return;
        }
        logger?.warn?.("silent auth refresh after visibility change failed", {
          error: error instanceof Error ? error.name : "Unknown",
        });
      });
      return;
    }

    schedule(latestExpiresAt);
  };

  visibilityDocument?.addEventListener("visibilitychange", onVisibilityChange);

  function schedule(expiresAt: string) {
    if (disposed) {
      return;
    }

    const expiresAtMs = parseExpiresAt(expiresAt);
    latestExpiresAt = expiresAt;
    cancelTimeout();

    const delayMs = refreshDelayMs(expiresAtMs, clock.now());
    if (delayMs <= 0) {
      void runRefreshNow().catch((error) => {
        if (error instanceof AuthRefreshCancelledError) {
          return;
        }
        if (scheduleTemporaryFailureRetry(error, expiresAt)) {
          return;
        }
        onRefreshFailed?.(error, { tokenExpired: isExpired(expiresAt, clock.now()) });
      });
      return;
    }

    timeoutHandle = clock.setTimeout(() => {
      timeoutHandle = null;
      timeoutCancel = null;
      void runRefreshNow().catch((error) => {
        if (error instanceof AuthRefreshCancelledError) {
          return;
        }
        if (scheduleTemporaryFailureRetry(error, expiresAt)) {
          return;
        }
        onRefreshFailed?.(error, { tokenExpired: isExpired(expiresAt, clock.now()) });
      });
    }, delayMs);
  }

  function runRefreshNow() {
    if (disposed) {
      return Promise.reject(new AuthRefreshCancelledError());
    }

    if (inFlight) {
      return inFlight;
    }

    const refreshGeneration = generation;
    cancelTimeout();
    inFlight = refreshWithRetries(refreshGeneration)
      .then((session) => {
        if (!isActiveGeneration(refreshGeneration)) {
          throw new AuthRefreshCancelledError();
        }
        schedule(session.accessTokenExpiresAt);
        return session;
      })
      .finally(() => {
        if (isActiveGeneration(refreshGeneration)) {
          inFlight = null;
        }
      });

    return inFlight;
  }

  async function refreshWithRetries(refreshGeneration: number) {
    for (let attempt = 0; attempt <= AUTH_REFRESH_RETRY_DELAYS_MS.length; attempt += 1) {
      if (!isActiveGeneration(refreshGeneration)) {
        throw new AuthRefreshCancelledError();
      }

      try {
        return await refresh();
      } catch (error) {
        if (!isRetryableRefreshError(error) || attempt >= AUTH_REFRESH_RETRY_DELAYS_MS.length) {
          throw error;
        }

        const shouldContinue = await wait(AUTH_REFRESH_RETRY_DELAYS_MS[attempt], refreshGeneration);
        if (!shouldContinue) {
          throw new AuthRefreshCancelledError();
        }
      }
    }

    throw new AuthRefreshCancelledError();
  }

  function wait(delayMs: number, refreshGeneration: number) {
    return new Promise<boolean>((resolve) => {
      timeoutHandle = clock.setTimeout(() => {
        timeoutHandle = null;
        timeoutCancel = null;
        resolve(isActiveGeneration(refreshGeneration));
      }, delayMs);
      timeoutCancel = () => resolve(false);
    });
  }

  function cancelTimeout() {
    if (timeoutHandle !== null) {
      clock.clearTimeout(timeoutHandle);
      timeoutHandle = null;
    }
    timeoutCancel?.();
    timeoutCancel = null;
  }

  function scheduleTemporaryFailureRetry(error: unknown, expiresAt: string) {
    if (!isRetryableRefreshError(error) || isExpired(expiresAt, clock.now())) {
      return false;
    }

    const remainingMs = parseExpiresAt(expiresAt) - clock.now();
    const delayMs = Math.min(
      AUTH_REFRESH_RETRY_DELAYS_MS[AUTH_REFRESH_RETRY_DELAYS_MS.length - 1],
      Math.max(AUTH_REFRESH_MIN_DELAY_MS, remainingMs - AUTH_REFRESH_MIN_DELAY_MS),
    );

    timeoutHandle = clock.setTimeout(() => {
      timeoutHandle = null;
      timeoutCancel = null;
      void runRefreshNow().catch((nextError) => {
        if (nextError instanceof AuthRefreshCancelledError) {
          return;
        }
        if (scheduleTemporaryFailureRetry(nextError, expiresAt)) {
          return;
        }
        onRefreshFailed?.(nextError, { tokenExpired: isExpired(expiresAt, clock.now()) });
      });
    }, delayMs);
    return true;
  }

  function cancel() {
    generation += 1;
    latestExpiresAt = null;
    inFlight = null;
    cancelTimeout();
  }

  function dispose() {
    if (disposed) {
      return;
    }

    disposed = true;
    cancel();
    visibilityDocument?.removeEventListener("visibilitychange", onVisibilityChange);
  }

  function isActiveGeneration(refreshGeneration: number) {
    return !disposed && refreshGeneration === generation;
  }

  return {
    schedule,
    refreshNow: runRefreshNow,
    cancel,
    dispose,
  };
}

export const browserAuthClock: AuthClock = {
  now: () => Date.now(),
  setTimeout(callback, delayMs) {
    return setTimeout(callback, delayMs);
  },
  clearTimeout(handle) {
    clearTimeout(handle as ReturnType<typeof setTimeout>);
  },
};

export function refreshDelayMs(expiresAtMs: number, nowMs: number) {
  const targetMs = expiresAtMs - AUTH_REFRESH_EARLY_MS;
  const delayMs = targetMs - nowMs;
  if (delayMs <= AUTH_REFRESH_MIN_DELAY_MS) {
    return 0;
  }

  return Math.min(delayMs, AUTH_REFRESH_MAX_TIMEOUT_MS);
}

export function shouldRefreshNow(expiresAt: string, nowMs: number) {
  return refreshDelayMs(parseExpiresAt(expiresAt), nowMs) === 0;
}

export function isExpired(expiresAt: string, nowMs: number) {
  return parseExpiresAt(expiresAt) <= nowMs;
}

function parseExpiresAt(expiresAt: string) {
  const timestamp = Date.parse(expiresAt);
  if (!Number.isFinite(timestamp) || new Date(timestamp).toISOString() !== expiresAt) {
    throw new AuthRefreshScheduleError("La expiracion del access token no es valida.");
  }

  return timestamp;
}

function isRetryableRefreshError(error: unknown) {
  if (!(error instanceof AuthClientError)) {
    return false;
  }

  return error.code === "NETWORK_ERROR" || error.code === "SERVER_ERROR";
}
