"use client";

import { useEffect, useState } from "react";
import { rememberChat } from "@/lib/chatMemory";
import { resolveCustomerChatId } from "@/lib/store";
import { ClientChat } from "./ClientChat";

interface EmbedChatProps {
  slug: string;
  openSignal?: number;
  requestedChatId?: string | null;
  onChatOpened?: (chatId: string) => void;
}

/**
 * Boots a remembered (or new) chat id, then renders ClientChat for iframe embeds.
 */
export function EmbedChat({
  slug,
  openSignal,
  requestedChatId,
  onChatOpened,
}: EmbedChatProps) {
  const [chatId, setChatId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function open() {
      try {
        const nextId = requestedChatId
          ? requestedChatId
          : (await resolveCustomerChatId(slug)).chatId;
        if (!cancelled) {
          rememberChat(slug, nextId);
          setError(null);
          setChatId(nextId);
          onChatOpened?.(nextId);
        }
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
  }, [onChatOpened, requestedChatId, slug]);

  if (error) {
    return <div className="client-chat-loading">{error}</div>;
  }

  if (!chatId) {
    return <div className="client-chat-loading">Opening chat…</div>;
  }

  return (
    <ClientChat
      key={chatId}
      slug={slug}
      chatId={chatId}
      embedded
      scrollToLatestSignal={openSignal}
    />
  );
}
