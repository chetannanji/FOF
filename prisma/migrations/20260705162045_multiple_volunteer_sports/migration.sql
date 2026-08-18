-- CreateTable
CREATE TABLE "VolunteerSport" (
    "id" TEXT NOT NULL,
    "volunteerId" TEXT NOT NULL,
    "sportId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "VolunteerSport_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "VolunteerSport_volunteerId_idx" ON "VolunteerSport"("volunteerId");

-- CreateIndex
CREATE INDEX "VolunteerSport_sportId_idx" ON "VolunteerSport"("sportId");

-- CreateIndex
CREATE UNIQUE INDEX "VolunteerSport_volunteerId_sportId_key" ON "VolunteerSport"("volunteerId", "sportId");

-- AddForeignKey
ALTER TABLE "VolunteerSport" ADD CONSTRAINT "VolunteerSport_volunteerId_fkey" FOREIGN KEY ("volunteerId") REFERENCES "Volunteer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VolunteerSport" ADD CONSTRAINT "VolunteerSport_sportId_fkey" FOREIGN KEY ("sportId") REFERENCES "Sport"("id") ON DELETE CASCADE ON UPDATE CASCADE;
