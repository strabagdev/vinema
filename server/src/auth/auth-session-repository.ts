import type { AuthSession, PrismaClient } from "@prisma/client";

export type AuthSessionRecord = AuthSession;

export type CreateAuthSessionInput = {
  id: string;
  userId: string;
  deviceId: string;
  refreshTokenHash: string;
  tokenFamilyId: string;
  generation: number;
  createdAt: Date;
  updatedAt: Date;
  expiresAt: Date;
  userAgentSummary?: string | null;
};

export type RotateAuthSessionInput = {
  currentSessionId: string;
  expectedRefreshTokenHash: string;
  replacement: CreateAuthSessionInput;
  lastUsedAt: Date;
};

export interface AuthSessionRepository {
  create(input: CreateAuthSessionInput): Promise<AuthSessionRecord>;
  findById(id: string): Promise<AuthSessionRecord | null>;
  findActiveById(id: string, at: Date): Promise<AuthSessionRecord | null>;
  findByTokenFamilyId(tokenFamilyId: string): Promise<AuthSessionRecord[]>;
  rotate(input: RotateAuthSessionInput): Promise<AuthSessionRecord | null>;
  revoke(id: string, reason: string, at: Date): Promise<AuthSessionRecord | null>;
  revokeFamily(tokenFamilyId: string, reason: string, at: Date): Promise<number>;
  revokeByDeviceId(deviceId: string, reason: string, at: Date): Promise<number>;
  revokeActiveByUserAndDeviceId(
    userId: string,
    deviceId: string,
    reason: string,
    at: Date,
  ): Promise<number>;
  touchLastUsed(id: string, at: Date): Promise<AuthSessionRecord | null>;
  listActiveByUserId(userId: string, at: Date): Promise<AuthSessionRecord[]>;
  listActiveByDeviceId(deviceId: string, at: Date): Promise<AuthSessionRecord[]>;
}

export class PrismaAuthSessionRepository implements AuthSessionRepository {
  constructor(private readonly prisma: PrismaClient) {}

  create(input: CreateAuthSessionInput) {
    return this.prisma.authSession.create({
      data: {
        id: input.id,
        userId: input.userId,
        deviceId: input.deviceId,
        refreshTokenHash: input.refreshTokenHash,
        tokenFamilyId: input.tokenFamilyId,
        generation: input.generation,
        createdAt: input.createdAt,
        updatedAt: input.updatedAt,
        expiresAt: input.expiresAt,
        userAgentSummary: input.userAgentSummary ?? null,
      },
    });
  }

  findById(id: string) {
    return this.prisma.authSession.findUnique({ where: { id } });
  }

  findActiveById(id: string, at: Date) {
    return this.prisma.authSession.findFirst({
      where: {
        id,
        revokedAt: null,
        replacedBySessionId: null,
        expiresAt: { gt: at },
      },
    });
  }

  findByTokenFamilyId(tokenFamilyId: string) {
    return this.prisma.authSession.findMany({
      where: { tokenFamilyId },
      orderBy: { generation: "asc" },
    });
  }

  rotate(input: RotateAuthSessionInput) {
    return this.prisma.$transaction(async (tx) => {
      const consumed = await tx.authSession.updateMany({
        where: {
          id: input.currentSessionId,
          refreshTokenHash: input.expectedRefreshTokenHash,
          revokedAt: null,
          replacedBySessionId: null,
          expiresAt: { gt: input.lastUsedAt },
        },
        data: {
          lastUsedAt: input.lastUsedAt,
          replacedBySessionId: input.replacement.id,
          updatedAt: input.lastUsedAt,
        },
      });

      if (consumed.count !== 1) {
        return null;
      }

      return tx.authSession.create({
        data: {
          ...input.replacement,
          userAgentSummary: input.replacement.userAgentSummary ?? null,
        },
      });
    });
  }

  async revoke(id: string, reason: string, at: Date) {
    const result = await this.prisma.authSession.updateMany({
      where: { id, revokedAt: null },
      data: { revokedAt: at, revokeReason: reason, updatedAt: at },
    });

    if (result.count === 0) {
      return this.findById(id);
    }

    return this.findById(id);
  }

  async revokeFamily(tokenFamilyId: string, reason: string, at: Date) {
    const result = await this.prisma.authSession.updateMany({
      where: { tokenFamilyId, revokedAt: null },
      data: { revokedAt: at, revokeReason: reason, updatedAt: at },
    });
    return result.count;
  }

  async revokeByDeviceId(deviceId: string, reason: string, at: Date) {
    const result = await this.prisma.authSession.updateMany({
      where: { deviceId, revokedAt: null },
      data: { revokedAt: at, revokeReason: reason, updatedAt: at },
    });
    return result.count;
  }

  async revokeActiveByUserAndDeviceId(
    userId: string,
    deviceId: string,
    reason: string,
    at: Date,
  ) {
    const result = await this.prisma.authSession.updateMany({
      where: { userId, deviceId, revokedAt: null, expiresAt: { gt: at } },
      data: { revokedAt: at, revokeReason: reason, updatedAt: at },
    });
    return result.count;
  }

  async touchLastUsed(id: string, at: Date) {
    const result = await this.prisma.authSession.updateMany({
      where: { id, revokedAt: null },
      data: { lastUsedAt: at, updatedAt: at },
    });
    return result.count === 1 ? this.findById(id) : null;
  }

  listActiveByUserId(userId: string, at: Date) {
    return this.prisma.authSession.findMany({
      where: { userId, revokedAt: null, expiresAt: { gt: at } },
      orderBy: { createdAt: "desc" },
    });
  }

  listActiveByDeviceId(deviceId: string, at: Date) {
    return this.prisma.authSession.findMany({
      where: { deviceId, revokedAt: null, expiresAt: { gt: at } },
      orderBy: { createdAt: "desc" },
    });
  }
}
