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
  const [device, setDevice] = useState<"mobile" | "desktop">("mobile");
  const [showEndScreen, setShowEndScreen] = useState(false);

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
      <div className="client-facing-preview-controls" aria-label="Preview controls">
        <div className="client-facing-preview-segmented">
          {(["mobile", "desktop"] as const).map((mode) => (
            <button
              key={mode}
              type="button"
              className={device === mode ? "is-active" : undefined}
              onClick={() => setDevice(mode)}
              aria-pressed={device === mode}
            >
              {mode === "mobile" ? "Mobile" : "Desktop"}
            </button>
          ))}
        </div>
        {surface === "chat" ? (
          <button
            type="button"
            className={`client-facing-preview-toggle${
              showEndScreen ? " is-active" : ""
            }`}
            onClick={() => setShowEndScreen((show) => !show)}
            aria-pressed={showEndScreen}
          >
            End screen
          </button>
        ) : null}
      </div>
      <div
        className={`client-facing-preview-device is-${device}`}
        inert
        aria-hidden
      >
        {surface === "page" ? (
          <PreChatPage slug={slug} preview previewSpace={space} />
        ) : (
          <ClientChat
            slug={slug}
            chatId={PREVIEW_CHAT_ID}
            preview
            previewEnded={showEndScreen}
            previewSpace={space}
          />
        )}
      </div>
    </aside>
  );
}
