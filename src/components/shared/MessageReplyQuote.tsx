"use client";

import type { MessageReplyRef } from "@/lib/types";

interface MessageReplyQuoteProps {
  reply: MessageReplyRef;
  onJump?: (id: string) => void;
}

export function MessageReplyQuote({ reply, onJump }: MessageReplyQuoteProps) {
  const who =
    reply.fromName?.trim() ||
    (reply.from === "client" ? "Customer" : "Shop");

  return (
    <button
      type="button"
      className="msg-reply-quote"
      onClick={(e) => {
        e.stopPropagation();
        onJump?.(reply.id);
      }}
      title="Jump to message"
    >
      <span className="msg-reply-quote-bar" aria-hidden />
      <span className="msg-reply-quote-body">
        <span className="msg-reply-quote-who">{who}</span>
        <span className="msg-reply-quote-text">{reply.preview}</span>
      </span>
    </button>
  );
}
