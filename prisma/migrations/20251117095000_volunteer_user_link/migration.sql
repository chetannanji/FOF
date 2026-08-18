-- Add userId column to volunteers for linking to User accounts
ALTER TABLE "Volunteer"
ADD COLUMN "userId" TEXT;

-- Backfill userId using matching email addresses
UPDATE "Volunteer" v
SET "userId" = u.id
FROM "User" u
WHERE v.email = u.email
  AND v."userId" IS NULL;

-- Ensure every volunteer row is linked to a user
ALTER TABLE "Volunteer"
ALTER COLUMN "userId" SET NOT NULL;

-- Enforce uniqueness and referential integrity
CREATE UNIQUE INDEX "Volunteer_userId_key" ON "Volunteer"("userId");

ALTER TABLE "Volunteer"
ADD CONSTRAINT "Volunteer_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "User"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

