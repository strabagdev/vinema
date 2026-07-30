import {
  type AuthenticatedUser,
  type CurrentSessionResponse,
  type LoginRequest,
  type LoginResponse,
  type RegisterRequest,
  type RegisterResponse,
} from "@vinema/sync-contracts";
import { issueAccessToken, type AuthContext } from "./access-token";
import type { AuthTokenConfig } from "./auth-config";
import { AuthError } from "./auth-errors";
import { normalizeEmail } from "./email";
import type { IdentityRepository, IdentityUserRecord } from "./identity-repository";
import { hashPassword, verifyPassword } from "./password";

export type IdentityService = {
  register(input: RegisterRequest): Promise<RegisterResponse>;
  login(input: LoginRequest): Promise<LoginResponse>;
  getCurrentSession(authContext: AuthContext): Promise<CurrentSessionResponse>;
};

export function createIdentityService({
  repository,
  tokenConfig,
  clock = () => new Date(),
  onWorkspaceCreated,
}: {
  repository: IdentityRepository;
  tokenConfig: AuthTokenConfig;
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

      return sessionResponse(user, workspace.id, tokenConfig, clock());
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

      return sessionResponse(user, user.personalWorkspaceId, tokenConfig, clock());
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

      return {
        user: toAuthenticatedUser(user),
        workspaceId: workspace.id,
        tokenExpiresAt: authContext.expiresAt,
      };
    },
  };
}

function sessionResponse(
  user: IdentityUserRecord,
  workspaceId: string,
  tokenConfig: AuthTokenConfig,
  now: Date,
): RegisterResponse {
  const token = issueAccessToken({
    userId: user.id,
    workspaceId,
    config: tokenConfig,
    now,
  });

  return {
    user: toAuthenticatedUser(user),
    workspaceId,
    accessToken: token.accessToken,
    accessTokenExpiresAt: token.accessTokenExpiresAt,
  };
}

function toAuthenticatedUser(user: IdentityUserRecord): AuthenticatedUser {
  return {
    id: user.id,
    email: user.email,
    displayName: user.displayName,
  };
}
