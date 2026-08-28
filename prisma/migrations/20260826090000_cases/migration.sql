-- Cases group customer chats and preserve hidden inbox history.

CREATE TABLE "CustomerCase" (
    "id" TEXT NOT NULL,
    "spaceSlug" TEXT NOT NULL,
    "notes" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CustomerCase_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "Chat" ADD COLUMN IF NOT EXISTS "customerCaseId" TEXT;
ALTER TABLE "Chat" ADD COLUMN IF NOT EXISTS "hiddenFromInbox" BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX "CustomerCase_spaceSlug_updatedAt_idx" ON "CustomerCase"("spaceSlug", "updatedAt");
CREATE INDEX "Chat_spaceSlug_customerCaseId_idx" ON "Chat"("spaceSlug", "customerCaseId");

ALTER TABLE "CustomerCase" ADD CONSTRAINT "CustomerCase_spaceSlug_fkey" FOREIGN KEY ("spaceSlug") REFERENCES "Space"("slug") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Chat" ADD CONSTRAINT "Chat_customerCaseId_fkey" FOREIGN KEY ("customerCaseId") REFERENCES "CustomerCase"("id") ON DELETE SET NULL ON UPDATE CASCADE;
