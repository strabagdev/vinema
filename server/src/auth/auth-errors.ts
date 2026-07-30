import type { AuthErrorCode } from "@vinema/sync-contracts";

export class AuthError extends Error {
  constructor(
    public readonly code: AuthErrorCode,
    message: string,
    public readonly statusCode = statusForAuthError(code),
    public readonly details?: unknown[],
  ) {
    super(message);
    this.name = "AuthError";
  }
}

export function authErrorResponse(
  code: AuthErrorCode,
  message: string,
  details?: unknown[],
) {
  return {
    error: {
      code,
      message,
      ...(details ? { details } : {}),
    },
  };
}

function statusForAuthError(code: AuthErrorCode) {
  if (code === "EMAIL_ALREADY_EXISTS") {
    return 409;
  }

  if (
    code === "INVALID_CREDENTIALS" ||
    code === "TOKEN_MISSING" ||
    code === "TOKEN_INVALID" ||
    code === "TOKEN_EXPIRED" ||
    code === "USER_DISABLED"
  ) {
    return 401;
  }

  if (code === "WORKSPACE_FORBIDDEN") {
    return 403;
  }

  if (code === "VALIDATION_ERROR") {
    return 400;
  }

  return 500;
}
