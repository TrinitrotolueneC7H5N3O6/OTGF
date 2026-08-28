-- Plain-language facts the AI can use to answer customers.

CREATE TABLE "KnowledgeNote" (
    "id" TEXT NOT NULL,
    "spaceSlug" TEXT NOT NULL,
    "horizon" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL DEFAULT '',
    "expiresAt" TIMESTAMP(3),
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "KnowledgeNote_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "KnowledgeNote_spaceSlug_horizon_sortOrder_idx" ON "KnowledgeNote"("spaceSlug", "horizon", "sortOrder");

ALTER TABLE "KnowledgeNote" ADD CONSTRAINT "KnowledgeNote_spaceSlug_fkey" FOREIGN KEY ("spaceSlug") REFERENCES "Space"("slug") ON DELETE CASCADE ON UPDATE CASCADE;
