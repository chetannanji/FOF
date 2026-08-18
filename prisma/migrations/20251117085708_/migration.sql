/*
  Warnings:

  - A unique constraint covering the columns `[adminEmail]` on the table `Community` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[convenorId]` on the table `Sport` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[adminEmail]` on the table `Sport` will be added. If there are existing duplicate values, this will fail.

*/
-- CreateEnum
CREATE TYPE "MedalType" AS ENUM ('gold', 'silver', 'bronze', 'none');

-- DropForeignKey
ALTER TABLE "Volunteer" DROP CONSTRAINT "Volunteer_departmentId_fkey";

-- AlterTable
ALTER TABLE "Community" ADD COLUMN     "adminEmail" TEXT,
ADD COLUMN     "adminPassword" TEXT;

-- AlterTable
ALTER TABLE "Participant" ADD COLUMN     "pendingSports" JSONB;

-- AlterTable
ALTER TABLE "Settings" ADD COLUMN     "profileFreezeDate" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "Sport" ADD COLUMN     "adminEmail" TEXT,
ADD COLUMN     "adminPassword" TEXT,
ADD COLUMN     "convenorId" TEXT,
ADD COLUMN     "rules" TEXT;

-- AlterTable
ALTER TABLE "Volunteer" ALTER COLUMN "departmentId" DROP NOT NULL;

-- CreateTable
CREATE TABLE "SportIncompatibility" (
    "id" TEXT NOT NULL,
    "sportId" TEXT NOT NULL,
    "incompatibleSportId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SportIncompatibility_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CommunityContact" (
    "id" TEXT NOT NULL,
    "communityId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CommunityContact_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Convenor" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "sportId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Convenor_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TournamentFormat" (
    "id" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TournamentFormat_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LeaderboardEntry" (
    "id" TEXT NOT NULL,
    "communityId" TEXT NOT NULL,
    "sportId" TEXT NOT NULL,
    "score" INTEGER NOT NULL DEFAULT 0,
    "position" INTEGER,
    "medalType" "MedalType" NOT NULL DEFAULT 'none',
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LeaderboardEntry_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SportIncompatibility_sportId_idx" ON "SportIncompatibility"("sportId");

-- CreateIndex
CREATE INDEX "SportIncompatibility_incompatibleSportId_idx" ON "SportIncompatibility"("incompatibleSportId");

-- CreateIndex
CREATE UNIQUE INDEX "SportIncompatibility_sportId_incompatibleSportId_key" ON "SportIncompatibility"("sportId", "incompatibleSportId");

-- CreateIndex
CREATE INDEX "CommunityContact_communityId_idx" ON "CommunityContact"("communityId");

-- CreateIndex
CREATE UNIQUE INDEX "Convenor_sportId_key" ON "Convenor"("sportId");

-- CreateIndex
CREATE INDEX "Convenor_sportId_idx" ON "Convenor"("sportId");

-- CreateIndex
CREATE INDEX "TournamentFormat_category_idx" ON "TournamentFormat"("category");

-- CreateIndex
CREATE UNIQUE INDEX "TournamentFormat_category_key" ON "TournamentFormat"("category");

-- CreateIndex
CREATE INDEX "LeaderboardEntry_communityId_idx" ON "LeaderboardEntry"("communityId");

-- CreateIndex
CREATE INDEX "LeaderboardEntry_sportId_idx" ON "LeaderboardEntry"("sportId");

-- CreateIndex
CREATE INDEX "LeaderboardEntry_score_idx" ON "LeaderboardEntry"("score");

-- CreateIndex
CREATE UNIQUE INDEX "LeaderboardEntry_communityId_sportId_key" ON "LeaderboardEntry"("communityId", "sportId");

-- CreateIndex
CREATE UNIQUE INDEX "Community_adminEmail_key" ON "Community"("adminEmail");

-- CreateIndex
CREATE INDEX "Community_adminEmail_idx" ON "Community"("adminEmail");

-- CreateIndex
CREATE UNIQUE INDEX "Sport_convenorId_key" ON "Sport"("convenorId");

-- CreateIndex
CREATE UNIQUE INDEX "Sport_adminEmail_key" ON "Sport"("adminEmail");

-- CreateIndex
CREATE INDEX "Sport_convenorId_idx" ON "Sport"("convenorId");

-- CreateIndex
CREATE INDEX "Sport_adminEmail_idx" ON "Sport"("adminEmail");

-- AddForeignKey
ALTER TABLE "Volunteer" ADD CONSTRAINT "Volunteer_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "Department"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Sport" ADD CONSTRAINT "Sport_convenorId_fkey" FOREIGN KEY ("convenorId") REFERENCES "Convenor"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SportIncompatibility" ADD CONSTRAINT "SportIncompatibility_sportId_fkey" FOREIGN KEY ("sportId") REFERENCES "Sport"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SportIncompatibility" ADD CONSTRAINT "SportIncompatibility_incompatibleSportId_fkey" FOREIGN KEY ("incompatibleSportId") REFERENCES "Sport"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CommunityContact" ADD CONSTRAINT "CommunityContact_communityId_fkey" FOREIGN KEY ("communityId") REFERENCES "Community"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeaderboardEntry" ADD CONSTRAINT "LeaderboardEntry_communityId_fkey" FOREIGN KEY ("communityId") REFERENCES "Community"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeaderboardEntry" ADD CONSTRAINT "LeaderboardEntry_sportId_fkey" FOREIGN KEY ("sportId") REFERENCES "Sport"("id") ON DELETE CASCADE ON UPDATE CASCADE;
