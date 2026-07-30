-- AlterTable
ALTER TABLE "User" ADD COLUMN "normalizedEmail" TEXT;
ALTER TABLE "User" ADD COLUMN "passwordHash" TEXT;
ALTER TABLE "User" ADD COLUMN "personalWorkspaceId" TEXT;
ALTER TABLE "User" ADD COLUMN "disabledAt" TIMESTAMP(3);

-- Backfill identity fields for legacy users. Legacy users are disabled until
-- they register/login through VIN-008A credentials.
UPDATE "User"
SET
  "normalizedEmail" = lower(trim("email")),
  "passwordHash" = 'legacy-disabled-password-hash',
  "disabledAt" = COALESCE("disabledAt", CURRENT_TIMESTAMP);

UPDATE "User" AS u
SET "personalWorkspaceId" = owner_workspace."workspaceId"
FROM (
  SELECT DISTINCT ON ("userId") "userId", "workspaceId"
  FROM "WorkspaceMember"
  WHERE "role" = 'OWNER'
  ORDER BY "userId", "createdAt" ASC
) AS owner_workspace
WHERE owner_workspace."userId" = u."id";

ALTER TABLE "User" ALTER COLUMN "normalizedEmail" SET NOT NULL;
ALTER TABLE "User" ALTER COLUMN "passwordHash" SET NOT NULL;
ALTER TABLE "User" ALTER COLUMN "personalWorkspaceId" SET NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "User_normalizedEmail_key" ON "User"("normalizedEmail");
CREATE INDEX "User_personalWorkspaceId_idx" ON "User"("personalWorkspaceId");

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_personalWorkspaceId_fkey" FOREIGN KEY ("personalWorkspaceId") REFERENCES "Workspace"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
