export type AuthTokenConfig = {
  accessTokenSecret: string;
  issuer: string;
  audience: string;
  accessTokenTtlSeconds: number;
};

const DEFAULT_ISSUER = "vinema-api";
const DEFAULT_AUDIENCE = "vinema";
const DEFAULT_ACCESS_TOKEN_TTL_SECONDS = 15 * 60;
const MIN_PRODUCTION_SECRET_LENGTH = 32;

export function loadAuthTokenConfig(env: NodeJS.ProcessEnv): AuthTokenConfig {
  const accessTokenSecret = env.VINEMA_AUTH_ACCESS_TOKEN_SECRET;

  if (!accessTokenSecret) {
    throw new Error("VINEMA_AUTH_ACCESS_TOKEN_SECRET is required.");
  }

  if (
    env.NODE_ENV === "production" &&
    accessTokenSecret.length < MIN_PRODUCTION_SECRET_LENGTH
  ) {
    throw new Error("VINEMA_AUTH_ACCESS_TOKEN_SECRET is too weak for production.");
  }

  return {
    accessTokenSecret,
    issuer: env.VINEMA_AUTH_ISSUER ?? DEFAULT_ISSUER,
    audience: env.VINEMA_AUTH_AUDIENCE ?? DEFAULT_AUDIENCE,
    accessTokenTtlSeconds: parseTtl(env.VINEMA_AUTH_ACCESS_TOKEN_TTL_SECONDS),
  };
}

function parseTtl(value: string | undefined) {
  if (!value) {
    return DEFAULT_ACCESS_TOKEN_TTL_SECONDS;
  }

  const ttl = Number(value);
  if (!Number.isInteger(ttl) || ttl <= 0) {
    throw new Error("VINEMA_AUTH_ACCESS_TOKEN_TTL_SECONDS must be a positive integer.");
  }

  return ttl;
}
