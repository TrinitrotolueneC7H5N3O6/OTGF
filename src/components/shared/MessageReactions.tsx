"use client";

import type { MessageReaction } from "@/lib/types";
import { groupReactions } from "@/lib/messageSocial";

interface MessageReactionsProps {
  reactions?: MessageReaction[];
  /** Emojis this viewer already used (highlight) */
  myEmojis?: Set<string>;
  onToggle?: (emoji: string) => void;
  disabled?: boolean;
}

export function MessageReactions({
  reactions,
  myEmojis,
  onToggle,
  disabled,
}: MessageReactionsProps) {
  const groups = groupReactions(reactions);
  if (!groups.length) return null;

  return (
    <div className="msg-reactions" role="group" aria-label="Reactions">
      {groups.map((g) => {
        const mine = myEmojis?.has(g.emoji) ?? false;
        return (
          <button
            key={g.emoji}
            type="button"
            className={`msg-reaction-chip${mine ? " is-mine" : ""}`}
            disabled={disabled || !onToggle}
            onClick={(e) => {
              e.stopPropagation();
              onToggle?.(g.emoji);
            }}
            aria-label={`${g.emoji} ${g.count}`}
            title={mine ? "Remove reaction" : "Add reaction"}
          >
            <span aria-hidden>{g.emoji}</span>
            {g.count > 1 ? <span>{g.count}</span> : null}
          </button>
        );
      })}
    </div>
  );
}
