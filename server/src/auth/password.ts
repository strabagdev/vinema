import { randomBytes, scrypt as scryptCallback, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
import {
  MAX_AUTH_PASSWORD_LENGTH,
  MIN_AUTH_PASSWORD_LENGTH,
} from "@vinema/sync-contracts";
import { AuthError } from "./auth-errors";

const scrypt = promisify(scryptCallback);
const PASSWORD_HASH_VERSION = "scrypt-v1";
const KEY_LENGTH = 64;
const SALT_LENGTH = 16;

export function validatePasswordPolicy(password: string) {
  if (
    password.length < MIN_AUTH_PASSWORD_LENGTH ||
    password.length > MAX_AUTH_PASSWORD_LENGTH
  ) {
    throw new AuthError(
      "VALIDATION_ERROR",
      `La password debe tener entre ${MIN_AUTH_PASSWORD_LENGTH} y ${MAX_AUTH_PASSWORD_LENGTH} caracteres.`,
    );
  }
}

export async function hashPassword(password: string) {
  validatePasswordPolicy(password);
  const salt = randomBytes(SALT_LENGTH);
  const derivedKey = (await scrypt(password, salt, KEY_LENGTH)) as Buffer;

  return [
    PASSWORD_HASH_VERSION,
    salt.toString("base64url"),
    derivedKey.toString("base64url"),
  ].join("$");
}

export async function verifyPassword(password: string, passwordHash: string) {
  const [version, salt, expected] = passwordHash.split("$");
  if (version !== PASSWORD_HASH_VERSION || !salt || !expected) {
    return false;
  }

  const expectedBuffer = Buffer.from(expected, "base64url");
  const actual = (await scrypt(
    password,
    Buffer.from(salt, "base64url"),
    expectedBuffer.length,
  )) as Buffer;

  return (
    actual.length === expectedBuffer.length &&
    timingSafeEqual(actual, expectedBuffer)
  );
}
