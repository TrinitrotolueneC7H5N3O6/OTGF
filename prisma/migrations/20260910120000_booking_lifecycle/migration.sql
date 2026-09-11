ALTER TABLE "ScheduleRequest"
  ADD COLUMN "schedulerId" TEXT NOT NULL DEFAULT '',
  ADD COLUMN "timeZone" TEXT NOT NULL DEFAULT 'UTC',
  ADD COLUMN "startsAt" TIMESTAMP(3),
  ADD COLUMN "endsAt" TIMESTAMP(3),
  ADD COLUMN "bufferBeforeMinutes" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "bufferAfterMinutes" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "managementTokenHash" TEXT;
CREATE UNIQUE INDEX "ScheduleRequest_managementTokenHash_key" ON "ScheduleRequest"("managementTokenHash");
