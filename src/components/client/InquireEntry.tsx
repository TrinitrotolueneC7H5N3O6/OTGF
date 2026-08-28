"use client";

import { useEffect, useState } from "react";
import { resolveCustomerChatId } from "@/lib/store";
import type { Offering } from "@/lib/types";

interface InquireEntryProps {
  slug: string;
  offering: Offering;
}

function goToChat(spaceSlug: string, chatId: string, offeringId: string) {
  window.location.replace(
    `/${spaceSlug}/c/${chatId}?ask=${encodeURIComponent(offeringId)}`,
  );
}

export function InquireEntry({ slug, offering }: InquireEntryProps) {
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function open() {
      try {
        const { spaceSlug, chatId } = await resolveCustomerChatId(slug);
        if (!cancelled) goToChat(spaceSlug, chatId, offering.id);
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
  }, [slug, offering.id]);

  if (error) {
    return <div className="client-chat-loading">{error}</div>;
  }

  return (
    <div className="client-chat-loading">
      Opening chat about {offering.title}…
    </div>
  );
}

export function InquireMissing() {
  return (
    <div className="client-missing">
      <p className="brand-name">OTGF</p>
      <h1>Nothing here</h1>
      <p>This product or service isn’t listed anymore.</p>
    </div>
  );
}
