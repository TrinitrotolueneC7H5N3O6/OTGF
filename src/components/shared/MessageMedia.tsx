"use client";

import type { Message } from "@/lib/types";

interface MessageMediaProps {
  message: Message;
}

export function MessageMedia({ message }: MessageMediaProps) {
  if (message.kind === "video" && message.videoUrl) {
    return (
      <div className="bubble-media">
        <video
          src={message.videoUrl}
          controls
          playsInline
          className="bubble-video"
        />
      </div>
    );
  }

  if (message.imageUrl) {
    return (
      <div className="bubble-media">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={message.imageUrl} alt="" className="bubble-image" />
      </div>
    );
  }

  if (message.kind === "link" && message.linkUrl) {
    return (
      <div className="bubble-link">
        <a href={message.linkUrl} target="_blank" rel="noreferrer">
          {message.linkUrl}
        </a>
      </div>
    );
  }

  return null;
}
