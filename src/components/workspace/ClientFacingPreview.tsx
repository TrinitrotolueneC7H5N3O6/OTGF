"use client";

import { useState } from "react";
import type { BusinessSpace } from "@/lib/types";
import { PreChatPage } from "@/components/client/PreChatPage";
import { ClientChat } from "@/components/client/ClientChat";
import { PreviewFrame } from "./PreviewFrame";

const PREVIEW_CHAT_ID = "preview";

interface ClientFacingPreviewProps {
  slug: string;
  surface: "page" | "chat" | "widget";
  space?: BusinessSpace;
}

export function ClientFacingPreview({
  slug,
  surface,
  space,
}: ClientFacingPreviewProps) {
  const [revision, setRevision] = useState(0);
  const [showEndScreen, setShowEndScreen] = useState(false);
  const [exploreChat, setExploreChat] = useState(false);
  const sitePreview = `/widget-demo.html?slug=${encodeURIComponent(slug)}&preview=1`;
  const interactive = surface === "page" || surface === "widget";

  function restart() {
    setRevision((n) => n + 1);
    setExploreChat(false);
    setShowEndScreen(false);
  }

  return (
    <PreviewFrame
      onRestart={restart}
      screenClassName="preview-frame-client"
      controls={surface === "chat" ? (
        <button type="button" className={`client-facing-preview-toggle${showEndScreen ? " is-active" : ""}`} onClick={() => setShowEndScreen((show) => !show)} aria-pressed={showEndScreen}>End screen</button>
      ) : surface === "page" && exploreChat ? (
        <button type="button" className="client-facing-preview-toggle" onClick={() => setExploreChat(false)}>Back to page</button>
      ) : null}
    >
      <div
        key={`${surface}-${revision}`}
        className={`preview-frame-content${surface === "widget" ? " is-site" : ""}`}
        inert={interactive ? undefined : true}
        aria-hidden={interactive ? undefined : true}
      >
        {surface === "page" && space && exploreChat ? (
          <ClientChat
            slug={slug}
            chatId={PREVIEW_CHAT_ID}
            preview
            previewSpace={space}
          />
        ) : surface === "page" && space ? (
          <PreChatPage
            slug={slug}
            preview
            previewSpace={space}
            onOpenChat={() => setExploreChat(true)}
            modalChat
          />
        ) : surface === "chat" && space ? (
          <ClientChat
            slug={slug}
            chatId={PREVIEW_CHAT_ID}
            preview
            previewEnded={showEndScreen}
            previewSpace={space}
          />
        ) : surface === "widget" ? (
          <iframe
            className="widget-site-frame"
            title="Widget on a sample website"
            src={sitePreview}
          />
        ) : null}
      </div>
    </PreviewFrame>
  );
}
