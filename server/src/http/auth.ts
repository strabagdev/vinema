import { timingSafeEqual } from "node:crypto";
import type { FastifyRequest } from "fastify";

export function isAuthorizedRequest(request: FastifyRequest, apiKey: string) {
  const authorization = request.headers.authorization;

  if (!authorization?.startsWith("Bearer ")) {
    return false;
  }

  const token = authorization.slice("Bearer ".length);
  return timingSafeCompare(token, apiKey);
}

function timingSafeCompare(first: string, second: string) {
  const firstBuffer = Buffer.from(first);
  const secondBuffer = Buffer.from(second);

  if (firstBuffer.length !== secondBuffer.length) {
    return false;
  }

  return timingSafeEqual(firstBuffer, secondBuffer);
}
