"use client";

import { MESSAGE_REACTION_EMOJIS } from "@/lib/messageSocial";

interface MessageActionBarProps {
  onReply: () => void;
  onReact: (emoji: string) => void;
  disabled?: boolean;
  align?: "start" | "end";
}

export function MessageActionBar({
  onReply,
  onReact,
  disabled,
  align = "start",
}: MessageActionBarProps) {
  if (disabled) return null;

  return (
    <div
      className={`msg-action-bar is-${align}`}
      role="group"
      aria-label="Message actions"
    >
      <button
        type="button"
        className="msg-action-btn"
        onClick={(e) => {
          e.stopPropagation();
          onReply();
        }}
      >
        Reply
      </button>
      <span className="msg-action-sep" aria-hidden />
      {MESSAGE_REACTION_EMOJIS.map((emoji) => (
        <button
          key={emoji}
          type="button"
          className="msg-action-react"
          onClick={(e) => {
            e.stopPropagation();
            onReact(emoji);
          }}
          aria-label={`React ${emoji}`}
          title={emoji}
        >
          {emoji}
        </button>
      ))}
    </div>
  );
}
