-- Appointment requests submitted from scheduler quick builds.

CREATE TABLE "ScheduleRequest" (
    "id" TEXT NOT NULL,
    "spaceSlug" TEXT NOT NULL,
    "chatId" TEXT NOT NULL DEFAULT '',
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL DEFAULT '',
    "phone" TEXT NOT NULL DEFAULT '',
    "date" TEXT NOT NULL,
    "time" TEXT NOT NULL,
    "durationMinutes" INTEGER NOT NULL DEFAULT 30,
    "notes" TEXT NOT NULL DEFAULT '',
    "title" TEXT NOT NULL DEFAULT '',
    "status" TEXT NOT NULL DEFAULT 'requested',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ScheduleRequest_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ScheduleRequest_spaceSlug_date_idx" ON "ScheduleRequest"("spaceSlug", "date");
CREATE INDEX "ScheduleRequest_spaceSlug_status_idx" ON "ScheduleRequest"("spaceSlug", "status");
CREATE INDEX "ScheduleRequest_spaceSlug_createdAt_idx" ON "ScheduleRequest"("spaceSlug", "createdAt");

ALTER TABLE "ScheduleRequest" ADD CONSTRAINT "ScheduleRequest_spaceSlug_fkey" FOREIGN KEY ("spaceSlug") REFERENCES "Space"("slug") ON DELETE CASCADE ON UPDATE CASCADE;
