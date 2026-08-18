"use client";

import { useEffect, useState } from "react";
import { resolveCustomerChatId } from "@/lib/store";
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
        const { chatId: nextId } = await resolveCustomerChatId(slug);
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
