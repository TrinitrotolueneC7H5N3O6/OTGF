"use client";

import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
} from "react";
import type {
  BusinessSpace,
  ChatParticipant,
  Client,
  Message,
  MessageReplyRef,
} from "@/lib/types";
import {
  buildReplyRef,
  reactorKey,
  toggleMessageReaction,
} from "@/lib/messageSocial";
import { clusterClassName, messageCluster } from "@/lib/messageCluster";
import {
  appendMessage,
  getSpace,
  subscribeSpace,
  toggleReaction,
  messageTimeStamp,
  readMediaFile,
} from "@/lib/store";
import { participantLabel } from "@/lib/forwardChat";
import { MessageMedia } from "@/components/shared/MessageMedia";
import { ReceiptCard } from "@/components/shared/ReceiptCard";
import { MessageReplyQuote } from "@/components/shared/MessageReplyQuote";
import { MessageReactions } from "@/components/shared/MessageReactions";
import { MessageActionBar } from "@/components/shared/MessageActionBar";
import { MessageBodyText } from "@/components/shared/MessageBodyText";
import { ComposerTextarea } from "@/components/shared/ComposerTextarea";
import { ScrollToBottomButton } from "@/components/shared/ScrollToBottomButton";
import { ChatSystemLine } from "@/components/shared/ChatSystemLine";
import {
  IconArrowSend,
  IconClock,
  IconPaperclip,
  IconX,
} from "@/components/shared/Icons";

interface ForwardChatProps {
  slug: string;
  chatId: string;
  participant: ChatParticipant;
}

export function ForwardChat({ slug, chatId, participant }: ForwardChatProps) {
  const [space, setSpace] = useState<BusinessSpace | null>(null);
  const [ready, setReady] = useState(false);
  const [draft, setDraft] = useState("");
  const [replyTo, setReplyTo] = useState<MessageReplyRef | null>(null);
  const [showTimes, setShowTimes] = useState(false);
  const [attaching, setAttaching] = useState(false);
  const [actionsFor, setActionsFor] = useState<string | null>(null);
  const [pendingIds, setPendingIds] = useState<Set<string>>(() => new Set());
  const scrollRef = useRef<HTMLDivElement>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let cancelled = false;
    let unsubscribe = () => {};
    async function boot() {
      try {
        const loaded = await getSpace(slug, chatId, { threadOnly: true });
        if (cancelled) return;
        setSpace(loaded);
        setReady(true);
        if (!loaded) return;
        unsubscribe = subscribeSpace(
          slug,
          (next) => {
            if (next) setSpace(next);
          },
          {
            getChatId: () => chatId,
            initialSpace: loaded,
            threadOnly: true,
          },
        );
      } catch {
        if (!cancelled) setReady(true);
      }
    }
    void boot();
    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, [slug, chatId]);

  const client = space?.clients.find((c) => c.id === chatId);
  const thread = useMemo(
    () => (space?.messages ?? []).filter((m) => m.clientId === chatId),
    [space?.messages, chatId],
  );
  const chatEnded = Boolean(client?.chatEndedAt);

  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [thread.length]);

  async function send(e: FormEvent) {
    e.preventDefault();
    if (!draft.trim() || !space || !client || chatEnded) return;
    const body = draft.trim();
    await postMessage(space, client, {
      kind: "text",
      body,
    });
    setDraft("");
    setReplyTo(null);
  }

  async function sendImage(file: File) {
    if (!space || !client || chatEnded) return;
    setAttaching(true);
    try {
      const media = await readMediaFile(file);
      if (media.kind !== "photo") throw new Error("Pick an image file.");
      await postMessage(space, client, {
        kind: "image",
        body: draft.trim(),
        imageUrl: media.url,
      });
      setDraft("");
      setReplyTo(null);
    } catch (err) {
      console.warn("Image send failed:", err);
    } finally {
      setAttaching(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  async function postMessage(
    current: BusinessSpace,
    currentClient: Client,
    partial: Pick<Message, "kind" | "body"> & { imageUrl?: string },
  ) {
    const message: Message = {
      id: `m-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      clientId: chatId,
      from: "business",
      kind: partial.kind,
      body: partial.body,
      ...(partial.imageUrl ? { imageUrl: partial.imageUrl } : {}),
      fromName: participant.name,
      fromMemberId: participant.id,
      ...(replyTo ? { replyTo } : {}),
      ...messageTimeStamp(),
    };
    const nextClient: Client = {
      ...currentClient,
      preview: partial.body || (partial.kind === "image" ? "Photo" : "Message"),
      lastActive: "Just now",
      unread: 0,
    };
    setSpace({
      ...current,
      clients: current.clients.map((c) =>
        c.id === chatId ? nextClient : c,
      ),
      messages: [...current.messages, message],
    });
    setPendingIds((prev) => new Set(prev).add(message.id));
    try {
      await appendMessage(slug, {
        message,
        client: nextClient,
        upsertClient: true,
        bumpClient: true,
      });
    } catch (err) {
      console.warn("Send failed:", err);
    } finally {
      setPendingIds((prev) => {
        const next = new Set(prev);
        next.delete(message.id);
        return next;
      });
    }
  }

  function reactToMessage(messageId: string, emoji: string) {
    if (chatEnded || !space) return;
    const actor = {
      from: "business" as const,
      fromMemberId: participant.id,
      fromName: participant.name,
    };
    const prev = space.messages.find((m) => m.id === messageId)?.reactions;
    const nextReactions = toggleMessageReaction(prev, emoji, actor);
    setSpace({
      ...space,
      messages: space.messages.map((m) =>
        m.id === messageId ? { ...m, reactions: nextReactions } : m,
      ),
    });
    void toggleReaction(slug, { messageId, emoji, actor }).catch(() => {
      setSpace((cur) =>
        cur
          ? {
              ...cur,
              messages: cur.messages.map((m) =>
                m.id === messageId ? { ...m, reactions: prev } : m,
              ),
            }
          : cur,
      );
    });
  }

  if (!ready) {
    return <div className="client-chat-loading">Loading…</div>;
  }
  if (!space || !client) {
    return (
      <div className="client-missing">
        <h1>Chat unavailable</h1>
        <p>This conversation is no longer open.</p>
      </div>
    );
  }

  return (
    <div className="client-chat">
      <header className="client-chat-head">
        <div className="client-chat-head-main">
          <div className="client-chat-title-row">
            <h1>{space.business.name}</h1>
          </div>
          <p className="client-chat-sub">
            With <strong>{client.name}</strong>
            {" · "}
            You joined as <strong>{participantLabel(participant)}</strong>
          </p>
        </div>
        <div className="client-chat-head-actions">
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
      </header>

      <div className="chat-stream-shell">
        <div
          ref={scrollRef}
          className="thread-stream client-stream"
          role="log"
          aria-live="polite"
        >
          {thread.map((message, index) => {
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
            const { role, continued } = messageCluster(thread, index);
            const myEmojis = new Set(
              (message.reactions ?? [])
                .filter((r) => reactorKey(r) === `business:${participant.id}`)
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
                  if (chatEnded) return;
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
                  className={`bubble bubble-${message.from} bubble-${message.kind}${mediaOnly ? " is-media-only" : ""}${pendingIds.has(message.id) ? " is-pending" : ""}`}
                >
                  {showSpeaker ? (
                    <span className="bubble-speaker">{message.fromName}</span>
                  ) : null}
                  {message.replyTo ? (
                    <MessageReplyQuote reply={message.replyTo} />
                  ) : null}
                  {message.kind === "receipt" && message.receipt ? (
                    <ReceiptCard
                      receipt={message.receipt}
                      linkUrl={message.linkUrl}
                    />
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
                    disabled={chatEnded}
                    onToggle={(emoji) => void reactToMessage(message.id, emoji)}
                  />
                  {showTimes ? <time>{message.at}</time> : null}
                </article>
                <MessageActionBar
                  align={mine ? "end" : "start"}
                  disabled={chatEnded}
                  onReply={() => setReplyTo(buildReplyRef(message))}
                  onReact={(emoji) => void reactToMessage(message.id, emoji)}
                />
              </div>
            );
          })}
        </div>
        <ScrollToBottomButton containerRef={scrollRef} />
      </div>

      <div className="client-chat-footer">
        {chatEnded ? (
          <div className="client-composer client-composer-ended" role="status">
            <p>Chat ended</p>
          </div>
        ) : (
          <form
            ref={formRef}
            className="client-composer"
            onSubmit={(e) => void send(e)}
          >
            {replyTo ? (
              <div className="composer-reply" role="status">
                <div className="composer-reply-body">
                  <span className="composer-reply-label">Replying</span>
                  <span className="composer-reply-text">{replyTo.preview}</span>
                </div>
                <button
                  type="button"
                  className="btn-text icon-btn"
                  onClick={() => setReplyTo(null)}
                  aria-label="Cancel reply"
                >
                  <IconX size={14} />
                </button>
              </div>
            ) : null}
            <div className="client-composer-row">
              <input
                ref={fileRef}
                type="file"
                accept="image/*"
                className="sr-only"
                id="forward-attach-image"
                onChange={(e) => {
                  const file = e.target.files?.[0] ?? null;
                  if (file) void sendImage(file);
                }}
              />
              <label
                htmlFor="forward-attach-image"
                className={`composer-attach ${attaching ? "is-busy" : ""}`}
                aria-label="Attach image"
              >
                <IconPaperclip />
              </label>
              <label className="composer-field">
                <span className="sr-only">Message</span>
                <ComposerTextarea
                  value={draft}
                  onChange={setDraft}
                  onSubmit={() => formRef.current?.requestSubmit()}
                  placeholder={replyTo ? "Write a reply…" : "Message…"}
                  autoFocus
                />
              </label>
              <button type="submit" className="composer-send" aria-label="Send">
                <IconArrowSend />
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
