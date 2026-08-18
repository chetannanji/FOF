-- Drop unique constraints on email fields
DROP INDEX IF EXISTS "User_email_key";
DROP INDEX IF EXISTS "Participant_email_key";

-- Add userId column to participants
ALTER TABLE "Participant"
ADD COLUMN "userId" TEXT;

-- Backfill userId based on matching email addresses
UPDATE "Participant" p
SET "userId" = u.id
FROM "User" u
WHERE p.email = u.email
  AND p."userId" IS NULL;

-- Make userId required
ALTER TABLE "Participant"
ALTER COLUMN "userId" SET NOT NULL;

-- Enforce uniqueness and referential integrity
CREATE UNIQUE INDEX "Participant_userId_key" ON "Participant"("userId");

ALTER TABLE "Participant"
ADD CONSTRAINT "Participant_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "User"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

