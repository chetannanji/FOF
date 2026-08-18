-- Add adminUsername columns for community and sport admins
ALTER TABLE "Community"
ADD COLUMN "adminUsername" TEXT;

ALTER TABLE "Sport"
ADD COLUMN "adminUsername" TEXT;

-- Create unique indexes for new username fields
CREATE UNIQUE INDEX "Community_adminUsername_key" ON "Community"("adminUsername");
CREATE UNIQUE INDEX "Sport_adminUsername_key" ON "Sport"("adminUsername");

-- Additional indexes to support lookups
CREATE INDEX "Community_adminUsername_idx" ON "Community"("adminUsername");
CREATE INDEX "Sport_adminUsername_idx" ON "Sport"("adminUsername");

