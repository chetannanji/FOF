-- Make community contact email optional. Empty strings would collide on the unique
-- index, so convert them to NULL before dropping NOT NULL.
UPDATE "Community" SET "email" = NULL WHERE "email" = '';
ALTER TABLE "Community" ALTER COLUMN "email" DROP NOT NULL;
