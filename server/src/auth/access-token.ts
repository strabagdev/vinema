import { createHmac, timingSafeEqual } from "node:crypto";
import { AuthError } from "./auth-errors";
import type { AuthTokenConfig } from "./auth-config";

export type AccessTokenClaims = {
  sub: string;
  workspaceId: string;
  deviceId: string;
  sessionId: string;
  iat: number;
  exp: number;
  iss: string;
  aud: string;
};

export type AuthContext = {
  userId: string;
  workspaceId: string;
  deviceId: string;
  sessionId: string;
  expiresAt: string;
  claims: AccessTokenClaims;
};

export function issueAccessToken({
  userId,
  workspaceId,
  deviceId,
  sessionId,
  config,
  now = new Date(),
}: {
  userId: string;
  workspaceId: string;
  deviceId: string;
  sessionId: string;
  config: AuthTokenConfig;
  now?: Date;
}) {
  const iat = Math.floor(now.getTime() / 1000);
  const exp = iat + config.accessTokenTtlSeconds;
  const claims: AccessTokenClaims = {
    sub: userId,
    workspaceId,
    deviceId,
    sessionId,
    iat,
    exp,
    iss: config.issuer,
    aud: config.audience,
  };
  const header = { alg: "HS256", typ: "JWT" };
  const unsigned = `${base64UrlJson(header)}.${base64UrlJson(claims)}`;
  const signature = sign(unsigned, config.accessTokenSecret);

  return {
    accessToken: `${unsigned}.${signature}`,
    accessTokenExpiresAt: new Date(exp * 1000).toISOString(),
  };
}

export function verifyAccessToken(
  token: string,
  config: AuthTokenConfig,
  now = new Date(),
): AuthContext {
  const [headerPart, payloadPart, signaturePart] = token.split(".");
  if (!headerPart || !payloadPart || !signaturePart) {
    throw new AuthError("TOKEN_INVALID", "Token invalido.");
  }

  const unsigned = `${headerPart}.${payloadPart}`;
  const expected = sign(unsigned, config.accessTokenSecret);
  if (!safeEqual(signaturePart, expected)) {
    throw new AuthError("TOKEN_INVALID", "Token invalido.");
  }

  const header = parseBase64UrlJson(headerPart);
  if (header.alg !== "HS256" || header.typ !== "JWT") {
    throw new AuthError("TOKEN_INVALID", "Token invalido.");
  }

  const claims = parseClaims(payloadPart);
  if (claims.iss !== config.issuer) {
    throw new AuthError("TOKEN_INVALID", "Token invalido.");
  }

  if (claims.aud !== config.audience) {
    throw new AuthError("TOKEN_INVALID", "Token invalido.");
  }

  if (claims.exp <= Math.floor(now.getTime() / 1000)) {
    throw new AuthError("TOKEN_EXPIRED", "Token expirado.");
  }

  return {
    userId: claims.sub,
    workspaceId: claims.workspaceId,
    deviceId: claims.deviceId,
    sessionId: claims.sessionId,
    expiresAt: new Date(claims.exp * 1000).toISOString(),
    claims,
  };
}

function sign(value: string, secret: string) {
  return createHmac("sha256", secret).update(value).digest("base64url");
}

function safeEqual(first: string, second: string) {
  const firstBuffer = Buffer.from(first);
  const secondBuffer = Buffer.from(second);

  return (
    firstBuffer.length === secondBuffer.length &&
    timingSafeEqual(firstBuffer, secondBuffer)
  );
}

function base64UrlJson(value: unknown) {
  return Buffer.from(JSON.stringify(value)).toString("base64url");
}

function parseBase64UrlJson(value: string) {
  try {
    return JSON.parse(Buffer.from(value, "base64url").toString("utf8")) as Record<
      string,
      unknown
    >;
  } catch {
    throw new AuthError("TOKEN_INVALID", "Token invalido.");
  }
}

function parseClaims(value: string): AccessTokenClaims {
  const claims = parseBase64UrlJson(value);
  if (
    typeof claims.sub !== "string" ||
    typeof claims.workspaceId !== "string" ||
    typeof claims.deviceId !== "string" ||
    typeof claims.sessionId !== "string" ||
    typeof claims.iat !== "number" ||
    typeof claims.exp !== "number" ||
    typeof claims.iss !== "string" ||
    typeof claims.aud !== "string"
  ) {
    throw new AuthError("TOKEN_INVALID", "Token invalido.");
  }

  return claims as AccessTokenClaims;
}
