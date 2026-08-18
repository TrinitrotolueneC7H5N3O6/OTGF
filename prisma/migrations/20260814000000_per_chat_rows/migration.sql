-- Fresh start: drop legacy blob payloads and split chats/messages into their own tables.

DELETE FROM "SpacePresence";
DELETE FROM "Space";

CREATE TABLE "Chat" (
    "id" TEXT NOT NULL,
    "spaceSlug" TEXT NOT NULL,
    "data" TEXT NOT NULL,
    "deleted" BOOLEAN NOT NULL DEFAULT false,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Chat_pkey" PRIMARY KEY ("spaceSlug","id")
);

CREATE TABLE "Message" (
    "id" TEXT NOT NULL,
    "spaceSlug" TEXT NOT NULL,
    "chatId" TEXT NOT NULL,
    "data" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Message_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "Chat_spaceSlug_updatedAt_idx" ON "Chat"("spaceSlug", "updatedAt");

CREATE INDEX "Message_spaceSlug_chatId_createdAt_idx" ON "Message"("spaceSlug", "chatId", "createdAt");

ALTER TABLE "Chat" ADD CONSTRAINT "Chat_spaceSlug_fkey" FOREIGN KEY ("spaceSlug") REFERENCES "Space"("slug") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Message" ADD CONSTRAINT "Message_spaceSlug_chatId_fkey" FOREIGN KEY ("spaceSlug", "chatId") REFERENCES "Chat"("spaceSlug", "id") ON DELETE CASCADE ON UPDATE CASCADE;
