"use client";

import Link from "next/link";
import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
} from "react";
import type { Client, Message, MessageReplyRef } from "@/lib/types";
import { rememberChat, rememberChatEmail } from "@/lib/chatMemory";
import {
  buildReplyRef,
  reactorKey,
  toggleMessageReaction,
} from "@/lib/messageSocial";
import {
  clusterClassName,
  messageCluster,
} from "@/lib/messageCluster";
import {
  appendMessage,
  applySpaceOp,
  applySpaceOpToSpace,
  beatPresence,
  ensureSpace,
  formatResponseWindows,
  nextGuestName,
  readMediaFile,
  subscribeSpace,
  toggleReaction,
  messageTimeStamp,
} from "@/lib/store";
import {
  markSendAck,
  markSendPaint,
  markSendStart,
  noteIncomingMessages,
} from "@/lib/chatLatency";
import { MessageMedia } from "@/components/shared/MessageMedia";
import { ReceiptCard } from "@/components/shared/ReceiptCard";
import { ChatBannerView } from "@/components/shared/ChatBannerView";
import { MessageReplyQuote } from "@/components/shared/MessageReplyQuote";
import { MessageReactions } from "@/components/shared/MessageReactions";
import { MessageActionBar } from "@/components/shared/MessageActionBar";
import { ComposerTextarea } from "@/components/shared/ComposerTextarea";
import {
  IconArrowSend,
  IconClock,
  IconPaperclip,
  IconX,
} from "@/components/shared/Icons";

interface ClientChatProps {
  slug: string;
  chatId: string;
  /** Compact layout for storefront iframe widget */
  embedded?: boolean;
}

function isGuestName(name: string) {
  return /^Guest(\s+\d+)?$/i.test(name.trim());
}

export function ClientChat({ slug, chatId, embedded = false }: ClientChatProps) {
  const [space, setSpace] = useState<Awaited<
    ReturnType<typeof ensureSpace>
  > | null>(null);
  const [displayName, setDisplayName] = useState("");
  const [draft, setDraft] = useState("");
  const [replyTo, setReplyTo] = useState<MessageReplyRef | null>(null);
  const [emailDraft, setEmailDraft] = useState("");
  const [emailSaved, setEmailSaved] = useState(false);
  const [recordingSaved, setRecordingSaved] = useState(false);
  const [continueEditing, setContinueEditing] = useState(false);
  const [continueOpen, setContinueOpen] = useState(true);
  const [ready, setReady] = useState(false);
  const [attaching, setAttaching] = useState(false);
  const [showTimes, setShowTimes] = useState(false);
  const [pendingIds, setPendingIds] = useState<Set<string>>(() => new Set());
  const [failedIds, setFailedIds] = useState<Set<string>>(() => new Set());
  const localSentIds = useRef<Set<string>>(new Set());
  const scrollRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    let cancelled = false;

    async function boot() {
      const loaded = await ensureSpace(slug);
      if (cancelled) return;

      // Don't create a floor inbox row on open — only after they message.
      const client = loaded.clients.find((c) => c.id === chatId);
      setSpace(loaded);
      rememberChat(slug, chatId);
      if (client && !isGuestName(client.name)) setDisplayName(client.name);
      if (client?.email) {
        setEmailDraft(client.email);
        setEmailSaved(true);
        if (
          client.note?.toLowerCase().includes("recording") ||
          loaded.messages.some(
            (m) =>
              m.clientId === chatId &&
              m.from === "client" &&
              m.body.startsWith("Recording email:"),
          )
        ) {
          setRecordingSaved(true);
        }
      }
      setReady(true);
    }

    void boot();
    const unsubscribe = subscribeSpace(slug, (next) => {
      if (!next) return;
      noteIncomingMessages(next.messages, localSentIds.current);
      setSpace(next);
    });

    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, [slug, chatId]);

  const client = space?.clients.find((c) => c.id === chatId);

  const thread = useMemo(() => {
    if (!space) return [];
    return space.messages.filter((m) => m.clientId === chatId);
  }, [space, chatId]);

  const lastMessageId = thread[thread.length - 1]?.id;

  function jumpToBottom() {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }

  function scheduleJumpToBottom() {
    jumpToBottom();
    requestAnimationFrame(() => {
      jumpToBottom();
      requestAnimationFrame(jumpToBottom);
    });
  }

  // New messages (including staff replies) + reply composer chrome → stay pinned
  useLayoutEffect(() => {
    scheduleJumpToBottom();
  }, [thread.length, lastMessageId, replyTo]);

  // Tell the floor when this customer tab is open / interacting.
  useEffect(() => {
    let cancelled = false;
    let timer: number | undefined;

    async function beat() {
      if (cancelled || document.visibilityState !== "visible") return;
      try {
        await beatPresence(slug, chatId);
      } catch {
        // ignore transient presence failures
      }
    }

    function schedule() {
      void beat();
      window.clearInterval(timer);
      timer = window.setInterval(() => void beat(), 15_000);
    }

    function onVisibility() {
      if (document.visibilityState === "visible") schedule();
      else window.clearInterval(timer);
    }

    schedule();
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("focus", schedule);

    return () => {
      cancelled = true;
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("focus", schedule);
    };
  }, [slug, chatId]);

  const guestLabel = client?.name ?? "Guest";

  async function send(e: FormEvent) {
    e.preventDefault();
    if (!draft.trim()) return;
    if (client?.chatEndedAt) return;
    if (!space) return;

    const body = draft.trim();
    const name = displayName.trim();
    const presentAt = new Date().toISOString();
    const reply = replyTo;

    const existing = space.clients.find((c) => c.id === chatId);
    const nextClient: Client = existing
      ? {
          ...existing,
          name: name || existing.name,
          status: existing.status === "client" ? "client" : "unknown",
          preview: body,
          lastActive: "Just now",
          unread: existing.unread + 1,
          presentAt,
        }
      : {
          id: chatId,
          name: name || nextGuestName(space.clients),
          status: "unknown",
          channel: "web",
          preview: body,
          unread: 1,
          trade: space.business.trade,
          lastActive: "Just now",
          note: "Unique chat link",
          presentAt,
        };

    const message: Message = {
      id: `m-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      clientId: chatId,
      from: "client",
      kind: "text",
      body,
      ...(reply ? { replyTo: reply } : {}),
      ...messageTimeStamp(),
    };

    localSentIds.current.add(message.id);
    markSendStart(message.id);
    setPendingIds((prev) => new Set(prev).add(message.id));
    setFailedIds((prev) => {
      const next = new Set(prev);
      next.delete(message.id);
      return next;
    });
    setSpace({
      ...space,
      deletedClientIds: (space.deletedClientIds ?? []).filter(
        (id) => id !== chatId,
      ),
      clients: existing
        ? [nextClient, ...space.clients.filter((c) => c.id !== chatId)]
        : [nextClient, ...space.clients],
      messages: [...space.messages, message],
    });
    setDraft("");
    setReplyTo(null);
    scheduleJumpToBottom();
    queueMicrotask(() => markSendPaint(message.id));

    try {
      await appendMessage(slug, {
        message,
        client: nextClient,
        upsertClient: true,
        clearDeleted: true,
        bumpClient: true,
      });
      markSendAck(message.id);
      setPendingIds((prev) => {
        const next = new Set(prev);
        next.delete(message.id);
        return next;
      });
    } catch (err) {
      console.warn("Send failed:", err);
      setPendingIds((prev) => {
        const next = new Set(prev);
        next.delete(message.id);
        return next;
      });
      setFailedIds((prev) => new Set(prev).add(message.id));
    }
  }

  function reactToMessage(messageId: string, emoji: string) {
    if (client?.chatEndedAt || !space) return;
    const actor = { from: "client" as const };
    const prev = space.messages.find((m) => m.id === messageId)?.reactions;
    const nextReactions = toggleMessageReaction(prev, emoji, actor);
    setSpace({
      ...space,
      messages: space.messages.map((m) =>
        m.id === messageId ? { ...m, reactions: nextReactions } : m,
      ),
    });
    void toggleReaction(slug, { messageId, emoji, actor }).catch((err) => {
      console.warn("Reaction failed:", err);
      setSpace((current) => {
        if (!current) return current;
        return {
          ...current,
          messages: current.messages.map((m) =>
            m.id === messageId ? { ...m, reactions: prev } : m,
          ),
        };
      });
    });
  }

  async function sendImage(file: File) {
    if (client?.chatEndedAt || !space) return;
    setAttaching(true);
    try {
      const media = await readMediaFile(file);
      if (media.kind !== "photo") {
        throw new Error("Pick an image file.");
      }

      const caption = draft.trim();
      const name = displayName.trim();
      const presentAt = new Date().toISOString();
      const reply = replyTo;
      const existing = space.clients.find((c) => c.id === chatId);
      const preview = caption || "Photo";
      const nextClient: Client = existing
        ? {
            ...existing,
            name: name || existing.name,
            status: existing.status === "client" ? "client" : "unknown",
            preview,
            lastActive: "Just now",
            unread: existing.unread + 1,
            presentAt,
          }
        : {
            id: chatId,
            name: name || nextGuestName(space.clients),
            status: "unknown",
            channel: "web",
            preview,
            unread: 1,
            trade: space.business.trade,
            lastActive: "Just now",
            note: "Unique chat link",
            presentAt,
          };

      const message: Message = {
        id: `m-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        clientId: chatId,
        from: "client",
        kind: "image",
        body: caption,
        imageUrl: media.url,
        ...(reply ? { replyTo: reply } : {}),
        ...messageTimeStamp(),
      };

      setSpace({
        ...space,
        deletedClientIds: (space.deletedClientIds ?? []).filter(
          (id) => id !== chatId,
        ),
        clients: existing
          ? [nextClient, ...space.clients.filter((c) => c.id !== chatId)]
          : [nextClient, ...space.clients],
        messages: [...space.messages, message],
      });
      setDraft("");
      setReplyTo(null);
      scheduleJumpToBottom();
      await appendMessage(slug, {
        message,
        client: nextClient,
        upsertClient: true,
        clearDeleted: true,
        bumpClient: true,
      });
    } catch (err) {
      console.warn("Photo send failed:", err);
    } finally {
      setAttaching(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  async function requestLive() {
    if (!space) return;
    const existing = space.clients.find((c) => c.id === chatId);
    const body = "Looking for a live response";
    const message: Message = {
      id: `m-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      clientId: chatId,
      from: "client",
      kind: "text",
      body,
      ...messageTimeStamp(),
    };
    const nextClient: Client = existing
      ? {
          ...existing,
          preview: body,
          lastActive: "Just now",
          unread: existing.unread + 1,
          note: existing.note?.includes("Live") ? existing.note : "Live request",
        }
      : {
          id: chatId,
          name: displayName.trim() || nextGuestName(space.clients),
          status: "unknown",
          channel: "web",
          preview: body,
          unread: 1,
          trade: space.business.trade,
          lastActive: "Just now",
          note: "Live request",
        };
    setSpace({
      ...space,
      deletedClientIds: (space.deletedClientIds ?? []).filter((id) => id !== chatId),
      clients: existing
        ? space.clients.map((c) => (c.id === chatId ? nextClient : c))
        : [nextClient, ...space.clients],
      messages: [...space.messages, message],
    });
    void appendMessage(slug, {
      message,
      client: nextClient,
      upsertClient: true,
      clearDeleted: true,
      bumpClient: true,
    }).catch((err) => console.warn("Live request failed:", err));
  }

  async function saveEmail(e: FormEvent) {
    e.preventDefault();
    const email = emailDraft.trim();
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || !space) return;

    const existing = space.clients.find((c) => c.id === chatId);
    const body = `Email for reply: ${email}`;
    const alreadyNoted = space.messages.some(
      (m) =>
        m.clientId === chatId &&
        m.from === "client" &&
        m.body.startsWith("Email for reply:"),
    );
    const noteBase = existing?.note?.includes("Email")
      ? existing.note
      : [existing?.note, "Left email"].filter(Boolean).join(" · ");
    const nextClient: Client = existing
      ? {
          ...existing,
          email,
          note: noteBase || "Left email",
          preview: body,
          lastActive: "Just now",
          unread: alreadyNoted ? existing.unread : existing.unread + 1,
        }
      : {
          id: chatId,
          name: displayName.trim() || nextGuestName(space.clients),
          status: "unknown",
          channel: "web",
          preview: body,
          unread: 1,
          trade: space.business.trade,
          lastActive: "Just now",
          note: "Left email",
          email,
        };

    const message: Message = {
      id: `m-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      clientId: chatId,
      from: "client",
      kind: "text",
      body,
      ...messageTimeStamp(),
    };
    setSpace({
      ...space,
      deletedClientIds: (space.deletedClientIds ?? []).filter((id) => id !== chatId),
      clients: existing
        ? space.clients.map((c) => (c.id === chatId ? nextClient : c))
        : [nextClient, ...space.clients],
      messages: alreadyNoted ? space.messages : [...space.messages, message],
    });
    setEmailSaved(true);
    setContinueEditing(false);
    rememberChat(slug, chatId);
    rememberChatEmail(slug, email);
    if (alreadyNoted) {
      void applySpaceOp(slug, {
        type: "upsertClient",
        client: nextClient,
        clearDeleted: true,
      }).catch((err) => console.warn("Email save failed:", err));
    } else {
      void appendMessage(slug, {
        message,
        client: nextClient,
        upsertClient: true,
        clearDeleted: true,
        bumpClient: true,
      }).catch((err) => console.warn("Email save failed:", err));
    }
  }

  async function saveContinueEmail(e?: FormEvent | { preventDefault?: () => void }) {
    e?.preventDefault?.();
    const email = emailDraft.trim();
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || !space) return;

    const existing = space.clients.find((c) => c.id === chatId);
    const noteBase = existing?.note?.toLowerCase().includes("continue")
      ? existing.note
      : [existing?.note, "Continue chat"].filter(Boolean).join(" · ");
    const nextClient: Client = existing
      ? {
          ...existing,
          email,
          note: noteBase || "Continue chat",
          lastActive: "Just now",
        }
      : {
          id: chatId,
          name: displayName.trim() || nextGuestName(space.clients),
          status: "unknown",
          channel: "web",
          preview: "Saved email to continue chat",
          unread: 0,
          trade: space.business.trade,
          lastActive: "Just now",
          note: "Continue chat",
          email,
        };
    const op = {
      type: "upsertClient" as const,
      client: nextClient,
      clearDeleted: true,
    };
    setSpace(applySpaceOpToSpace(space, op));
    setEmailSaved(true);
    setContinueEditing(false);
    rememberChat(slug, chatId);
    rememberChatEmail(slug, email);
    void applySpaceOp(slug, op).catch((err) =>
      console.warn("Email save failed:", err),
    );
  }

  async function saveRecordingEmail(e: FormEvent) {
    e.preventDefault();
    const email = emailDraft.trim();
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || !space) return;

    const existing = space.clients.find((c) => c.id === chatId);
    const body = `Recording email: ${email}`;
    const alreadyNoted = space.messages.some(
      (m) =>
        m.clientId === chatId &&
        m.from === "client" &&
        m.body.startsWith("Recording email:"),
    );
    const noteBase = existing?.note?.toLowerCase().includes("recording")
      ? existing.note
      : [existing?.note, "Wants recording"].filter(Boolean).join(" · ");
    const nextClient: Client = existing
      ? {
          ...existing,
          email,
          note: noteBase || "Wants recording",
          preview: body,
          lastActive: "Just now",
          unread: alreadyNoted ? existing.unread : existing.unread + 1,
        }
      : {
          id: chatId,
          name: displayName.trim() || nextGuestName(space.clients),
          status: "unknown",
          channel: "web",
          preview: body,
          unread: 1,
          trade: space.business.trade,
          lastActive: "Just now",
          note: "Wants recording",
          email,
          chatEndedAt: new Date().toISOString(),
        };
    const message: Message = {
      id: `m-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      clientId: chatId,
      from: "client",
      kind: "text",
      body,
      ...messageTimeStamp(),
    };
    setSpace({
      ...space,
      deletedClientIds: (space.deletedClientIds ?? []).filter((id) => id !== chatId),
      clients: existing
        ? space.clients.map((c) => (c.id === chatId ? nextClient : c))
        : [nextClient, ...space.clients],
      messages: alreadyNoted ? space.messages : [...space.messages, message],
    });
    setRecordingSaved(true);
    setEmailSaved(true);
    rememberChat(slug, chatId);
    rememberChatEmail(slug, email);
    if (alreadyNoted) {
      void applySpaceOp(slug, {
        type: "upsertClient",
        client: nextClient,
        clearDeleted: true,
      }).catch((err) => console.warn("Email save failed:", err));
    } else {
      void appendMessage(slug, {
        message,
        client: nextClient,
        upsertClient: true,
        clearDeleted: true,
        bumpClient: true,
      }).catch((err) => console.warn("Email save failed:", err));
    }
  }

  if (!ready) {
    return <div className="client-chat-loading">Loading…</div>;
  }

  if (!space) {
    return (
      <div className="client-missing">
        <p className="brand-name">OTGF</p>
        <h1>Nothing here</h1>
        <p>This chat link isn&apos;t set up yet.</p>
        {!embedded ? <Link href="/">Create a space</Link> : null}
      </div>
    );
  }

  const settings = space.settings;
  const banners = settings.banners.filter((b) => b.enabled && b.text.trim());
  const hoursLabel = formatResponseWindows(settings.windows);
  const chatEnded = Boolean(client?.chatEndedAt);
  const isAway = !settings.live && !chatEnded;
  const awayCopy =
    settings.awayMessage?.trim() ||
    "We're not available right now. Leave your email and we'll reply to your question.";
  const recordingCopy =
    "If you would like a recording of this, please enter your email and one will be emailed to you.";
  const savedEmail = client?.email ?? (emailSaved || recordingSaved ? emailDraft.trim() : "");
  const members = space.members ?? [];
  const soleMember = members.length === 1 ? members[0] : undefined;
  const chatOwner = client?.ownerMemberId
    ? members.find((m) => m.id === client.ownerMemberId)
    : soleMember;
  const latestStaff = [...thread]
    .reverse()
    .find((m) => m.from === "business" && (m.fromName || m.fromMemberId));
  const chattingWith =
    (latestStaff?.fromName?.trim() ||
      (latestStaff?.fromMemberId
        ? members.find((m) => m.id === latestStaff.fromMemberId)?.name
        : undefined) ||
      chatOwner?.name ||
      "") || "";

  const head = (
    <header className="client-chat-head">
      <div className="client-chat-head-main">
        <div className="client-chat-title-row">
          {settings.logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={settings.logoUrl}
              alt=""
              className="client-brand-logo"
            />
          ) : null}
          <h1>{space.business.name}</h1>
        </div>
        {chattingWith || hoursLabel || settings.responseNote ? (
          <p className="client-chat-sub">
            {chattingWith ? (
              <>
                With <strong>{chattingWith}</strong>
              </>
            ) : null}
            {chattingWith && (hoursLabel || settings.responseNote)
              ? " · "
              : null}
            {hoursLabel || null}
            {settings.responseNote
              ? `${hoursLabel ? " · " : ""}${settings.responseNote}`
              : null}
          </p>
        ) : null}
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
        {settings.live ? (
          <button
            type="button"
            className="client-live-btn is-live"
            onClick={() => void requestLive()}
          >
            <span className="floor-live-dot" aria-hidden />
            Live
          </button>
        ) : (
          <span className="client-away-badge">Away</span>
        )}
      </div>
    </header>
  );

  return (
    <div className={`client-chat${embedded ? " is-embedded" : ""}`}>
      <div
        className={`client-chat-top ${settings.brandBannerUrl ? "has-brand-banner" : ""}`}
      >
        {settings.brandBannerUrl ? (
          <div className="client-brand-hero">
            <div className="client-brand-banner" aria-hidden>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={settings.brandBannerUrl} alt="" />
            </div>
            {head}
          </div>
        ) : (
          head
        )}

        {chatEnded ? (
          <div className="client-away-panel client-ended-panel" role="status">
            <p className="client-away-copy">{recordingCopy}</p>
            {recordingSaved && savedEmail ? (
              <p className="client-away-saved">
                Got it — we&apos;ll email a recording to{" "}
                <strong>{savedEmail}</strong>
                <button
                  type="button"
                  className="client-away-edit"
                  onClick={() => setRecordingSaved(false)}
                >
                  Change
                </button>
              </p>
            ) : (
              <form
                className="client-away-form"
                onSubmit={(e) => void saveRecordingEmail(e)}
              >
                <label className="composer-field">
                  <span className="sr-only">Email</span>
                  <input
                    type="email"
                    value={emailDraft ?? ""}
                    onChange={(e) => setEmailDraft(e.target.value)}
                    placeholder="you@email.com"
                    required
                    autoComplete="email"
                  />
                </label>
                <button type="submit" className="btn-solid client-away-submit">
                  Email recording
                </button>
              </form>
            )}
          </div>
        ) : isAway ? (
          <div className="client-away-panel" role="status">
            <p className="client-away-copy">{awayCopy}</p>
            {savedEmail ? (
              <p className="client-away-saved">
                Got it — we&apos;ll reply to <strong>{savedEmail}</strong>
                <button
                  type="button"
                  className="client-away-edit"
                  onClick={() => setEmailSaved(false)}
                >
                  Change
                </button>
              </p>
            ) : (
              <form
                className="client-away-form"
                onSubmit={(e) => void saveEmail(e)}
              >
                <label className="composer-field">
                  <span className="sr-only">Email</span>
                  <input
                    type="email"
                    value={emailDraft ?? ""}
                    onChange={(e) => setEmailDraft(e.target.value)}
                    placeholder="you@email.com"
                    required
                    autoComplete="email"
                  />
                </label>
                <button type="submit" className="btn-solid client-away-submit">
                  Leave email
                </button>
              </form>
            )}
          </div>
        ) : null}

        {banners.length > 0 ? (
          <div className="client-chat-banners">
            {banners.map((banner) => (
              <ChatBannerView key={banner.id} banner={banner} />
            ))}
          </div>
        ) : null}
      </div>

      <div
        ref={scrollRef}
        className="client-chat-stream"
        role="log"
        aria-live="polite"
      >
        {thread.length === 0 ? (
          <div className="client-chat-empty">
            <p>Send a message to get started.</p>
          </div>
        ) : (
          thread.map((message, index) => {
            const fromCustomer = message.from === "client";
            const { role, continued } = messageCluster(thread, index);
            const staffName =
              !fromCustomer
                ? message.fromName?.trim() ||
                  (message.fromMemberId
                    ? members.find((m) => m.id === message.fromMemberId)?.name
                    : undefined) ||
                  chatOwner?.name ||
                  ""
                : "";
            const myEmojis = new Set(
              (message.reactions ?? [])
                .filter((r) => reactorKey(r) === "client")
                .map((r) => r.emoji),
            );
            const mediaOnly =
              (message.kind === "image" || message.kind === "video") &&
              !message.body?.trim();
            const showSpeaker = Boolean(staffName) && !continued;
            return (
              <div
                key={message.id}
                className={`msg-wrap ${fromCustomer ? "is-mine" : "is-theirs"} ${clusterClassName(role, continued)}`}
                data-message-id={message.id}
              >
                <article
                  className={`bubble bubble-${fromCustomer ? "business" : "client"} bubble-${message.kind}${mediaOnly ? " is-media-only" : ""}${pendingIds.has(message.id) ? " is-pending" : ""}${failedIds.has(message.id) ? " is-failed" : ""}`}
                >
                  {showSpeaker ? (
                    <span className="bubble-speaker">{staffName}</span>
                  ) : null}
                  {message.replyTo ? (
                    <MessageReplyQuote
                      reply={message.replyTo}
                      onJump={(id) => {
                        const el = document.querySelector(
                          `[data-message-id="${CSS.escape(id)}"]`,
                        );
                        if (el instanceof HTMLElement) {
                          el.scrollIntoView({
                            behavior: "smooth",
                            block: "center",
                          });
                          el.classList.add("is-flash");
                          window.setTimeout(
                            () => el.classList.remove("is-flash"),
                            1200,
                          );
                        }
                      }}
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
                    disabled={chatEnded}
                    onToggle={(emoji) => void reactToMessage(message.id, emoji)}
                  />
                  {showTimes ? <time>{message.at}</time> : null}
                </article>
                <MessageActionBar
                  align={fromCustomer ? "end" : "start"}
                  disabled={chatEnded}
                  onReply={() => setReplyTo(buildReplyRef(message))}
                  onReact={(emoji) => void reactToMessage(message.id, emoji)}
                />
              </div>
            );
          })
        )}
      </div>

      <div className="client-chat-footer">
        {!chatEnded && !isAway ? (
          <div className="client-continue">
            {!continueOpen ? (
              <button
                type="button"
                className="client-continue-chip"
                onClick={() => {
                  setContinueOpen(true);
                  if (savedEmail) setContinueEditing(false);
                }}
              >
                {savedEmail ? "Chat email" : "Keep this chat"}
              </button>
            ) : savedEmail && !continueEditing ? (
              <p className="client-continue-saved">
                <span>
                  You can return to this chat with{" "}
                  <strong>{savedEmail}</strong>
                </span>
                <span className="client-continue-saved-actions">
                  <button
                    type="button"
                    className="client-continue-edit"
                    onClick={() => setContinueEditing(true)}
                  >
                    Change
                  </button>
                  <button
                    type="button"
                    className="client-continue-dismiss"
                    aria-label="Hide"
                    title="Hide"
                    onClick={() => setContinueOpen(false)}
                  >
                    <IconX size={14} />
                  </button>
                </span>
              </p>
            ) : (
              <div className="client-continue-card">
                <button
                  type="button"
                  className="client-continue-dismiss is-card"
                  aria-label="Close"
                  title="Close"
                  onClick={() => {
                    setContinueOpen(false);
                    setContinueEditing(false);
                  }}
                >
                  <IconX size={14} />
                </button>
                <div className="client-continue-copy">
                  <p className="client-continue-title">Keep this chat</p>
                  <p className="client-continue-hint">
                    Add your email to continue this conversation later or save
                    this conversation
                  </p>
                </div>
                <div className="client-continue-form">
                  <label className="client-continue-field">
                    <span className="sr-only">Email</span>
                    <input
                      type="email"
                      value={emailDraft ?? ""}
                      onChange={(e) => setEmailDraft(e.target.value)}
                      placeholder="you@email.com"
                      autoComplete="email"
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.preventDefault();
                          void saveContinueEmail();
                        }
                      }}
                    />
                  </label>
                  <button
                    type="button"
                    className="client-continue-submit"
                    disabled={
                      !emailDraft.trim() ||
                      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailDraft.trim())
                    }
                    onClick={() => void saveContinueEmail()}
                  >
                    Save
                  </button>
                  {continueEditing ? (
                    <button
                      type="button"
                      className="client-continue-cancel"
                      onClick={() => setContinueEditing(false)}
                    >
                      Cancel
                    </button>
                  ) : null}
                </div>
              </div>
            )}
          </div>
        ) : null}

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
            {thread.length === 0 ? (
              <label className="client-name-field">
                <span className="sr-only">Your name</span>
                <input
                  value={displayName ?? ""}
                  onChange={(e) => setDisplayName(e.target.value)}
                  placeholder={`Your name (optional · ${guestLabel})`}
                />
              </label>
            ) : null}
            {replyTo ? (
              <div className="composer-reply" role="status">
                <div className="composer-reply-body">
                  <span className="composer-reply-label">
                    Replying to{" "}
                    {replyTo.fromName ||
                      (replyTo.from === "business"
                        ? space?.business.name || "shop"
                        : "you")}
                  </span>
                  <span className="composer-reply-text">{replyTo.preview}</span>
                </div>
                <button
                  type="button"
                  className="btn-text icon-btn"
                  onClick={() => setReplyTo(null)}
                  aria-label="Cancel reply"
                  title="Cancel reply"
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
                id="client-attach-image"
                onChange={(e) => {
                  const file = e.target.files?.[0] ?? null;
                  if (file) void sendImage(file);
                }}
              />
              <label
                htmlFor="client-attach-image"
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
