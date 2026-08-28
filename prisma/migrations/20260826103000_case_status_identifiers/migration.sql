-- Add lightweight case workflow status and linked external identifiers.

ALTER TABLE "CustomerCase" ADD COLUMN IF NOT EXISTS "status" TEXT NOT NULL DEFAULT 'open';
ALTER TABLE "CustomerCase" ADD COLUMN IF NOT EXISTS "identifiers" JSONB NOT NULL DEFAULT '[]';

CREATE INDEX IF NOT EXISTS "CustomerCase_spaceSlug_status_idx" ON "CustomerCase"("spaceSlug", "status");
