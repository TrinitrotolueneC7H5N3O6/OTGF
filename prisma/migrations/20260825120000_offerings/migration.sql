-- Catalog of products and services customers can inquire about in chat.

CREATE TABLE "Offering" (
    "id" TEXT NOT NULL,
    "spaceSlug" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "price" TEXT NOT NULL DEFAULT '',
    "kind" TEXT NOT NULL DEFAULT 'service',
    "imageUrl" TEXT NOT NULL DEFAULT '',
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Offering_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "Offering_spaceSlug_sortOrder_idx" ON "Offering"("spaceSlug", "sortOrder");

ALTER TABLE "Offering" ADD CONSTRAINT "Offering_spaceSlug_fkey" FOREIGN KEY ("spaceSlug") REFERENCES "Space"("slug") ON DELETE CASCADE ON UPDATE CASCADE;
