"use client";

import { useEffect, useState } from "react";
import type { BusinessSpace } from "@/lib/types";
import { PreChatPage } from "@/components/client/PreChatPage";
import { ClientChat } from "@/components/client/ClientChat";
import { IconMaximize, IconMinimize } from "@/components/shared/Icons";

const PREVIEW_CHAT_ID = "preview";

interface ClientFacingPreviewProps {
  slug: string;
  surface: "page" | "chat";
  space: BusinessSpace;
}

export function ClientFacingPreview({
  slug,
  surface,
  space,
}: ClientFacingPreviewProps) {
  const [fullscreen, setFullscreen] = useState(false);

  useEffect(() => {
    setFullscreen(false);
  }, [surface]);

  useEffect(() => {
    if (!fullscreen) return;
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") setFullscreen(false);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [fullscreen]);

  return (
    <aside
      className={`client-facing-preview${fullscreen ? " is-fullscreen" : ""}`}
      aria-label="Live preview"
      onClick={(event) => {
        if (fullscreen && event.target === event.currentTarget) {
          setFullscreen(false);
        }
      }}
    >
      <button
        type="button"
        className="client-facing-preview-fs"
        onClick={() => setFullscreen((open) => !open)}
        aria-label={fullscreen ? "Exit full screen" : "Enter full screen"}
        title={fullscreen ? "Exit full screen" : "Enter full screen"}
      >
        {fullscreen ? <IconMinimize size={16} /> : <IconMaximize size={16} />}
      </button>
      <div className="client-facing-preview-device" inert aria-hidden>
        {surface === "page" ? (
          <PreChatPage slug={slug} preview previewSpace={space} />
        ) : (
          <ClientChat
            slug={slug}
            chatId={PREVIEW_CHAT_ID}
            preview
            previewSpace={space}
          />
        )}
      </div>
    </aside>
  );
}
