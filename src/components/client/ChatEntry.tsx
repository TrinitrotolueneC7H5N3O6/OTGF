"use client";

import { useEffect, useState } from "react";
import { resolveCustomerChatId } from "@/lib/store";

interface ChatEntryProps {
  slug: string;
}

function goToChat(spaceSlug: string, chatId: string) {
  // Hard navigation is more reliable through tunnels than client router.
  window.location.replace(`/${spaceSlug}/c/${chatId}`);
}

/**
 * Entry link:
 * - Returning device → probe one chat row (no full space load)
 * - Else slim client list for email resume, or mint a new local chat id
 * - Floor only sees them after they message
 */
export function ChatEntry({ slug }: ChatEntryProps) {
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function open() {
      try {
        const { spaceSlug, chatId } = await resolveCustomerChatId(slug);
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
