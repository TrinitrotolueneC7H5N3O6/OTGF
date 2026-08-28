"use client";

import { useLayoutEffect, useEffect, useMemo, useRef, useState } from "react";
import type {
  Artifact,
  Client,
  ComposerShortcut,
  Message,
  MessageReplyRef,
  ResponseWindow,
} from "@/lib/types";
import { participantLabel } from "@/lib/forwardChat";
import { isClientLive } from "@/lib/presence";
import { formatResponseWindows } from "@/lib/spaceNormalize";
import { actorKey, reactorKey } from "@/lib/messageSocial";
import {
  clusterClassName,
  messageCluster,
} from "@/lib/messageCluster";
import {
  forgetThreadScroll,
  recallThreadScroll,
  saveThreadScroll,
} from "@/lib/threadScroll";
import { MessageMedia } from "@/components/shared/MessageMedia";
import { ReceiptCard } from "@/components/shared/ReceiptCard";
import { MessageReplyQuote } from "@/components/shared/MessageReplyQuote";
import { MessageReactions } from "@/components/shared/MessageReactions";
import { MessageActionBar } from "@/components/shared/MessageActionBar";
import { MessageBodyText } from "@/components/shared/MessageBodyText";
import { ComposerTextarea } from "@/components/shared/ComposerTextarea";
import { ScrollToBottomButton } from "@/components/shared/ScrollToBottomButton";
import { ChatSystemLine } from "@/components/shared/ChatSystemLine";
import { isReconnectMessage } from "@/lib/customerAutoReply";
import { ArtifactThumb } from "./ArtifactThumb";
import { AutoAnswerReview } from "./AutoAnswerReview";
import type { RightTab } from "./RightPane";
import {
  IconArrowSend,
  IconClock,
  IconPaperclip,
  IconPencil,
  IconX,
} from "@/components/shared/Icons";

interface ThreadPaneProps {
  client: Client;
  scrollKey: string;
  messages: Message[];
  draft: string;
  pendingArtifact: Artifact | null;
  scrollToBottomTick: number;
  /** Jump to latest on open (unread / new message while away). */
  openAtBottom?: boolean;
  onOpenAtBottomDone?: () => void;
  floorMemberName?: string;
  floorMemberId?: string;
  artifacts: Artifact[];
  windows: ResponseWindow[];
  responseNote: string;
  shortcuts: ComposerShortcut[];
  replyTo: MessageReplyRef | null;
  onDraftChange: (value: string) => void;
  onSend: () => void;
  onSendImage: (file: File) => Promise<void> | void;
  onConfirmPending: () => void;
  onDismissPending: () => void;
  onEndChat: () => void;
  onCopyForwardLink?: () => void;
  forwardCopied?: boolean;
  onOpenTool: (tab: RightTab) => void;
  onStageArtifact: (item: Artifact) => void;
  onEditShortcuts: () => void;
  onReplyTo: (message: Message) => void;
  onClearReply: () => void;
  onReact: (messageId: string, emoji: string) => void;
  pendingIds?: Set<string>;
  failedIds?: Set<string>;
  enabledTools?: {
    assist?: boolean;
    artifacts?: boolean;
    receipts?: boolean;
    shortcuts?: boolean;
    hours?: boolean;
  };
  autoAnswerSending?: boolean;
  onSendAutoAnswer?: (body: string) => void;
  onSkipAutoAnswer?: () => void;
  onRetryAutoAnswer?: () => void;
  onToggleAutoAnswerPause?: (off: boolean) => void;
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
  openAtBottom = false,
  onOpenAtBottomDone,
  floorMemberName,
  floorMemberId,
  artifacts,
  windows,
  responseNote,
  shortcuts,
  replyTo,
  onDraftChange,
  onSend,
  onSendImage,
  onConfirmPending,
  onDismissPending,
  onEndChat,
  onCopyForwardLink,
  forwardCopied = false,
  onOpenTool,
  onStageArtifact,
  onEditShortcuts,
  onReplyTo,
  onClearReply,
  onReact,
  pendingIds,
  failedIds,
  enabledTools = {
    assist: true,
    artifacts: true,
    receipts: true,
    shortcuts: true,
    hours: true,
  },
  autoAnswerSending,
  onSendAutoAnswer,
  onSkipAutoAnswer,
  onRetryAutoAnswer,
  onToggleAutoAnswerPause,
}: ThreadPaneProps) {
  const [showTimes, setShowTimes] = useState(false);
  const [attaching, setAttaching] = useState(false);
  const [actionsFor, setActionsFor] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const fileRef = useRef<HTMLInputElement>(null);
  const streamRef = useRef<HTMLDivElement>(null);
  const activeKeyRef = useRef<string | null>(null);
  const messageCountRef = useRef(messages.length);
  const lastTickRef = useRef(scrollToBottomTick);
  const pinBottomRef = useRef(false);
  const ended = Boolean(client.chatEndedAt);
  const live = !ended && isClientLive(client, now);

  const hoursLabel = useMemo(
    () => formatResponseWindows(windows),
    [windows],
  );

  const artifactById = useMemo(() => {
    const map = new Map<string, Artifact>();
    for (const item of artifacts) map.set(item.id, item);
    return map;
  }, [artifacts]);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 5_000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    if (!actionsFor) return;
    const openId = actionsFor;
    function onPointerDown(e: PointerEvent) {
      const target = e.target;
      if (!(target instanceof Element)) return;
      if (target.closest(`[data-message-id="${CSS.escape(openId)}"]`)) {
        return;
      }
      setActionsFor(null);
    }
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [actionsFor]);

  useEffect(() => {
    setActionsFor(null);
  }, [scrollKey]);

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
      pinBottomRef.current = openAtBottom;
      if (openAtBottom) {
        forgetThreadScroll(scrollKey);
        scheduleJumpToBottom();
        if (messages.length > 0) {
          pinBottomRef.current = false;
          onOpenAtBottomDone?.();
        }
        return;
      }
      const saved = recallThreadScroll(scrollKey);
      el.scrollTop =
        typeof saved === "number" ? saved : el.scrollHeight;
      return;
    }

    if (pinBottomRef.current || openAtBottom) {
      messageCountRef.current = messages.length;
      scheduleJumpToBottom();
      if (messages.length > 0) {
        pinBottomRef.current = false;
        onOpenAtBottomDone?.();
      }
      return;
    }

    const grew = messages.length > messageCountRef.current;
    messageCountRef.current = messages.length;
    if (grew && nearBottom(el)) {
      scheduleJumpToBottom();
    }
  }, [scrollKey, messages, openAtBottom, onOpenAtBottomDone]);

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
            {(client.participants ?? []).length > 0 ? (
              <p className="thread-note">
                {(client.participants ?? []).map(participantLabel).join(" · ")}{" "}
                in this chat
              </p>
            ) : null}
          </div>
          <div className="thread-head-actions">
            {ended ? (
              <span className="chat-ended-label thread-ended-label">
                Chat ended
              </span>
            ) : (
              <>
                {onCopyForwardLink ? (
                  <button
                    type="button"
                    className="thread-end-chat"
                    onClick={onCopyForwardLink}
                  >
                    {forwardCopied ? "Copied" : "Forward link"}
                  </button>
                ) : null}
                <button
                  type="button"
                  className="thread-end-chat"
                  onClick={onEndChat}
                >
                  End chat
                </button>
              </>
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

      {client.autoAnswerDraft && onSendAutoAnswer && onSkipAutoAnswer ? (
        <AutoAnswerReview
          client={client}
          draft={client.autoAnswerDraft}
          variant="banner"
          sending={autoAnswerSending}
          onSend={onSendAutoAnswer}
          onSkip={onSkipAutoAnswer}
          onRetry={
            client.autoAnswerDraft.status === "failed"
              ? onRetryAutoAnswer
              : undefined
          }
          onTogglePause={onToggleAutoAnswerPause}
        />
      ) : null}

      <div className="chat-stream-shell">
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
            if (message.kind === "system") {
              return (
                <ChatSystemLine
                  key={message.id}
                  body={message.body}
                  at={message.at}
                  showTime={showTimes}
                />
              );
            }
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
            const actionsOpen = actionsFor === message.id;
            return (
              <div
                key={message.id}
                className={`msg-wrap ${mine ? "is-mine" : "is-theirs"} ${clusterClassName(role, continued)}${actionsOpen ? " is-actions-open" : ""}`}
                data-message-id={message.id}
                onClick={(e) => {
                  if (ended) return;
                  const target = e.target;
                  if (!(target instanceof Element)) return;
                  if (target.closest("a, button, input, textarea, select")) {
                    return;
                  }
                  setActionsFor((cur) =>
                    cur === message.id ? null : message.id,
                  );
                }}
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
                  ) : isReconnectMessage(message) ? (
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
                      {message.body &&
                      !(
                        message.kind === "link" &&
                        message.linkUrl &&
                        message.body.trim() === message.linkUrl.trim()
                      ) ? (
                        <MessageBodyText text={message.body} />
                      ) : null}
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
        <ScrollToBottomButton containerRef={streamRef} />
      </div>

      {!ended &&
      (enabledTools.assist ||
        enabledTools.artifacts ||
        enabledTools.receipts ||
        enabledTools.shortcuts) ? (
        <div className="composer-shortcuts" aria-label="Quick actions">
          <div className="composer-shortcut-row">
            {enabledTools.assist ? (
            <button
              type="button"
              className="composer-chip"
              onClick={() => onOpenTool("assist")}
            >
              Assist
            </button>
            ) : null}
            {enabledTools.artifacts ? (
            <button
              type="button"
              className="composer-chip"
              onClick={() => onOpenTool("artifacts")}
            >
              Artifacts
            </button>
            ) : null}
            {enabledTools.receipts ? (
            <button
              type="button"
              className="composer-chip"
              onClick={() => onOpenTool("receipts")}
            >
              Receipt
            </button>
            ) : null}

            {enabledTools.shortcuts
              ? shortcuts.map((sc) => {
              if (sc.kind === "hours") {
                if (!enabledTools.hours) return null;
                if (!hoursLabel && !responseNote.trim()) return null;
                return (
                  <button
                    key={sc.id}
                    type="button"
                    className="composer-chip is-insert"
                    onClick={insertHours}
                    title="Insert hours into message"
                  >
                    Hours
                  </button>
                );
              }
              if (sc.kind === "text") {
                return (
                  <button
                    key={sc.id}
                    type="button"
                    className="composer-chip is-insert"
                    onClick={() => insertText(sc.text)}
                    title={sc.text}
                  >
                    {sc.label}
                  </button>
                );
              }
              if (!enabledTools.artifacts) return null;
              const item = artifactById.get(sc.artifactId);
              if (!item) return null;
              return (
                <button
                  key={sc.id}
                  type="button"
                  className="composer-chip is-artifact"
                  onClick={() => onStageArtifact(item)}
                  title={`Load ${item.title || item.kind} into chat`}
                >
                  {sc.label?.trim() || item.title?.trim() || item.kind}
                </button>
              );
            })
              : null}

            {enabledTools.shortcuts ? (
            <button
              type="button"
              className="composer-chip is-edit"
              onClick={onEditShortcuts}
              title="Edit shortcut bar"
              aria-label="Edit shortcut bar"
            >
              <IconPencil size={12} />
              {shortcuts.length === 0 ? "Add shortcuts" : "Edit"}
            </button>
            ) : null}
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
