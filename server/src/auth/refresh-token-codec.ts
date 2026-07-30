import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { AuthError } from "./auth-errors";

const SECRET_BYTES = 32;

export type ParsedRefreshToken = {
  sessionId: string;
  secret: string;
};

export type RefreshTokenCodec = {
  generate(sessionId: string): string;
  parse(token: string): ParsedRefreshToken;
  hash(secret: string): string;
  verify(secret: string, hash: string): boolean;
};

export function createRefreshTokenCodec(): RefreshTokenCodec {
  return {
    generate(sessionId) {
      return `${sessionId}.${randomBytes(SECRET_BYTES).toString("base64url")}`;
    },
    parse(token) {
      const [sessionId, secret, extra] = token.split(".");
      if (!sessionId || !secret || extra !== undefined) {
        throw new AuthError("REFRESH_TOKEN_INVALID", "Sesion invalida.", 401);
      }

      return { sessionId, secret };
    },
    hash(secret) {
      return createHash("sha256").update(secret).digest("base64url");
    },
    verify(secret, hash) {
      return safeEqual(this.hash(secret), hash);
    },
  };
}

function safeEqual(first: string, second: string) {
  const firstBuffer = Buffer.from(first);
  const secondBuffer = Buffer.from(second);

  return (
    firstBuffer.length === secondBuffer.length &&
    timingSafeEqual(firstBuffer, secondBuffer)
  );
}
