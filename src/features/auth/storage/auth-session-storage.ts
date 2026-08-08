import type { AuthenticatedUser } from "@vinema/sync-contracts";

export interface StoredAuthSession {
  sessionMode?: "remote";
  refreshToken: string;
  sessionId: string;
  deviceId: string;
  storedAt: string;
  user?: AuthenticatedUser;
  workspaceId?: string;
  accessTokenExpiresAt?: string;
  refreshTokenExpiresAt?: string;
}

export interface StoredLocalAuthIdentity {
  sessionMode: "local";
  active: boolean;
  userId: string;
  workspaceId: string;
  deviceId: string;
  sessionId: string;
  migrationStatus?: LocalAuthMigrationStatus;
  migrationStartedAt?: string;
  migratedAt?: string;
  migratedToUserId?: string;
  migratedToWorkspaceId?: string;
  migrationRunId?: string;
  createdAt: string;
  updatedAt: string;
}

export type LocalAuthMigrationStatus =
  | "LOCAL_PENDING"
  | "LOCAL_MIGRATING"
  | "LOCAL_MIGRATED";

export interface AuthSessionStorage {
  load(): Promise<StoredAuthSession | null>;
  save(session: StoredAuthSession): Promise<void>;
  clear(): Promise<void>;
}

export interface LocalAuthIdentityStorage {
  load(): Promise<StoredLocalAuthIdentity | null>;
  save(identity: StoredLocalAuthIdentity): Promise<void>;
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

export function parseStoredLocalAuthIdentity(value: unknown): StoredLocalAuthIdentity | null {
  if (typeof value !== "object" || value === null) {
    return null;
  }

  const record = value as Record<string, unknown>;
  const sessionMode = record.sessionMode;
  const userId = readNonEmptyString(record.userId);
  const workspaceId = readNonEmptyString(record.workspaceId);
  const deviceId = readNonEmptyString(record.deviceId);
  const sessionId = readNonEmptyString(record.sessionId);
  const createdAt = readIsoString(record.createdAt);
  const updatedAt = readIsoString(record.updatedAt);
  const migrationStatus = parseMigrationStatus(record.migrationStatus);
  const migrationStartedAt = readIsoString(record.migrationStartedAt) ?? undefined;
  const migratedAt = readIsoString(record.migratedAt) ?? undefined;
  const migratedToUserId = readNonEmptyString(record.migratedToUserId) ?? undefined;
  const migratedToWorkspaceId = readNonEmptyString(record.migratedToWorkspaceId) ?? undefined;
  const migrationRunId = readNonEmptyString(record.migrationRunId) ?? undefined;

  if (
    sessionMode !== "local" ||
    !userId ||
    !workspaceId ||
    !deviceId ||
    !sessionId ||
    !createdAt ||
    !updatedAt
  ) {
    return null;
  }

  return {
    sessionMode: "local",
    active: record.active === true,
    userId,
    workspaceId,
    deviceId,
    sessionId,
    migrationStatus:
      migrationStatus ??
      (migratedAt && migratedToWorkspaceId ? "LOCAL_MIGRATED" : "LOCAL_PENDING"),
    migrationStartedAt,
    migratedAt,
    migratedToUserId,
    migratedToWorkspaceId,
    migrationRunId,
    createdAt,
    updatedAt,
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

export function cloneStoredLocalAuthIdentity(
  identity: StoredLocalAuthIdentity,
): StoredLocalAuthIdentity {
  return { ...identity, sessionMode: "local" };
}

export function isMigratedLocalAuthIdentity(identity: StoredLocalAuthIdentity) {
  return identity.migrationStatus === "LOCAL_MIGRATED" ||
    Boolean(identity.migratedAt && identity.migratedToWorkspaceId);
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

function parseMigrationStatus(value: unknown): LocalAuthMigrationStatus | undefined {
  return value === "LOCAL_PENDING" ||
    value === "LOCAL_MIGRATING" ||
    value === "LOCAL_MIGRATED"
    ? value
    : undefined;
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
