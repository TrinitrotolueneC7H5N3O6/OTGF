"use client";

import { useCallback, useState } from "react";
import { EmbedChat } from "./EmbedChat";
import { PreChatPage } from "./PreChatPage";

interface EmbedAppProps {
  slug: string;
  start: "page" | "chat";
}

export function EmbedApp({ slug, start }: EmbedAppProps) {
  const [view, setView] = useState<"page" | "chat">(start);
  const openChat = useCallback(() => setView("chat"), []);

  return (
    <div className="otgf-embed-root">
      {view === "page" ? (
        <PreChatPage slug={slug} embedded onOpenChat={openChat} />
      ) : (
        <EmbedChat slug={slug} />
      )}
    </div>
  );
}
