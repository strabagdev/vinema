import type { AuthenticatedUser } from "@vinema/sync-contracts";

export interface StoredAuthSession {
  refreshToken: string;
  sessionId: string;
  deviceId: string;
  storedAt: string;
  user?: AuthenticatedUser;
  workspaceId?: string;
  accessTokenExpiresAt?: string;
  refreshTokenExpiresAt?: string;
}

export interface AuthSessionStorage {
  load(): Promise<StoredAuthSession | null>;
  save(session: StoredAuthSession): Promise<void>;
  clear(): Promise<void>;
}

export class AuthSessionStorageError extends Error {
  constructor(
    message: string,
    public readonly cause?: unknown,
  ) {
    super(message);
    this.name = "AuthSessionStorageError";
  }
}

export function parseStoredAuthSession(value: unknown): StoredAuthSession | null {
  if (typeof value !== "object" || value === null) {
    return null;
  }

  const record = value as Record<string, unknown>;
  const refreshToken = readNonEmptyString(record.refreshToken);
  const sessionId = readNonEmptyString(record.sessionId);
  const deviceId = readNonEmptyString(record.deviceId);
  const storedAt = readNonEmptyString(record.storedAt);

  if (!refreshToken || !sessionId || !deviceId || !storedAt || !isIsoDate(storedAt)) {
    return null;
  }

  const workspaceId = readNonEmptyString(record.workspaceId) ?? undefined;
  const accessTokenExpiresAt = readIsoString(record.accessTokenExpiresAt) ?? undefined;
  const refreshTokenExpiresAt = readIsoString(record.refreshTokenExpiresAt) ?? undefined;
  const user = parseStoredUser(record.user);

  return {
    refreshToken,
    sessionId,
    deviceId,
    storedAt,
    user,
    workspaceId,
    accessTokenExpiresAt,
    refreshTokenExpiresAt,
  };
}

export function cloneStoredAuthSession(session: StoredAuthSession): StoredAuthSession {
  return {
    refreshToken: session.refreshToken,
    sessionId: session.sessionId,
    deviceId: session.deviceId,
    storedAt: session.storedAt,
    user: session.user ? { ...session.user } : undefined,
    workspaceId: session.workspaceId,
    accessTokenExpiresAt: session.accessTokenExpiresAt,
    refreshTokenExpiresAt: session.refreshTokenExpiresAt,
  };
}

function readNonEmptyString(value: unknown) {
  return typeof value === "string" && value.trim().length > 0 ? value : null;
}

function isIsoDate(value: string) {
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) && new Date(timestamp).toISOString() === value;
}

function readIsoString(value: unknown) {
  const text = readNonEmptyString(value);

  return text && isIsoDate(text) ? text : null;
}

function parseStoredUser(value: unknown): AuthenticatedUser | undefined {
  if (!value || typeof value !== "object") {
    return undefined;
  }

  const record = value as Record<string, unknown>;
  const id = readNonEmptyString(record.id);
  const email = readNonEmptyString(record.email);

  if (!id || !email) {
    return undefined;
  }

  return {
    id,
    email,
    displayName:
      typeof record.displayName === "string" || record.displayName === null
        ? record.displayName
        : null,
  };
}
