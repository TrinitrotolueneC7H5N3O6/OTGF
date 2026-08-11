"use client";

import { useLayoutEffect, useEffect, useMemo, useRef, useState } from "react";
import type {
  Artifact,
  ChatBanner,
  Client,
  Message,
  MessageReplyRef,
  ResponseWindow,
} from "@/lib/types";
import { isClientLive } from "@/lib/presence";
import { formatResponseWindows } from "@/lib/spaceNormalize";
import { actorKey, reactorKey } from "@/lib/messageSocial";
import {
  clusterClassName,
  messageCluster,
} from "@/lib/messageCluster";
import {
  recallThreadScroll,
  saveThreadScroll,
} from "@/lib/threadScroll";
import { MessageMedia } from "@/components/shared/MessageMedia";
import { ReceiptCard } from "@/components/shared/ReceiptCard";
import { MessageReplyQuote } from "@/components/shared/MessageReplyQuote";
import { MessageReactions } from "@/components/shared/MessageReactions";
import { MessageActionBar } from "@/components/shared/MessageActionBar";
import { ComposerTextarea } from "@/components/shared/ComposerTextarea";
import { ArtifactThumb } from "./ArtifactThumb";
import type { RightTab } from "./RightPane";
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
  floorMemberName?: string;
  floorMemberId?: string;
  artifacts: Artifact[];
  windows: ResponseWindow[];
  responseNote: string;
  banners: ChatBanner[];
  replyTo: MessageReplyRef | null;
  onDraftChange: (value: string) => void;
  onSend: () => void;
  onSendImage: (file: File) => Promise<void> | void;
  onConfirmPending: () => void;
  onDismissPending: () => void;
  onEndChat: () => void;
  onOpenTool: (tab: RightTab) => void;
  onStageArtifact: (item: Artifact) => void;
  onReplyTo: (message: Message) => void;
  onClearReply: () => void;
  onReact: (messageId: string, emoji: string) => void;
  pendingIds?: Set<string>;
  failedIds?: Set<string>;
}

function nearBottom(el: HTMLElement, threshold = 72) {
  return el.scrollHeight - el.scrollTop - el.clientHeight < threshold;
}

function appendDraft(current: string, snippet: string) {
  const trim = current.trim();
  return trim ? `${trim} ${snippet}` : snippet;
}

export function ThreadPane({
  client,
  scrollKey,
  messages,
  draft,
  pendingArtifact,
  scrollToBottomTick,
  floorMemberName,
  floorMemberId,
  artifacts,
  windows,
  responseNote,
  banners,
  replyTo,
  onDraftChange,
  onSend,
  onSendImage,
  onConfirmPending,
  onDismissPending,
  onEndChat,
  onOpenTool,
  onStageArtifact,
  onReplyTo,
  onClearReply,
  onReact,
  pendingIds,
  failedIds,
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

  const hoursLabel = useMemo(
    () => formatResponseWindows(windows),
    [windows],
  );

  const shoutouts = useMemo(
    () =>
      banners.filter((b) => b.enabled && b.text.trim()).slice(0, 3),
    [banners],
  );

  const quickArtifacts = useMemo(() => {
    return [...artifacts]
      .sort((a, b) => (b.uses ?? 0) - (a.uses ?? 0))
      .slice(0, 4);
  }, [artifacts]);

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

  function scheduleJumpToBottom() {
    jumpToBottom();
    requestAnimationFrame(() => {
      jumpToBottom();
      requestAnimationFrame(jumpToBottom);
    });
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
      scheduleJumpToBottom();
    }
  }, [scrollKey, messages]);

  useLayoutEffect(() => {
    if (scrollToBottomTick === lastTickRef.current) return;
    lastTickRef.current = scrollToBottomTick;
    if (scrollToBottomTick === 0) return;
    scheduleJumpToBottom();
  }, [scrollToBottomTick, scrollKey, messages, pendingArtifact]);

  useLayoutEffect(() => {
    if (!pendingArtifact) return;
    scheduleJumpToBottom();
  }, [pendingArtifact, scrollKey]);

  // Reply composer chrome changes stream height — stay pinned like customer chat
  useLayoutEffect(() => {
    if (!replyTo) return;
    if (activeKeyRef.current !== scrollKey) return;
    scheduleJumpToBottom();
  }, [replyTo, scrollKey]);

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

  function insertText(snippet: string) {
    onDraftChange(appendDraft(draft, snippet));
  }

  function insertHours() {
    const note = responseNote.trim();
    const line = hoursLabel
      ? note
        ? `We're usually around ${hoursLabel} — ${note}`
        : `We're usually around ${hoursLabel}.`
      : note || "Happy to help with hours.";
    insertText(line);
  }

  function jumpToMessage(id: string) {
    const el = streamRef.current?.querySelector(
      `[data-message-id="${CSS.escape(id)}"]`,
    );
    if (el instanceof HTMLElement) {
      el.scrollIntoView({ behavior: "smooth", block: "center" });
      el.classList.add("is-flash");
      window.setTimeout(() => el.classList.remove("is-flash"), 1200);
    }
  }

  const myReactorKey = actorKey({
    from: "business",
    fromMemberId: floorMemberId,
  });

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
                <span
                  className="thread-live-pill"
                  title="Customer is on the chat right now"
                >
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
            {floorMemberName ? (
              <p className="thread-floor-member">
                Replying as {floorMemberName}
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
          messages.map((message, index) => {
            const mine = message.from === "business";
            const { role, continued } = messageCluster(messages, index);
            const myEmojis = new Set(
              (message.reactions ?? [])
                .filter((r) => reactorKey(r) === myReactorKey)
                .map((r) => r.emoji),
            );
            const mediaOnly =
              (message.kind === "image" || message.kind === "video") &&
              !message.body?.trim();
            const showSpeaker =
              message.from === "business" &&
              Boolean(message.fromName) &&
              !continued;
            return (
              <div
                key={message.id}
                className={`msg-wrap ${mine ? "is-mine" : "is-theirs"} ${clusterClassName(role, continued)}`}
                data-message-id={message.id}
              >
                <article
                  className={`bubble bubble-${message.from} bubble-${message.kind}${mediaOnly ? " is-media-only" : ""}${pendingIds?.has(message.id) ? " is-pending" : ""}${failedIds?.has(message.id) ? " is-failed" : ""}`}
                >
                  {showSpeaker ? (
                    <span className="bubble-speaker">{message.fromName}</span>
                  ) : null}
                  {message.replyTo ? (
                    <MessageReplyQuote
                      reply={message.replyTo}
                      onJump={jumpToMessage}
                    />
                  ) : null}
                  {message.kind === "receipt" && message.receipt ? (
                    <ReceiptCard
                      receipt={message.receipt}
                      linkUrl={message.linkUrl}
                    />
                  ) : (
                    <>
                      <MessageMedia message={message} />
                      {message.body ? <p>{message.body}</p> : null}
                    </>
                  )}
                  <MessageReactions
                    reactions={message.reactions}
                    myEmojis={myEmojis}
                    disabled={ended}
                    onToggle={(emoji) => onReact(message.id, emoji)}
                  />
                  {showTimes ? <time>{message.at}</time> : null}
                </article>
                <MessageActionBar
                  align={mine ? "end" : "start"}
                  disabled={ended}
                  onReply={() => onReplyTo(message)}
                  onReact={(emoji) => onReact(message.id, emoji)}
                />
              </div>
            );
          })
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
                  <p className="pending-artifact-copy">
                    {pendingArtifact.url}
                  </p>
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

      {!ended ? (
        <div className="composer-shortcuts" aria-label="Quick actions">
          <div className="composer-shortcut-row">
            <button
              type="button"
              className="composer-chip"
              onClick={() => onOpenTool("assist")}
            >
              Assist
            </button>
            <button
              type="button"
              className="composer-chip"
              onClick={() => onOpenTool("artifacts")}
            >
              Artifacts
            </button>
            <button
              type="button"
              className="composer-chip"
              onClick={() => onOpenTool("receipts")}
            >
              Receipt
            </button>

            {hoursLabel || responseNote.trim() ? (
              <button
                type="button"
                className="composer-chip is-insert"
                onClick={insertHours}
                title="Insert hours into message"
              >
                Hours
              </button>
            ) : null}

            {shoutouts.map((banner) => (
              <button
                key={banner.id}
                type="button"
                className="composer-chip is-insert"
                onClick={() => insertText(banner.text.trim())}
                title={banner.text.trim()}
              >
                {banner.label?.trim() ||
                  banner.text.trim().slice(0, 22) +
                    (banner.text.trim().length > 22 ? "…" : "")}
              </button>
            ))}

            {quickArtifacts.map((item) => (
              <button
                key={item.id}
                type="button"
                className="composer-chip is-artifact"
                onClick={() => onStageArtifact(item)}
                title={`Load ${item.title || item.kind} into chat`}
              >
                {item.title?.trim() || item.kind}
              </button>
            ))}
          </div>
        </div>
      ) : null}

      {ended ? (
        <footer className="composer composer-ended" role="status">
          <p>Chat ended</p>
        </footer>
      ) : (
        <>
          {replyTo ? (
            <div className="composer-reply" role="status">
              <div className="composer-reply-body">
                <span className="composer-reply-label">
                  Replying to{" "}
                  {replyTo.fromName ||
                    (replyTo.from === "client" ? client.name : "shop")}
                </span>
                <span className="composer-reply-text">{replyTo.preview}</span>
              </div>
              <button
                type="button"
                className="btn-text icon-btn"
                onClick={onClearReply}
                aria-label="Cancel reply"
                title="Cancel reply"
              >
                <IconX size={14} />
              </button>
            </div>
          ) : null}
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
              <IconPaperclip />
            </label>
            <label className="composer-field">
              <span className="sr-only">Message</span>
              <ComposerTextarea
                value={draft ?? ""}
                onChange={onDraftChange}
                onSubmit={onSend}
                placeholder={replyTo ? "Write a reply…" : "Message…"}
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
        </>
      )}
    </div>
  );
}
