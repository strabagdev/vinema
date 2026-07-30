-- CreateEnum
CREATE TYPE "DeviceAppType" AS ENUM ('WEB', 'PWA', 'TAURI', 'UNKNOWN');

-- CreateTable
CREATE TABLE "Device" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "clientDeviceId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "platform" TEXT NOT NULL,
  "appType" "DeviceAppType" NOT NULL,
  "appVersion" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "revokedAt" TIMESTAMP(3),

  CONSTRAINT "Device_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Device_userId_clientDeviceId_key" ON "Device"("userId", "clientDeviceId");
CREATE INDEX "Device_userId_idx" ON "Device"("userId");
CREATE INDEX "Device_lastSeenAt_idx" ON "Device"("lastSeenAt");
CREATE INDEX "Device_revokedAt_idx" ON "Device"("revokedAt");

-- AddForeignKey
ALTER TABLE "Device" ADD CONSTRAINT "Device_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
