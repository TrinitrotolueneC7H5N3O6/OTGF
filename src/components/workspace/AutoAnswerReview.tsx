"use client";

import { useEffect, useState } from "react";
import type { AutoAnswerDraft, Client } from "@/lib/types";
import { IconSparkle } from "@/components/shared/Icons";

interface AutoAnswerToggleProps {
  on: boolean;
  onToggle: (on: boolean) => void;
  hint?: string;
}

export function AutoAnswerToggle({ on, onToggle, hint }: AutoAnswerToggleProps) {
  return (
    <div className="auto-answer-toggle-wrap">
      <button
        type="button"
        className={`auto-answer-toggle ${on ? "is-on" : ""}`}
        aria-pressed={on}
        onClick={() => onToggle(!on)}
      >
        <span className="auto-answer-toggle-dot" aria-hidden />
        AI Auto-Answer
      </button>
      {hint ? <p className="auto-answer-toggle-hint">{hint}</p> : null}
    </div>
  );
}

interface AutoAnswerReviewProps {
  client: Client;
  draft: AutoAnswerDraft;
  queueLabel?: string;
  sending?: boolean;
  variant: "modal" | "banner";
  onSend: (body: string) => void;
  onLater?: () => void;
  onSkip: () => void;
  onRetry?: () => void;
  onTogglePause?: (off: boolean) => void;
}

export function AutoAnswerReview({
  client,
  draft,
  queueLabel,
  sending,
  variant,
  onSend,
  onLater,
  onSkip,
  onRetry,
  onTogglePause,
}: AutoAnswerReviewProps) {
  const [body, setBody] = useState(draft.body);

  useEffect(() => {
    setBody(draft.body);
  }, [draft.id, draft.status]);

  const ready = draft.status === "ready";
  const working = draft.status === "working";
  const failed = draft.status === "failed";
  const canSend = ready && Boolean(body.trim()) && !sending;

  return (
    <div className={`auto-answer-card is-${variant}`}>
      <header className="auto-answer-card-head">
        <span className="auto-answer-card-kicker">
          <IconSparkle />
          AI draft
          {queueLabel ? ` · ${queueLabel}` : ""}
        </span>
        <strong>{client.name}</strong>
        <span className="auto-answer-card-status">
          {working
            ? "Writing a reply for this chat…"
            : failed
              ? draft.error || "Couldn’t draft a reply"
              : "Review, tweak, then send — it won’t go out on its own."}
        </span>
      </header>

      {working ? (
        <p className="auto-answer-card-wait">This only uses {client.name}’s chat.</p>
      ) : (
        <textarea
          className="auto-answer-card-body"
          value={body}
          onChange={(e) => setBody(e.target.value)}
          rows={variant === "modal" ? 6 : 4}
          disabled={sending || working}
          aria-label={`Draft reply to ${client.name}`}
        />
      )}

      <div className="auto-answer-card-actions">
        {ready ? (
          <button
            type="button"
            className="btn-solid"
            disabled={!canSend}
            onClick={() => onSend(body.trim())}
          >
            {sending ? "Sending…" : "Send"}
          </button>
        ) : null}
        {failed && onRetry ? (
          <button type="button" className="btn-solid" onClick={onRetry}>
            Try again
          </button>
        ) : null}
        {onLater && (ready || failed) ? (
          <button type="button" className="btn-ghost" onClick={onLater}>
            Later
          </button>
        ) : null}
        <button
          type="button"
          className="btn-ghost"
          onClick={onSkip}
          disabled={sending}
        >
          Skip
        </button>
      </div>

      {onTogglePause ? (
        <label className="auto-answer-pause">
          <input
            type="checkbox"
            checked={Boolean(client.autoAnswerOff)}
            onChange={(e) => onTogglePause(e.target.checked)}
          />
          Don’t draft this chat
        </label>
      ) : null}
    </div>
  );
}
