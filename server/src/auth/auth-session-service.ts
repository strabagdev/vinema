import type {
  AuthenticatedUser,
  RefreshSessionResponse,
} from "@vinema/sync-contracts";
import { issueAccessToken } from "./access-token";
import type { AuthTokenConfig } from "./auth-config";
import { AuthError } from "./auth-errors";
import type {
  AuthSessionRecord,
  AuthSessionRepository,
  CreateAuthSessionInput,
} from "./auth-session-repository";
import type { DeviceRepository } from "./device-repository";
import { toDeviceSummary } from "./device-service";
import type { IdentityRepository, IdentityUserRecord } from "./identity-repository";
import type { RefreshTokenCodec } from "./refresh-token-codec";

export type SessionRevokeReason =
  | "USER_LOGOUT"
  | "LOGIN_REPLACED_SESSION"
  | "TOKEN_REUSE_DETECTED"
  | "DEVICE_REVOKED";

export type AuthSessionService = {
  createSession(input: {
    userId: string;
    workspaceId: string;
    deviceId: string;
    revokeExistingForDevice?: boolean;
    now?: Date;
  }): Promise<CreatedSession>;
  refreshSession(input: { refreshToken: string; now?: Date }): Promise<RefreshSessionResponse>;
  revokeSession(input: {
    refreshToken: string;
    reason?: SessionRevokeReason;
    now?: Date;
  }): Promise<void>;
};

export type CreatedSession = {
  session: AuthSessionRecord;
  accessToken: string;
  accessTokenExpiresAt: string;
  refreshToken: string;
  refreshTokenExpiresAt: string;
};

export function createAuthSessionService({
  repository,
  identityRepository,
  deviceRepository,
  tokenConfig,
  refreshTokenCodec,
  clock = () => new Date(),
  logger,
}: {
  repository: AuthSessionRepository;
  identityRepository: IdentityRepository;
  deviceRepository: DeviceRepository;
  tokenConfig: AuthTokenConfig;
  refreshTokenCodec: RefreshTokenCodec;
  clock?: () => Date;
  logger?: { info?(message: string, context?: Record<string, unknown>): void };
}): AuthSessionService {
  return {
    async createSession(input) {
      const now = input.now ?? clock();
      const user = await loadValidUser(input.userId);
      const device = await loadValidDevice(input.userId, input.deviceId, now);
      if (user.personalWorkspaceId !== input.workspaceId) {
        throw new AuthError("WORKSPACE_FORBIDDEN", "Workspace no permitido.", 403);
      }

      if (input.revokeExistingForDevice) {
        await repository.revokeActiveByUserAndDeviceId(
          input.userId,
          input.deviceId,
          "LOGIN_REPLACED_SESSION",
          now,
        );
      }

      const sessionId = crypto.randomUUID();
      const refreshToken = refreshTokenCodec.generate(sessionId);
      const parsed = refreshTokenCodec.parse(refreshToken);
      const session = await repository.create(
        createSessionInput({
          id: sessionId,
          userId: input.userId,
          deviceId: device.id,
          tokenFamilyId: crypto.randomUUID(),
          generation: 1,
          refreshTokenHash: refreshTokenCodec.hash(parsed.secret),
          now,
          tokenConfig,
        }),
      );

      logger?.info?.("session_created", {
        sessionId: session.id,
        userId: input.userId,
        deviceId: device.id,
        timestamp: now.toISOString(),
      });

      return withTokens(session, input.workspaceId, refreshToken, tokenConfig, now);
    },

    async refreshSession({ refreshToken, now = clock() }) {
      const parsed = refreshTokenCodec.parse(refreshToken);
      const current = await repository.findById(parsed.sessionId);
      if (!current) {
        throw new AuthError("SESSION_NOT_FOUND", "Sesion invalida.", 401);
      }

      if (!refreshTokenCodec.verify(parsed.secret, current.refreshTokenHash)) {
        throw new AuthError("REFRESH_TOKEN_INVALID", "Sesion invalida.", 401);
      }

      if (current.replacedBySessionId) {
        await repository.revokeFamily(
          current.tokenFamilyId,
          "TOKEN_REUSE_DETECTED",
          now,
        );
        logger?.info?.("refresh_reuse_detected", {
          sessionId: current.id,
          userId: current.userId,
          deviceId: current.deviceId,
          timestamp: now.toISOString(),
        });
        throw new AuthError("REFRESH_TOKEN_REUSED", "Sesion invalida.", 401);
      }

      ensureRefreshable(current, now);
      const user = await loadValidUser(current.userId);
      const device = await loadValidDevice(current.userId, current.deviceId, now);
      const replacementId = crypto.randomUUID();
      const nextRefreshToken = refreshTokenCodec.generate(replacementId);
      const nextParsed = refreshTokenCodec.parse(nextRefreshToken);
      const replacementInput = createSessionInput({
        id: replacementId,
        userId: current.userId,
        deviceId: current.deviceId,
        tokenFamilyId: current.tokenFamilyId,
        generation: current.generation + 1,
        refreshTokenHash: refreshTokenCodec.hash(nextParsed.secret),
        now,
        tokenConfig,
      });
      const replacement = await repository.rotate({
        currentSessionId: current.id,
        expectedRefreshTokenHash: current.refreshTokenHash,
        replacement: replacementInput,
        lastUsedAt: now,
      });

      if (!replacement) {
        const latest = await repository.findById(current.id);
        if (latest?.replacedBySessionId) {
          await repository.revokeFamily(
            current.tokenFamilyId,
            "TOKEN_REUSE_DETECTED",
            now,
          );
          throw new AuthError("REFRESH_TOKEN_REUSED", "Sesion invalida.", 401);
        }
        throw new AuthError("REFRESH_TOKEN_INVALID", "Sesion invalida.", 401);
      }

      logger?.info?.("session_refreshed", {
        sessionId: replacement.id,
        userId: replacement.userId,
        deviceId: replacement.deviceId,
        timestamp: now.toISOString(),
      });

      const tokens = withTokens(
        replacement,
        user.personalWorkspaceId,
        nextRefreshToken,
        tokenConfig,
        now,
      );

      return {
        user: toAuthenticatedUser(user),
        workspaceId: user.personalWorkspaceId,
        deviceId: device.id,
        device: toDeviceSummary(device),
        sessionId: replacement.id,
        accessToken: tokens.accessToken,
        accessTokenExpiresAt: tokens.accessTokenExpiresAt,
        refreshToken: tokens.refreshToken,
        refreshTokenExpiresAt: tokens.refreshTokenExpiresAt,
      };
    },

    async revokeSession({ refreshToken, reason = "USER_LOGOUT", now = clock() }) {
      let parsed;
      try {
        parsed = refreshTokenCodec.parse(refreshToken);
      } catch {
        return;
      }

      const session = await repository.findById(parsed.sessionId);
      if (!session || !refreshTokenCodec.verify(parsed.secret, session.refreshTokenHash)) {
        return;
      }

      await repository.revoke(session.id, reason, now);
      logger?.info?.("session_revoked", {
        sessionId: session.id,
        userId: session.userId,
        deviceId: session.deviceId,
        reason,
        timestamp: now.toISOString(),
      });
    },
  };

  async function loadValidUser(userId: string) {
    const user = await identityRepository.findUserById(userId);
    if (!user || user.disabledAt) {
      throw new AuthError("SESSION_INVALID", "Sesion invalida.", 401);
    }
    return user;
  }

  async function loadValidDevice(userId: string, deviceId: string, at: Date) {
    const device = await deviceRepository.findById(deviceId);
    if (!device || device.userId !== userId) {
      throw new AuthError("SESSION_INVALID", "Sesion invalida.", 401);
    }
    if (device.revokedAt) {
      await repository.revokeByDeviceId(device.id, "DEVICE_REVOKED", at);
      logger?.info?.("device_session_rejected", {
        userId,
        deviceId,
        reason: "DEVICE_REVOKED",
        timestamp: at.toISOString(),
      });
      throw new AuthError("DEVICE_REVOKED", "Dispositivo revocado.", 403);
    }
    return device;
  }
}

function createSessionInput({
  id,
  userId,
  deviceId,
  tokenFamilyId,
  generation,
  refreshTokenHash,
  now,
  tokenConfig,
}: {
  id: string;
  userId: string;
  deviceId: string;
  tokenFamilyId: string;
  generation: number;
  refreshTokenHash: string;
  now: Date;
  tokenConfig: AuthTokenConfig;
}): CreateAuthSessionInput {
  return {
    id,
    userId,
    deviceId,
    tokenFamilyId,
    generation,
    refreshTokenHash,
    createdAt: now,
    updatedAt: now,
    expiresAt: new Date(now.getTime() + tokenConfig.refreshTokenTtlSeconds * 1000),
  };
}

function ensureRefreshable(session: AuthSessionRecord, now: Date) {
  if (session.revokedAt) {
    throw new AuthError("REFRESH_TOKEN_REVOKED", "Sesion invalida.", 401);
  }
  if (session.expiresAt <= now) {
    throw new AuthError("REFRESH_TOKEN_EXPIRED", "Sesion expirada.", 401);
  }
}

function withTokens(
  session: AuthSessionRecord,
  workspaceId: string,
  refreshToken: string,
  tokenConfig: AuthTokenConfig,
  now: Date,
): CreatedSession {
  const access = issueAccessToken({
    userId: session.userId,
    workspaceId,
    deviceId: session.deviceId,
    sessionId: session.id,
    config: tokenConfig,
    now,
  });

  return {
    session,
    accessToken: access.accessToken,
    accessTokenExpiresAt: access.accessTokenExpiresAt,
    refreshToken,
    refreshTokenExpiresAt: session.expiresAt.toISOString(),
  };
}

function toAuthenticatedUser(user: IdentityUserRecord): AuthenticatedUser {
  return {
    id: user.id,
    email: user.email,
    displayName: user.displayName,
  };
}
