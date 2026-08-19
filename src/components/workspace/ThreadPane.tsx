"use client";

import { useLayoutEffect, useEffect, useRef, useState } from "react";
import type { Artifact, Client, Message } from "@/lib/types";
import { isClientLive } from "@/lib/presence";
import {
  recallThreadScroll,
  saveThreadScroll,
} from "@/lib/threadScroll";
import { MessageMedia } from "@/components/shared/MessageMedia";
import { isReconnectMessage } from "@/lib/customerAutoReply";
import { ArtifactThumb } from "./ArtifactThumb";
import {
  IconArrowSend,
  IconClock,
  IconPaperclip,
  IconX,
} from "@/components/shared/Icons";

interface ThreadPaneProps {
  client: Client;
  scrollKey: string;
  messages: Message[];
  draft: string;
  pendingArtifact: Artifact | null;
  scrollToBottomTick: number;
  onDraftChange: (value: string) => void;
  onSend: () => void;
  onSendImage: (file: File) => Promise<void> | void;
  onConfirmPending: () => void;
  onDismissPending: () => void;
  onEndChat: () => void;
}

function nearBottom(el: HTMLElement, threshold = 72) {
  return el.scrollHeight - el.scrollTop - el.clientHeight < threshold;
}

export function ThreadPane({
  client,
  scrollKey,
  messages,
  draft,
  pendingArtifact,
  scrollToBottomTick,
  onDraftChange,
  onSend,
  onSendImage,
  onConfirmPending,
  onDismissPending,
  onEndChat,
}: ThreadPaneProps) {
  const [showTimes, setShowTimes] = useState(false);
  const [attaching, setAttaching] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const fileRef = useRef<HTMLInputElement>(null);
  const streamRef = useRef<HTMLDivElement>(null);
  const activeKeyRef = useRef<string | null>(null);
  const messageCountRef = useRef(messages.length);
  const lastTickRef = useRef(scrollToBottomTick);
  const ended = Boolean(client.chatEndedAt);
  const live = !ended && isClientLive(client, now);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 8_000);
    return () => window.clearInterval(timer);
  }, []);

  function jumpToBottom() {
    const el = streamRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
    saveThreadScroll(scrollKey, el.scrollTop);
  }

  useLayoutEffect(() => {
    const el = streamRef.current;
    if (!el) return;

    const switched = activeKeyRef.current !== scrollKey;
    if (switched) {
      activeKeyRef.current = scrollKey;
      messageCountRef.current = messages.length;
      const saved = recallThreadScroll(scrollKey);
      el.scrollTop =
        typeof saved === "number" ? saved : el.scrollHeight;
      return;
    }

    const grew = messages.length > messageCountRef.current;
    messageCountRef.current = messages.length;
    if (grew && nearBottom(el)) {
      jumpToBottom();
    }
  }, [scrollKey, messages]);

  useLayoutEffect(() => {
    if (scrollToBottomTick === lastTickRef.current) return;
    lastTickRef.current = scrollToBottomTick;
    if (scrollToBottomTick === 0) return;
    // Wait a frame so the new bubble / draft is laid out first.
    requestAnimationFrame(() => {
      jumpToBottom();
      requestAnimationFrame(jumpToBottom);
    });
  }, [scrollToBottomTick, scrollKey, messages, pendingArtifact]);

  useLayoutEffect(() => {
    if (!pendingArtifact) return;
    jumpToBottom();
  }, [pendingArtifact, scrollKey]);

  function onStreamScroll() {
    const el = streamRef.current;
    if (!el) return;
    saveThreadScroll(scrollKey, el.scrollTop);
  }

  async function onFileChange(file: File | null) {
    if (!file) return;
    setAttaching(true);
    try {
      await onSendImage(file);
    } finally {
      setAttaching(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  return (
    <div className="thread">
      <header className="thread-head">
        <div className="thread-head-row">
          <div className="thread-head-main">
            <div className="thread-title-row">
              <h2>{client.name}</h2>
              {live ? (
                <span
                  className="client-live-dot"
                  aria-label="Customer is live"
                  title="Live on chat"
                />
              ) : null}
              {live ? (
                <span className="thread-live-pill" title="Customer is on the chat right now">
                  <span className="client-live-dot" aria-hidden />
                  Live
                </span>
              ) : null}
            </div>
            {client.email ? (
              <p className="thread-email">
                <a href={`mailto:${client.email}`}>{client.email}</a>
              </p>
            ) : null}
            {client.note ? <p className="thread-note">{client.note}</p> : null}
          </div>
          <div className="thread-head-actions">
            {ended ? (
              <span className="chat-ended-label thread-ended-label">
                Chat ended
              </span>
            ) : (
              <button
                type="button"
                className="thread-end-chat"
                onClick={onEndChat}
              >
                End chat
              </button>
            )}
            <label
              className={`show-times-toggle ${showTimes ? "is-on" : ""}`}
              title={showTimes ? "Hide times" : "Show times"}
            >
              <input
                type="checkbox"
                checked={showTimes}
                onChange={(e) => setShowTimes(e.target.checked)}
              />
              <IconClock />
              <span className="sr-only">Show times</span>
            </label>
          </div>
        </div>
      </header>

      <div
        ref={streamRef}
        className="thread-stream"
        role="log"
        aria-live="polite"
        onScroll={onStreamScroll}
      >
        {messages.length === 0 && !pendingArtifact ? (
          <div className="thread-empty">
            <p>No messages yet.</p>
          </div>
        ) : (
          messages.map((message) => (
            <article
              key={message.id}
              className={`bubble bubble-${message.from} bubble-${message.kind}`}
            >
              {message.from === "business" && message.fromName ? (
                <span className="bubble-speaker">{message.fromName}</span>
              ) : null}
              {isReconnectMessage(message) ? (
                <div className="client-reconnect">
                  <p>{message.body}</p>
                  {message.linkUrl ? (
                    <a className="client-reconnect-link" href={message.linkUrl}>
                      {message.linkUrl}
                    </a>
                  ) : null}
                </div>
              ) : (
                <>
                  <MessageMedia message={message} />
                  {message.body && message.kind !== "link" ? (
                    <p>{message.body}</p>
                  ) : null}
                </>
              )}
              {showTimes ? <time>{message.at}</time> : null}
            </article>
          ))
        )}

        {pendingArtifact ? (
          <div className="pending-artifact" role="status">
            <div className="pending-artifact-card">
              <ArtifactThumb artifact={pendingArtifact} />
              <div className="pending-artifact-body">
                <p className="pending-artifact-label">Draft</p>
                <h3>{pendingArtifact.title}</h3>
                {pendingArtifact.kind === "text" && pendingArtifact.body ? (
                  <p className="pending-artifact-copy">
                    {pendingArtifact.body}
                  </p>
                ) : null}
                {pendingArtifact.kind === "url" && pendingArtifact.url ? (
                  <p className="pending-artifact-copy">{pendingArtifact.url}</p>
                ) : null}
              </div>
              <div className="pending-artifact-actions">
                <button
                  type="button"
                  className="pending-dismiss icon-btn"
                  onClick={onDismissPending}
                  aria-label="Dismiss draft"
                  title="Dismiss"
                >
                  <IconX size={14} />
                </button>
                <button
                  type="button"
                  className="pending-send"
                  onClick={onConfirmPending}
                  aria-label="Send draft"
                  title="Send"
                >
                  →
                </button>
              </div>
            </div>
          </div>
        ) : null}
      </div>

      {ended ? (
        <footer className="composer composer-ended" role="status">
          <p>Chat ended</p>
        </footer>
      ) : (
        <footer className="composer">
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            className="sr-only"
            id="floor-attach-image"
            onChange={(e) => void onFileChange(e.target.files?.[0] ?? null)}
          />
          <label
            htmlFor="floor-attach-image"
            className={`composer-attach ${attaching ? "is-busy" : ""}`}
            aria-label="Attach image"
            title="Attach image"
          >
            <PaperclipIcon />
          </label>
          <label className="composer-field">
            <span className="sr-only">Message</span>
            <input
              value={draft ?? ""}
              onChange={(e) => onDraftChange(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  onSend();
                }
              }}
              placeholder="Message…"
            />
          </label>
          <button
            type="button"
            className="composer-send"
            onClick={onSend}
            aria-label="Send"
          >
            <IconArrowSend />
          </button>
        </footer>
      )}
    </div>
  );
}

function PaperclipIcon() {
  return <IconPaperclip />;
}
