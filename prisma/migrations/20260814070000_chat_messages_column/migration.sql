-- Collapse Message rows into Chat.messagesData; inbox reads clientData only.

ALTER TABLE "Chat" ADD COLUMN IF NOT EXISTS "messagesData" TEXT NOT NULL DEFAULT '[]';

UPDATE "Chat" c
SET "messagesData" = COALESCE(
  (
    SELECT json_agg(m."data"::json ORDER BY m."createdAt")
    FROM "Message" m
    WHERE m."spaceSlug" = c."spaceSlug" AND m."chatId" = c."id"
  ),
  '[]'::json
)::text
WHERE EXISTS (
  SELECT 1 FROM "Message" m
  WHERE m."spaceSlug" = c."spaceSlug" AND m."chatId" = c."id"
);

ALTER TABLE "Chat" RENAME COLUMN "data" TO "clientData";

DROP TABLE IF EXISTS "Message";
