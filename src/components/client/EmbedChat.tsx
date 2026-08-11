"use client";

import { useEffect, useState } from "react";
import {
  createChatId,
  forgetChat,
  recallChat,
  recallChatEmail,
  rememberChat,
} from "@/lib/chatMemory";
import { ensureSpace } from "@/lib/store";
import { ClientChat } from "./ClientChat";

interface EmbedChatProps {
  slug: string;
}

/**
 * Boots a remembered (or new) chat id, then renders ClientChat for iframe embeds.
 */
export function EmbedChat({ slug }: EmbedChatProps) {
  const [chatId, setChatId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function open() {
      try {
        const space = await ensureSpace(slug);
        if (cancelled) return;
        const spaceSlug = space.business.slug;

        const existingId = recallChat(spaceSlug);
        let nextId = existingId || createChatId();

        if (existingId) {
          const remembered = space.clients.find((c) => c.id === existingId);
          if (!remembered || remembered.chatEndedAt) {
            forgetChat(spaceSlug, existingId);
            nextId = createChatId();
          }
        }

        if (!existingId || nextId !== existingId) {
          const email = recallChatEmail(spaceSlug)?.toLowerCase();
          if (email) {
            const byEmail = space.clients.find(
              (c) =>
                c.email?.trim().toLowerCase() === email && !c.chatEndedAt,
            );
            if (byEmail) nextId = byEmail.id;
          }
        }

        rememberChat(spaceSlug, nextId);
        if (!cancelled) setChatId(nextId);
      } catch (err) {
        console.error(err);
        if (!cancelled) {
          setError("Could not open chat. Refresh and try again.");
        }
      }
    }

    void open();
    return () => {
      cancelled = true;
    };
  }, [slug]);

  if (error) {
    return <div className="client-chat-loading">{error}</div>;
  }

  if (!chatId) {
    return <div className="client-chat-loading">Opening chat…</div>;
  }

  return <ClientChat slug={slug} chatId={chatId} embedded />;
}
