import {
  type AuthenticatedUser,
  type CurrentSessionResponse,
  type CurrentDeviceResponse,
  type LoginRequest,
  type LoginResponse,
  type LogoutRequest,
  type LogoutResponse,
  type RefreshSessionRequest,
  type RefreshSessionResponse,
  type DeviceSummary,
  type RegisterRequest,
  type RegisterResponse,
} from "@vinema/sync-contracts";
import { type AuthContext } from "./access-token";
import type { AuthSessionService } from "./auth-session-service";
import { AuthError } from "./auth-errors";
import type { DeviceService } from "./device-service";
import { normalizeEmail } from "./email";
import type { IdentityRepository, IdentityUserRecord } from "./identity-repository";
import { hashPassword, verifyPassword } from "./password";

export type IdentityService = {
  register(input: RegisterRequest): Promise<RegisterResponse>;
  login(input: LoginRequest): Promise<LoginResponse>;
  refresh(input: RefreshSessionRequest): Promise<RefreshSessionResponse>;
  logout(input: LogoutRequest): Promise<LogoutResponse>;
  getCurrentSession(authContext: AuthContext): Promise<CurrentSessionResponse>;
  getCurrentDevice(authContext: AuthContext): Promise<CurrentDeviceResponse>;
};

export function createIdentityService({
  repository,
  deviceService,
  sessionService,
  clock = () => new Date(),
  onWorkspaceCreated,
}: {
  repository: IdentityRepository;
  deviceService: DeviceService;
  sessionService: AuthSessionService;
  clock?: () => Date;
  onWorkspaceCreated?: (workspaceId: string) => void | Promise<void>;
}): IdentityService {
  return {
    async register(input) {
      const normalizedEmail = normalizeEmail(input.email);
      const existing = await repository.findUserByNormalizedEmail(normalizedEmail);
      if (existing) {
        throw new AuthError("EMAIL_ALREADY_EXISTS", "El email ya esta registrado.", 409);
      }

      const passwordHash = await hashPassword(input.password);
      const { user, workspace } = await repository.createUserWithPersonalWorkspace({
        email: input.email.trim(),
        normalizedEmail,
        passwordHash,
        displayName: input.displayName?.trim() || null,
        workspaceName: "Personal",
      });
      await onWorkspaceCreated?.(workspace.id);
      const { device } = await deviceService.registerOrUpdateDevice({
        userId: user.id,
        ...input.device,
      });

      return sessionResponse(user, workspace.id, device, sessionService, clock());
    },

    async login(input) {
      const normalizedEmail = normalizeEmail(input.email);
      const user = await repository.findUserByNormalizedEmail(normalizedEmail);

      if (!user || !(await verifyPassword(input.password, user.passwordHash))) {
        throw new AuthError(
          "INVALID_CREDENTIALS",
          "Credenciales invalidas.",
          401,
        );
      }

      if (user.disabledAt) {
        throw new AuthError("USER_DISABLED", "Usuario deshabilitado.", 401);
      }

      const { device } = await deviceService.registerOrUpdateDevice({
        userId: user.id,
        ...input.device,
      });

      return sessionResponse(
        user,
        user.personalWorkspaceId,
        device,
        sessionService,
        clock(),
        true,
      );
    },

    refresh(input) {
      return sessionService.refreshSession({
        refreshToken: input.refreshToken,
        now: clock(),
      });
    },

    async logout(input) {
      await sessionService.revokeSession({
        refreshToken: input.refreshToken,
        reason: "USER_LOGOUT",
        now: clock(),
      });
      return { ok: true };
    },

    async getCurrentSession(authContext) {
      const user = await repository.findUserById(authContext.userId);
      if (!user || user.disabledAt) {
        throw new AuthError("TOKEN_INVALID", "Token invalido.", 401);
      }

      if (user.personalWorkspaceId !== authContext.workspaceId) {
        throw new AuthError("WORKSPACE_FORBIDDEN", "Workspace no permitido.", 403);
      }

      const workspace = await repository.findWorkspaceById(authContext.workspaceId);
      if (!workspace) {
        throw new AuthError("TOKEN_INVALID", "Token invalido.", 401);
      }

      await deviceService.getCurrentDevice(authContext);

      return {
        user: toAuthenticatedUser(user),
        workspaceId: workspace.id,
        deviceId: authContext.deviceId,
        sessionId: authContext.sessionId,
        tokenExpiresAt: authContext.expiresAt,
      };
    },

    getCurrentDevice(authContext) {
      return deviceService.getCurrentDevice(authContext);
    },
  };
}

async function sessionResponse(
  user: IdentityUserRecord,
  workspaceId: string,
  device: DeviceSummary,
  sessionService: AuthSessionService,
  now: Date,
  revokeExistingForDevice = false,
): Promise<RegisterResponse> {
  const session = await sessionService.createSession({
    userId: user.id,
    workspaceId,
    deviceId: device.id,
    now,
    revokeExistingForDevice,
  });

  return {
    user: toAuthenticatedUser(user),
    workspaceId,
    deviceId: device.id,
    device,
    sessionId: session.session.id,
    accessToken: session.accessToken,
    accessTokenExpiresAt: session.accessTokenExpiresAt,
    refreshToken: session.refreshToken,
    refreshTokenExpiresAt: session.refreshTokenExpiresAt,
  };
}

function toAuthenticatedUser(user: IdentityUserRecord): AuthenticatedUser {
  return {
    id: user.id,
    email: user.email,
    displayName: user.displayName,
  };
}
