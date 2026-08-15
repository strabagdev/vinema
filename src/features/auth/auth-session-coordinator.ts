import type { AuthenticatedSession } from "@vinema/sync-contracts";
import { AuthClientError } from "@/features/auth/auth-client";
import type {
  AuthSessionStorage,
  StoredAuthSession,
} from "@/features/auth/storage/auth-session-storage";
import {
  AUTH_SESSION_STORE,
  getVinemaDb,
} from "@/infrastructure/storage/vinema-db";

const AUTH_LOCK_NAME = "vinema-auth-refresh";
const AUTH_BROADCAST_CHANNEL = "vinema-auth-session";
const FALLBACK_LOCK_KEY = "__auth_refresh_lock__";
const FALLBACK_LOCK_LEASE_MS = 8_000;
const FALLBACK_LOCK_RETRY_MS = 25;
const ADOPT_SESSION_WAIT_MS = 500;

type LockMode = "exclusive";

type WebLocksManager = {
  request<T>(
    name: string,
    options: { mode: LockMode },
    callback: () => T | Promise<T>,
  ): Promise<T>;
};

type BroadcastChannelLike = {
  postMessage(message: AuthSessionBroadcastMessage): void;
  close(): void;
  addEventListener?(
    type: "message",
    listener: (event: { data: unknown }) => void,
  ): void;
  removeEventListener?(
    type: "message",
    listener: (event: { data: unknown }) => void,
  ): void;
  onmessage?: ((event: { data: unknown }) => void) | null;
};

export type AuthSessionCoordinator = {
  refresh(input: CoordinatedRefreshInput): Promise<AuthenticatedSession>;
  announceLogout(refreshToken: string): void;
  announceRevoked(refreshToken: string): void;
  dispose(): void;
};

export type AuthSessionCoordinatorConfig = {
  authSessionStorage: AuthSessionStorage;
  clock?: () => string;
  nowMs?: () => number;
  setTimeoutFn?: typeof setTimeout;
  clearTimeoutFn?: typeof clearTimeout;
  webLocks?: WebLocksManager | null;
  broadcastChannelFactory?: ((name: string) => BroadcastChannelLike) | null;
  instanceId?: string;
  onSessionRenewed?: (session: AuthenticatedSession) => void | Promise<void>;
  onSessionCleared?: (input: {
    refreshToken: string;
    reason: "LOGOUT" | "REVOKED";
  }) => void | Promise<void>;
};

export type CoordinatedRefreshInput = {
  refreshToken: string;
  execute(refreshToken: string): Promise<AuthenticatedSession>;
};

type AuthSessionBroadcastMessage =
  | {
      type: "SESSION_RENEWED";
      sourceId: string;
      session: AuthenticatedSession;
    }
  | {
      type: "LOGOUT";
      sourceId: string;
      refreshToken: string;
    }
  | {
      type: "SESSION_REVOKED";
      sourceId: string;
      refreshToken: string;
    };

type FallbackLockRecord = {
  ownerId: string;
  expiresAt: number;
};

export function createAuthSessionCoordinator({
  authSessionStorage,
  clock = () => new Date().toISOString(),
  nowMs = () => Date.now(),
  setTimeoutFn = setTimeout,
  clearTimeoutFn = clearTimeout,
  webLocks = defaultWebLocks(),
  broadcastChannelFactory = defaultBroadcastChannelFactory(),
  instanceId = createId(),
  onSessionRenewed,
  onSessionCleared,
}: AuthSessionCoordinatorConfig): AuthSessionCoordinator {
  const renewedSessions = new Map<string, AuthenticatedSession>();
  const waiters = new Map<string, Set<(session: AuthenticatedSession) => void>>();
  const channel = broadcastChannelFactory?.(AUTH_BROADCAST_CHANNEL) ?? null;
  let disposed = false;

  const messageListener = (event: { data: unknown }) => {
    void handleMessage(event.data);
  };

  if (channel?.addEventListener) {
    channel.addEventListener("message", messageListener);
  } else if (channel) {
    channel.onmessage = messageListener;
  }

  async function refresh(input: CoordinatedRefreshInput) {
    return withAuthLock(async () => {
      const latest = await authSessionStorage.load();
      if (!latest) {
        throw new AuthClientError("TOKEN_MISSING", "No hay sesion local.");
      }

      if (latest.refreshToken !== input.refreshToken) {
        const adopted = await waitForRenewedSession(latest.refreshToken);
        if (!adopted) {
          throw new AuthClientError(
            "NETWORK_ERROR",
            "Otra instancia renovo la sesion, pero aun no se recibio la sesion actualizada.",
          );
        }

        await authSessionStorage.save(toStoredSession(adopted, clock()));
        return adopted;
      }

      const session = await input.execute(input.refreshToken);
      const latestAfterRefresh = await authSessionStorage.load();
      if (latestAfterRefresh?.refreshToken !== input.refreshToken) {
        const adopted = latestAfterRefresh
          ? await waitForRenewedSession(latestAfterRefresh.refreshToken)
          : null;
        if (adopted) {
          return adopted;
        }

        throw new AuthClientError(
          "NETWORK_ERROR",
          "La sesion local cambio antes de completar la renovacion.",
        );
      }

      await authSessionStorage.save(toStoredSession(session, clock()));
      rememberRenewedSession(session);
      postMessage({ type: "SESSION_RENEWED", sourceId: instanceId, session });
      return session;
    });
  }

  function announceLogout(refreshToken: string) {
    postMessage({ type: "LOGOUT", sourceId: instanceId, refreshToken });
  }

  function announceRevoked(refreshToken: string) {
    postMessage({ type: "SESSION_REVOKED", sourceId: instanceId, refreshToken });
  }

  function dispose() {
    disposed = true;
    for (const listeners of waiters.values()) {
      listeners.clear();
    }
    waiters.clear();
    if (channel?.removeEventListener) {
      channel.removeEventListener("message", messageListener);
    } else if (channel) {
      channel.onmessage = null;
    }
    channel?.close();
  }

  async function handleMessage(message: unknown) {
    if (!isAuthSessionBroadcastMessage(message) || message.sourceId === instanceId || disposed) {
      return;
    }

    if (message.type === "SESSION_RENEWED") {
      rememberRenewedSession(message.session);
      await onSessionRenewed?.(message.session);
      return;
    }

    const reason = message.type === "LOGOUT" ? "LOGOUT" : "REVOKED";
    const clearResult = await clearStoredSessionIfCurrent(message.refreshToken);
    if (clearResult !== "newer-session-present") {
      await onSessionCleared?.({ refreshToken: message.refreshToken, reason });
    }
  }

  function withAuthLock<T>(operation: () => Promise<T>) {
    if (webLocks) {
      return webLocks.request(AUTH_LOCK_NAME, { mode: "exclusive" }, operation);
    }

    return withFallbackLock({
      ownerId: instanceId,
      nowMs,
      setTimeoutFn,
      operation,
    });
  }

  function rememberRenewedSession(session: AuthenticatedSession) {
    renewedSessions.set(session.refreshToken, session);
    const listeners = waiters.get(session.refreshToken);
    if (!listeners) {
      return;
    }

    waiters.delete(session.refreshToken);
    for (const listener of listeners) {
      listener(session);
    }
  }

  function waitForRenewedSession(refreshToken: string) {
    const existing = renewedSessions.get(refreshToken);
    if (existing) {
      return Promise.resolve(existing);
    }

    return new Promise<AuthenticatedSession | null>((resolve) => {
      let settled = false;
      const listener = (session: AuthenticatedSession) => {
        if (settled) {
          return;
        }
        settled = true;
        clearTimeoutFn(timeout);
        resolve(session);
      };
      const timeout = setTimeoutFn(() => {
        if (settled) {
          return;
        }
        settled = true;
        waiters.get(refreshToken)?.delete(listener);
        resolve(null);
      }, ADOPT_SESSION_WAIT_MS);

      const listeners = waiters.get(refreshToken) ?? new Set();
      listeners.add(listener);
      waiters.set(refreshToken, listeners);
    });
  }

  function postMessage(message: AuthSessionBroadcastMessage) {
    channel?.postMessage(message);
  }

  async function clearStoredSessionIfCurrent(refreshToken: string) {
    if (authSessionStorage.clearIfCurrent) {
      const latest = await authSessionStorage.load();
      if (latest && latest.refreshToken !== refreshToken) {
        return "newer-session-present" as const;
      }
      await authSessionStorage.clearIfCurrent(refreshToken);
      return latest ? "cleared" as const : "already-empty" as const;
    }

    const latest = await authSessionStorage.load();
    if (!latest) {
      return "already-empty" as const;
    }
    if (latest.refreshToken !== refreshToken) {
      return "newer-session-present" as const;
    }
    await authSessionStorage.clear();
    return "cleared" as const;
  }

  return {
    refresh,
    announceLogout,
    announceRevoked,
    dispose,
  };
}

export function toStoredSession(
  session: AuthenticatedSession,
  storedAt: string,
): StoredAuthSession {
  return {
    refreshToken: session.refreshToken,
    sessionId: session.sessionId,
    deviceId: session.deviceId,
    storedAt,
    user: session.user,
    workspaceId: session.workspaceId,
    accessTokenExpiresAt: session.accessTokenExpiresAt,
    refreshTokenExpiresAt: session.refreshTokenExpiresAt,
  };
}

async function withFallbackLock<T>({
  ownerId,
  nowMs,
  setTimeoutFn,
  operation,
}: {
  ownerId: string;
  nowMs: () => number;
  setTimeoutFn: typeof setTimeout;
  operation: () => Promise<T>;
}) {
  await acquireFallbackLock({ ownerId, nowMs, setTimeoutFn });
  try {
    return await operation();
  } finally {
    await releaseFallbackLock(ownerId);
  }
}

async function acquireFallbackLock({
  ownerId,
  nowMs,
  setTimeoutFn,
}: {
  ownerId: string;
  nowMs: () => number;
  setTimeoutFn: typeof setTimeout;
}) {
  while (true) {
    if (await tryAcquireFallbackLock(ownerId, nowMs)) {
      return;
    }

    await new Promise((resolve) => setTimeoutFn(resolve, FALLBACK_LOCK_RETRY_MS));
  }
}

async function tryAcquireFallbackLock(ownerId: string, nowMs: () => number) {
  const db = await getVinemaDb();
  const transaction = db.transaction(AUTH_SESSION_STORE, "readwrite");
  const current = parseFallbackLockRecord(await transaction.store.get(FALLBACK_LOCK_KEY));
  const now = nowMs();

  if (current && current.expiresAt > now && current.ownerId !== ownerId) {
    await transaction.done;
    return false;
  }

  const next: FallbackLockRecord = {
    ownerId,
    expiresAt: now + FALLBACK_LOCK_LEASE_MS,
  };
  await transaction.store.put(next, FALLBACK_LOCK_KEY);
  await transaction.done;
  return true;
}

async function releaseFallbackLock(ownerId: string) {
  const db = await getVinemaDb();
  const transaction = db.transaction(AUTH_SESSION_STORE, "readwrite");
  const current = parseFallbackLockRecord(await transaction.store.get(FALLBACK_LOCK_KEY));

  if (current?.ownerId === ownerId) {
    await transaction.store.delete(FALLBACK_LOCK_KEY);
  }
  await transaction.done;
}

function parseFallbackLockRecord(value: unknown): FallbackLockRecord | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const record = value as Record<string, unknown>;
  return typeof record.ownerId === "string" &&
    typeof record.expiresAt === "number" &&
    Number.isFinite(record.expiresAt)
    ? { ownerId: record.ownerId, expiresAt: record.expiresAt }
    : null;
}

function isAuthSessionBroadcastMessage(
  value: unknown,
): value is AuthSessionBroadcastMessage {
  if (!value || typeof value !== "object") {
    return false;
  }

  const message = value as Partial<AuthSessionBroadcastMessage>;
  if (typeof message.sourceId !== "string") {
    return false;
  }

  if (message.type === "SESSION_RENEWED") {
    return Boolean(message.session?.refreshToken && message.session.accessToken);
  }

  return (
    (message.type === "LOGOUT" || message.type === "SESSION_REVOKED") &&
    typeof message.refreshToken === "string" &&
    message.refreshToken.length > 0
  );
}

function defaultWebLocks(): WebLocksManager | null {
  if (typeof navigator === "undefined") {
    return null;
  }

  const candidate = navigator as Navigator & { locks?: WebLocksManager };
  return candidate.locks ?? null;
}

function defaultBroadcastChannelFactory() {
  if (typeof BroadcastChannel === "undefined") {
    return null;
  }

  return (name: string): BroadcastChannelLike => {
    const channel = new BroadcastChannel(name);
    return {
      postMessage(message) {
        channel.postMessage(message);
      },
      close() {
        channel.close();
      },
      addEventListener(_type, listener) {
        channel.addEventListener("message", listener as unknown as EventListener);
      },
      removeEventListener(_type, listener) {
        channel.removeEventListener("message", listener as unknown as EventListener);
      },
    };
  };
}

function createId() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }

  return `auth-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}
