CREATE TABLE "GrowthRecord" (
  "id" TEXT NOT NULL,
  "spaceSlug" TEXT NOT NULL,
  "kind" TEXT NOT NULL,
  "data" TEXT NOT NULL,
  "visits" INTEGER NOT NULL DEFAULT 0,
  "version" INTEGER NOT NULL DEFAULT 1,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "GrowthRecord_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "GrowthRecord_spaceSlug_kind_idx" ON "GrowthRecord"("spaceSlug", "kind");
ALTER TABLE "GrowthRecord" ADD CONSTRAINT "GrowthRecord_spaceSlug_fkey" FOREIGN KEY ("spaceSlug") REFERENCES "Space"("slug") ON DELETE CASCADE ON UPDATE CASCADE;
