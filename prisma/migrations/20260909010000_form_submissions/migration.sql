-- Form submissions from public forms.

CREATE TABLE "FormSubmission" (
    "id" TEXT NOT NULL,
    "spaceSlug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL DEFAULT '',
    "phone" TEXT NOT NULL DEFAULT '',
    "title" TEXT NOT NULL DEFAULT '',
    "fields" JSONB NOT NULL DEFAULT '[]',
    "status" TEXT NOT NULL DEFAULT 'new',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FormSubmission_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "FormSubmission_spaceSlug_createdAt_idx" ON "FormSubmission"("spaceSlug", "createdAt");
CREATE INDEX "FormSubmission_spaceSlug_status_idx" ON "FormSubmission"("spaceSlug", "status");

ALTER TABLE "FormSubmission" ADD CONSTRAINT "FormSubmission_spaceSlug_fkey" FOREIGN KEY ("spaceSlug") REFERENCES "Space"("slug") ON DELETE CASCADE ON UPDATE CASCADE;
