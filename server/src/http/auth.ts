import { timingSafeEqual } from "node:crypto";
import type { FastifyRequest } from "fastify";
import { verifyAccessToken, type AuthContext } from "../auth/access-token";
import type { AuthTokenConfig } from "../auth/auth-config";
import { AuthError } from "../auth/auth-errors";

export function getAuthContext(
  request: FastifyRequest,
  tokenConfig: AuthTokenConfig,
): AuthContext {
  const authorization = request.headers.authorization;

  if (!authorization) {
    throw new AuthError("TOKEN_MISSING", "Token requerido.", 401);
  }

  if (!authorization.startsWith("Bearer ")) {
    throw new AuthError("TOKEN_INVALID", "Token invalido.", 401);
  }

  return verifyAccessToken(
    authorization.slice("Bearer ".length),
    tokenConfig,
  );
}

export function isAuthorizedTestApiKey(request: FastifyRequest, apiKey?: string) {
  if (process.env.NODE_ENV !== "test" || !apiKey) {
    return false;
  }

  const authorization = request.headers.authorization;
  if (!authorization?.startsWith("Bearer ")) {
    return false;
  }

  return timingSafeCompare(authorization.slice("Bearer ".length), apiKey);
}

function timingSafeCompare(first: string, second: string) {
  const firstBuffer = Buffer.from(first);
  const secondBuffer = Buffer.from(second);

  return (
    firstBuffer.length === secondBuffer.length &&
    timingSafeEqual(firstBuffer, secondBuffer)
  );
}
