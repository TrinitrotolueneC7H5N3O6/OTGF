"use client";

import { useEffect, useState } from "react";
import {
  createChatId,
  forgetChat,
  recallChat,
  rememberChat,
} from "@/lib/chatMemory";
import { ensureSpace } from "@/lib/store";

interface ChatEntryProps {
  slug: string;
}

function goToChat(spaceSlug: string, chatId: string) {
  // Hard navigation is more reliable through tunnels than client router.
  window.location.replace(`/${spaceSlug}/c/${chatId}`);
}

/**
 * Entry link:
 * - This device remembered a chat in localStorage → resume that URL
 * - If that chat was ended (or deleted), mint a new one
 * - Otherwise mint a new chat id locally (floor only sees them after they message)
 */
export function ChatEntry({ slug }: ChatEntryProps) {
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function open() {
      try {
        const space = await ensureSpace(slug);
        if (cancelled) return;
        const spaceSlug = space.business.slug;

        const existingId = recallChat(spaceSlug);
        let chatId = existingId || createChatId();

        if (existingId) {
          const remembered = space.clients.find((c) => c.id === existingId);
          const deleted = (space.deletedClientIds ?? []).includes(existingId);
          if (!remembered || remembered.chatEndedAt || deleted) {
            forgetChat(spaceSlug, existingId);
            chatId = createChatId();
          }
        }

        rememberChat(spaceSlug, chatId);
        if (!cancelled) goToChat(spaceSlug, chatId);
      } catch (err) {
        console.error(err);
        if (!cancelled) {
          setError("Could not open chat. Pull to refresh and try again.");
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

  return <div className="client-chat-loading">Opening your chat…</div>;
}
