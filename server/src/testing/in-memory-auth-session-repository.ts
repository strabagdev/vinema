import type {
  AuthSessionRecord,
  AuthSessionRepository,
  CreateAuthSessionInput,
  RotateAuthSessionInput,
} from "../auth/auth-session-repository";

export class InMemoryAuthSessionRepository implements AuthSessionRepository {
  readonly sessions = new Map<string, AuthSessionRecord>();

  async create(input: CreateAuthSessionInput) {
    const session = toRecord(input);
    this.sessions.set(session.id, session);
    return session;
  }

  async findById(id: string) {
    return this.sessions.get(id) ?? null;
  }

  async findActiveById(id: string, at: Date) {
    const session = this.sessions.get(id);
    if (!session || session.revokedAt || session.replacedBySessionId) {
      return null;
    }
    return session.expiresAt > at ? session : null;
  }

  async findByTokenFamilyId(tokenFamilyId: string) {
    return [...this.sessions.values()]
      .filter((session) => session.tokenFamilyId === tokenFamilyId)
      .sort((a, b) => a.generation - b.generation);
  }

  async rotate(input: RotateAuthSessionInput) {
    const current = this.sessions.get(input.currentSessionId);
    if (
      !current ||
      current.refreshTokenHash !== input.expectedRefreshTokenHash ||
      current.revokedAt ||
      current.replacedBySessionId ||
      current.expiresAt <= input.lastUsedAt
    ) {
      return null;
    }

    this.sessions.set(current.id, {
      ...current,
      lastUsedAt: input.lastUsedAt,
      replacedBySessionId: input.replacement.id,
      updatedAt: input.lastUsedAt,
    });
    const replacement = toRecord(input.replacement);
    this.sessions.set(replacement.id, replacement);
    return replacement;
  }

  async revoke(id: string, reason: string, at: Date) {
    const session = this.sessions.get(id);
    if (!session) {
      return null;
    }
    if (!session.revokedAt) {
      this.sessions.set(id, { ...session, revokedAt: at, revokeReason: reason, updatedAt: at });
    }
    return this.sessions.get(id) ?? null;
  }

  async revokeFamily(tokenFamilyId: string, reason: string, at: Date) {
    let count = 0;
    for (const session of this.sessions.values()) {
      if (session.tokenFamilyId === tokenFamilyId && !session.revokedAt) {
        this.sessions.set(session.id, {
          ...session,
          revokedAt: at,
          revokeReason: reason,
          updatedAt: at,
        });
        count += 1;
      }
    }
    return count;
  }

  async revokeByDeviceId(deviceId: string, reason: string, at: Date) {
    let count = 0;
    for (const session of this.sessions.values()) {
      if (session.deviceId === deviceId && !session.revokedAt) {
        this.sessions.set(session.id, {
          ...session,
          revokedAt: at,
          revokeReason: reason,
          updatedAt: at,
        });
        count += 1;
      }
    }
    return count;
  }

  async revokeActiveByUserAndDeviceId(
    userId: string,
    deviceId: string,
    reason: string,
    at: Date,
  ) {
    let count = 0;
    for (const session of this.sessions.values()) {
      if (
        session.userId === userId &&
        session.deviceId === deviceId &&
        !session.revokedAt &&
        session.expiresAt > at
      ) {
        this.sessions.set(session.id, {
          ...session,
          revokedAt: at,
          revokeReason: reason,
          updatedAt: at,
        });
        count += 1;
      }
    }
    return count;
  }

  async touchLastUsed(id: string, at: Date) {
    const session = this.sessions.get(id);
    if (!session || session.revokedAt) {
      return null;
    }
    const updated = { ...session, lastUsedAt: at, updatedAt: at };
    this.sessions.set(id, updated);
    return updated;
  }

  async listActiveByUserId(userId: string, at: Date) {
    return [...this.sessions.values()].filter(
      (session) => session.userId === userId && !session.revokedAt && session.expiresAt > at,
    );
  }

  async listActiveByDeviceId(deviceId: string, at: Date) {
    return [...this.sessions.values()].filter(
      (session) => session.deviceId === deviceId && !session.revokedAt && session.expiresAt > at,
    );
  }
}

function toRecord(input: CreateAuthSessionInput): AuthSessionRecord {
  return {
    id: input.id,
    userId: input.userId,
    deviceId: input.deviceId,
    refreshTokenHash: input.refreshTokenHash,
    tokenFamilyId: input.tokenFamilyId,
    generation: input.generation,
    createdAt: input.createdAt,
    updatedAt: input.updatedAt,
    lastUsedAt: null,
    expiresAt: input.expiresAt,
    revokedAt: null,
    revokeReason: null,
    replacedBySessionId: null,
    userAgentSummary: input.userAgentSummary ?? null,
  };
}
