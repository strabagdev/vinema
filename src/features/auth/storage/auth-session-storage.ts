export interface StoredAuthSession {
  refreshToken: string;
  sessionId: string;
  deviceId: string;
  storedAt: string;
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

  return { refreshToken, sessionId, deviceId, storedAt };
}

export function cloneStoredAuthSession(session: StoredAuthSession): StoredAuthSession {
  return {
    refreshToken: session.refreshToken,
    sessionId: session.sessionId,
    deviceId: session.deviceId,
    storedAt: session.storedAt,
  };
}

function readNonEmptyString(value: unknown) {
  return typeof value === "string" && value.trim().length > 0 ? value : null;
}

function isIsoDate(value: string) {
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) && new Date(timestamp).toISOString() === value;
}
