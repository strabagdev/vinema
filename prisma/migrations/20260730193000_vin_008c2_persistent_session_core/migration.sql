-- VIN-008C2 - Persistent Session Core
-- Adds server-side persistent auth sessions without storing plaintext refresh tokens.

CREATE TABLE "AuthSession" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "deviceId" TEXT NOT NULL,
    "refreshTokenHash" TEXT NOT NULL,
    "tokenFamilyId" TEXT NOT NULL,
    "generation" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "lastUsedAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "revokedAt" TIMESTAMP(3),
    "revokeReason" TEXT,
    "replacedBySessionId" TEXT,
    "userAgentSummary" TEXT,

    CONSTRAINT "AuthSession_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "AuthSession_tokenFamilyId_generation_key" ON "AuthSession"("tokenFamilyId", "generation");
CREATE INDEX "AuthSession_userId_idx" ON "AuthSession"("userId");
CREATE INDEX "AuthSession_deviceId_idx" ON "AuthSession"("deviceId");
CREATE INDEX "AuthSession_tokenFamilyId_idx" ON "AuthSession"("tokenFamilyId");
CREATE INDEX "AuthSession_expiresAt_idx" ON "AuthSession"("expiresAt");
CREATE INDEX "AuthSession_revokedAt_idx" ON "AuthSession"("revokedAt");

ALTER TABLE "AuthSession" ADD CONSTRAINT "AuthSession_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "AuthSession" ADD CONSTRAINT "AuthSession_deviceId_fkey"
FOREIGN KEY ("deviceId") REFERENCES "Device"("id") ON DELETE CASCADE ON UPDATE CASCADE;
