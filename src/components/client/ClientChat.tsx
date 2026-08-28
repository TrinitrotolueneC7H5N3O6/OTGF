"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import type { Client, Message, MessageReplyRef } from "@/lib/types";
import { rememberChat } from "@/lib/chatMemory";
import {
  beatPresence,
  formatResponseWindows,
  getSpace,
  nextGuestName,
  patchSpace,
  readMediaFile,
  subscribeSpace,
  toggleReaction,
  messageTimeStamp,
} from "@/lib/store";
import { MessageMedia } from "@/components/shared/MessageMedia";
import { ChatBannerView } from "@/components/shared/ChatBannerView";
import { MessageReactions } from "@/components/shared/MessageReactions";
import { MessageActionBar } from "@/components/shared/MessageActionBar";
import { MessageReplyQuote } from "@/components/shared/MessageReplyQuote";
import {
  buildReplyRef,
  reactorKey,
  toggleMessageReaction,
} from "@/lib/messageSocial";
import { clusterClassName, messageCluster } from "@/lib/messageCluster";
import {
  IconArrowSend,
  IconPaperclip,
  IconX,
} from "@/components/shared/Icons";
import { SwipeTimeStream } from "./SwipeTimeStream";
import { ChatMarketingCarousel } from "./ChatMarketingCarousel";
import {
  appendCustomerMessageWithAutoReply,
  ensureWelcomeMessages,
  isReconnectMessage,
} from "@/lib/customerAutoReply";
import { resolveChatIntroMessages } from "@/lib/chatIntroMessages";

interface ClientChatProps {
  slug: string;
  chatId: string;
  embedded?: boolean;
}

function isGuestName(name: string) {
  return /^Guest(\s+\d+)?$/i.test(name.trim());
}

export function ClientChat({ slug, chatId, embedded = false }: ClientChatProps) {
  const [space, setSpace] = useState<Awaited<
    ReturnType<typeof getSpace>
  > | null>(null);
  const [displayName, setDisplayName] = useState("");
  const [draft, setDraft] = useState("");
  const [emailDraft, setEmailDraft] = useState("");
  const [emailSaved, setEmailSaved] = useState(false);
  const [recordingSaved, setRecordingSaved] = useState(false);
  const [ready, setReady] = useState(false);
  const [attaching, setAttaching] = useState(false);
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const [copiedReturnLink, setCopiedReturnLink] = useState(false);
  const [linkEmailSent, setLinkEmailSent] = useState(false);
  const [replyTo, setReplyTo] = useState<MessageReplyRef | null>(null);
  const [actionsFor, setActionsFor] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let cancelled = false;

    async function boot() {
      const loaded = await getSpace(slug, chatId, { threadOnly: true });
      if (cancelled) return;
      if (!loaded) {
        setReady(true);
        return;
      }

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
    const unsubscribe = subscribeSpace(
      slug,
      (next) => {
        if (!next) return;
        setSpace((prev) => {
          if (!prev) return next;
          // Keep optimistic messages until the server snapshot includes them.
          const ids = new Set(next.messages.map((m) => m.id));
          const extras = prev.messages.filter(
            (m) => m.clientId === chatId && !ids.has(m.id),
          );
          if (extras.length === 0) return next;
          const clientIds = new Set(next.clients.map((c) => c.id));
          const extraClients = prev.clients.filter(
            (c) => c.id === chatId && !clientIds.has(c.id),
          );
          return {
            ...next,
            clients: extraClients.length
              ? [...extraClients, ...next.clients]
              : next.clients,
            messages: [...next.messages, ...extras],
            deletedClientIds: (next.deletedClientIds ?? []).filter(
              (id) => id !== chatId,
            ),
          };
        });
      },
      {
        getChatId: () => chatId,
        threadOnly: true,
      },
    );

    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, [slug, chatId]);

  const introMessages = useMemo(
    () => (space ? resolveChatIntroMessages(space.settings) : null),
    [space?.settings],
  );

  const thread = useMemo(() => {
    if (!space || !introMessages) return [];
    const stored = space.messages.filter((m) => m.clientId === chatId);
    return ensureWelcomeMessages(
      stored,
      chatId,
      space.business.name,
      slug,
      introMessages,
    );
  }, [space, chatId, slug, introMessages]);

  const client = space?.clients.find((c) => c.id === chatId);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [thread.length]);

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
    if (sending) return;
    if (!draft.trim()) return;
    if (client?.chatEndedAt) return;
    if (!space) return;

    const body = draft.trim();
    const name = displayName.trim();
    const presentAt = new Date().toISOString();
    setSendError(null);
    setSending(true);

    const message: Message = {
      id: `m-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      clientId: chatId,
      from: "client",
      kind: "text",
      body,
      ...(replyTo ? { replyTo } : {}),
      ...messageTimeStamp(),
    };

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

    // Show instantly — don't wait on the network round-trip.
    setSpace({
      ...space,
      deletedClientIds: (space.deletedClientIds ?? []).filter(
        (id) => id !== chatId,
      ),
      clients: existing
        ? [nextClient, ...space.clients.filter((c) => c.id !== chatId)]
        : [nextClient, ...space.clients],
      messages: appendCustomerMessageWithAutoReply(
        space.messages,
        chatId,
        message,
        space.business.name,
        slug,
        introMessages!,
      ),
    });
    setDraft("");
    setReplyTo(null);

    try {
      const next = await patchSpace(slug, (latest) => {
        const latestExisting = latest.clients.find((c) => c.id === chatId);
        const savedClient: Client = latestExisting
          ? {
              ...latestExisting,
              name: name || latestExisting.name,
              status:
                latestExisting.status === "client" ? "client" : "unknown",
              preview: body,
              lastActive: "Just now",
              unread: latestExisting.unread + 1,
              presentAt,
            }
          : nextClient;

        return {
          ...latest,
          deletedClientIds: (latest.deletedClientIds ?? []).filter(
            (id) => id !== chatId,
          ),
          clients: latestExisting
            ? [savedClient, ...latest.clients.filter((c) => c.id !== chatId)]
            : [savedClient, ...latest.clients],
          messages: appendCustomerMessageWithAutoReply(
            latest.messages,
            chatId,
            message,
            latest.business.name,
            latest.business.slug,
            resolveChatIntroMessages(latest.settings),
          ),
        };
      });
      setSpace(next);
    } catch (err) {
      setSendError(
        err instanceof Error ? err.message : "Could not send. Try again.",
      );
    } finally {
      setSending(false);
    }
  }

  async function sendImage(file: File) {
    if (client?.chatEndedAt || sending) return;
    setAttaching(true);
    setSendError(null);
    try {
      const media = await readMediaFile(file);
      if (media.kind !== "photo") {
        throw new Error("Pick an image file.");
      }

      const caption = draft.trim();
      const name = displayName.trim();
      const presentAt = new Date().toISOString();
      setSending(true);

      const message: Message = {
        id: `m-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        clientId: chatId,
        from: "client",
        kind: "image",
        body: caption,
        imageUrl: media.url,
        ...(replyTo ? { replyTo } : {}),
        ...messageTimeStamp(),
      };

      const next = await patchSpace(slug, (latest) => {
        const existing = latest.clients.find((c) => c.id === chatId);
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
              name: name || nextGuestName(latest.clients),
              status: "unknown",
              channel: "web",
              preview,
              unread: 1,
              trade: latest.business.trade,
              lastActive: "Just now",
              note: "Unique chat link",
              presentAt,
            };

        return {
          ...latest,
          deletedClientIds: (latest.deletedClientIds ?? []).filter(
            (id) => id !== chatId,
          ),
          clients: existing
            ? [nextClient, ...latest.clients.filter((c) => c.id !== chatId)]
            : [nextClient, ...latest.clients],
          messages: appendCustomerMessageWithAutoReply(
            latest.messages,
            chatId,
            message,
            latest.business.name,
            latest.business.slug,
            resolveChatIntroMessages(latest.settings),
          ),
        };
      });

      setSpace(next);
      setDraft("");
      setReplyTo(null);
    } catch (err) {
      setSendError(
        err instanceof Error ? err.message : "Could not send photo.",
      );
    } finally {
      setAttaching(false);
      setSending(false);
      if (fileRef.current) fileRef.current.value = "";
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

  async function requestLive() {
    const next = await patchSpace(slug, (latest) => {
      const existing = latest.clients.find((c) => c.id === chatId);
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
            note: existing.note?.includes("Live")
              ? existing.note
              : "Live request",
          }
        : {
            id: chatId,
            name: displayName.trim() || nextGuestName(latest.clients),
            status: "unknown",
            channel: "web",
            preview: body,
            unread: 1,
            trade: latest.business.trade,
            lastActive: "Just now",
            note: "Live request",
          };

      return {
        ...latest,
        deletedClientIds: (latest.deletedClientIds ?? []).filter(
          (id) => id !== chatId,
        ),
        clients: existing
          ? latest.clients.map((c) => (c.id === chatId ? nextClient : c))
          : [nextClient, ...latest.clients],
        messages: appendCustomerMessageWithAutoReply(
          latest.messages,
          chatId,
          message,
          latest.business.name,
          latest.business.slug,
          resolveChatIntroMessages(latest.settings),
        ),
      };
    });
    setSpace(next);
  }

  async function requestConsultation() {
    await sendQuickRequest(
      "I'd like to book an in-person consultation.",
      "Consultation request",
    );
  }

  async function copyReturnLink(path: string) {
    const url = path.startsWith("http")
      ? path
      : `${window.location.origin}${path}`;
    try {
      await navigator.clipboard.writeText(url);
      setCopiedReturnLink(true);
      window.setTimeout(() => setCopiedReturnLink(false), 1600);
    } catch {
      // ignore
    }
  }

  async function emailReturnLink(e: FormEvent, path: string) {
    e.preventDefault();
    const email = emailDraft.trim();
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return;

    const url = path.startsWith("http")
      ? path
      : `${window.location.origin}${path}`;
    const mailto = `mailto:${encodeURIComponent(email)}?subject=${encodeURIComponent(
      "Your chat link",
    )}&body=${encodeURIComponent(
      `Use this link to return to your chat with ${space?.business.name ?? "us"}:\n\n${url}`,
    )}`;

    try {
      const next = await patchSpace(slug, (latest) => {
        const existing = latest.clients.find((c) => c.id === chatId);
        const body = `Email this chat link to me: ${email}`;
        const alreadyNoted = latest.messages.some(
          (m) =>
            m.clientId === chatId &&
            m.from === "client" &&
            m.body.startsWith("Email this chat link to me:"),
        );
        const noteBase = existing?.note?.includes("Chat link email")
          ? existing.note
          : [existing?.note, "Chat link email"].filter(Boolean).join(" · ");
        const nextClient: Client = existing
          ? {
              ...existing,
              email,
              note: noteBase || "Chat link email",
              preview: body,
              lastActive: "Just now",
              unread: alreadyNoted ? existing.unread : existing.unread + 1,
            }
          : {
              id: chatId,
              name: displayName.trim() || nextGuestName(latest.clients),
              status: "unknown",
              channel: "web",
              preview: body,
              unread: 1,
              trade: latest.business.trade,
              lastActive: "Just now",
              note: "Chat link email",
              email,
            };

        return {
          ...latest,
          deletedClientIds: (latest.deletedClientIds ?? []).filter(
            (id) => id !== chatId,
          ),
          clients: existing
            ? latest.clients.map((c) => (c.id === chatId ? nextClient : c))
            : [nextClient, ...latest.clients],
          messages: alreadyNoted
            ? latest.messages.map((m) =>
                m.clientId === chatId &&
                m.from === "client" &&
                m.body.startsWith("Email this chat link to me:")
                  ? { ...m, body, ...messageTimeStamp() }
                  : m,
              )
            : [
                ...latest.messages,
                {
                  id: `m-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
                  clientId: chatId,
                  from: "client" as const,
                  kind: "text" as const,
                  body,
                  ...messageTimeStamp(),
                },
              ],
        };
      });
      setSpace(next);
      setEmailSaved(true);
      setLinkEmailSent(true);
    } catch {
      // still offer the mail draft if save fails
    }

    const mail = document.createElement("a");
    mail.href = mailto;
    mail.click();
  }

  async function sendQuickRequest(body: string, note: string) {
    if (client?.chatEndedAt || sending) return;
    setSending(true);
    setSendError(null);
    try {
      const next = await patchSpace(slug, (latest) => {
        const existing = latest.clients.find((c) => c.id === chatId);
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
              name: displayName.trim() || existing.name,
              preview: body,
              lastActive: "Just now",
              unread: existing.unread + 1,
              note: existing.note?.includes(note) ? existing.note : note,
              presentAt: new Date().toISOString(),
            }
          : {
              id: chatId,
              name: displayName.trim() || nextGuestName(latest.clients),
              status: "unknown",
              channel: "web",
              preview: body,
              unread: 1,
              trade: latest.business.trade,
              lastActive: "Just now",
              note,
              presentAt: new Date().toISOString(),
            };

        return {
          ...latest,
          deletedClientIds: (latest.deletedClientIds ?? []).filter(
            (id) => id !== chatId,
          ),
          clients: existing
            ? latest.clients.map((c) => (c.id === chatId ? nextClient : c))
            : [nextClient, ...latest.clients],
          messages: appendCustomerMessageWithAutoReply(
            latest.messages,
            chatId,
            message,
            latest.business.name,
            latest.business.slug,
            resolveChatIntroMessages(latest.settings),
          ),
        };
      });
      setSpace(next);
    } catch (err) {
      setSendError(
        err instanceof Error ? err.message : "Could not send request.",
      );
    } finally {
      setSending(false);
    }
  }

  async function saveEmail(e: FormEvent) {
    e.preventDefault();
    const email = emailDraft.trim();
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return;

    const next = await patchSpace(slug, (latest) => {
      const existing = latest.clients.find((c) => c.id === chatId);
      const body = `Email for reply: ${email}`;
      const alreadyNoted = latest.messages.some(
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
            name: displayName.trim() || nextGuestName(latest.clients),
            status: "unknown",
            channel: "web",
            preview: body,
            unread: 1,
            trade: latest.business.trade,
            lastActive: "Just now",
            note: "Left email",
            email,
          };

      return {
        ...latest,
        deletedClientIds: (latest.deletedClientIds ?? []).filter(
          (id) => id !== chatId,
        ),
        clients: existing
          ? latest.clients.map((c) => (c.id === chatId ? nextClient : c))
          : [nextClient, ...latest.clients],
        messages: alreadyNoted
          ? latest.messages.map((m) =>
              m.clientId === chatId &&
              m.from === "client" &&
              m.body.startsWith("Email for reply:")
                ? { ...m, body, ...messageTimeStamp() }
                : m,
            )
          : [
              ...latest.messages,
              {
                id: `m-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
                clientId: chatId,
                from: "client" as const,
                kind: "text" as const,
                body,
                ...messageTimeStamp(),
              },
            ],
      };
    });

    setSpace(next);
    setEmailSaved(true);
  }

  async function saveRecordingEmail(e: FormEvent) {
    e.preventDefault();
    const email = emailDraft.trim();
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return;

    const next = await patchSpace(slug, (latest) => {
      const existing = latest.clients.find((c) => c.id === chatId);
      const body = `Recording email: ${email}`;
      const alreadyNoted = latest.messages.some(
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
            name: displayName.trim() || nextGuestName(latest.clients),
            status: "unknown",
            channel: "web",
            preview: body,
            unread: 1,
            trade: latest.business.trade,
            lastActive: "Just now",
            note: "Wants recording",
            email,
            chatEndedAt: new Date().toISOString(),
          };

      return {
        ...latest,
        deletedClientIds: (latest.deletedClientIds ?? []).filter(
          (id) => id !== chatId,
        ),
        clients: existing
          ? latest.clients.map((c) => (c.id === chatId ? nextClient : c))
          : [nextClient, ...latest.clients],
        messages: alreadyNoted
          ? latest.messages.map((m) =>
              m.clientId === chatId &&
              m.from === "client" &&
              m.body.startsWith("Recording email:")
                ? { ...m, body, ...messageTimeStamp() }
                : m,
            )
          : [
              ...latest.messages,
              {
                id: `m-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
                clientId: chatId,
                from: "client" as const,
                kind: "text" as const,
                body,
                ...messageTimeStamp(),
              },
            ],
      };
    });

    setSpace(next);
    setRecordingSaved(true);
    setEmailSaved(true);
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
        <Link href="/">Create a space</Link>
      </div>
    );
  }

  const settings = space.settings;
  const banners = settings.banners.filter((b) => b.enabled && b.text.trim());
  const hoursLabel = formatResponseWindows(settings.windows);
  const chatEndImages = (settings.chatEndImages ?? []).slice(0, 6);
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

  const quickActions = !chatEnded ? (
    <div className="client-quick-actions">
      <div className="client-away-actions">
        <button
          type="button"
          className="client-book-consult-btn"
          onClick={() => void requestConsultation()}
          disabled={sending}
        >
          Book in-person consultation
        </button>
      </div>
    </div>
  ) : null;

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
          </div>
        ) : null}
        {head}

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

        {quickActions}

        {banners.length > 0 ? (
          <div className="client-chat-banners">
            {banners.map((banner) => (
              <ChatBannerView key={banner.id} banner={banner} />
            ))}
          </div>
        ) : null}
      </div>

      <SwipeTimeStream
        ref={scrollRef}
        isEmpty={thread.length === 0}
        empty={
          <div className="client-chat-empty">
            <p>Send a message to get started.</p>
          </div>
        }
      >
        {thread.map((message, index) => {
          const fromCustomer = message.from === "client";
          const { role, continued } = messageCluster(thread, index);
          const myEmojis = new Set(
            (message.reactions ?? [])
              .filter((r) => reactorKey(r) === "client")
              .map((r) => r.emoji),
          );
          const staffName =
            !fromCustomer
              ? message.fromName?.trim() ||
                (message.fromMemberId
                  ? members.find((m) => m.id === message.fromMemberId)?.name
                  : undefined) ||
                chatOwner?.name ||
                ""
              : "";
          const reconnect = isReconnectMessage(message);
          const reconnectPath = message.linkUrl || `/${slug}/c/${chatId}`;
          const interactive = !reconnect;
          const actionsOpen = actionsFor === message.id;
          return (
            <div
              key={message.id}
              className={`chat-row ${clusterClassName(role, continued)}${
                actionsOpen ? " is-actions-open" : ""
              }`}
              data-message-id={message.id}
              onClick={(e) => {
                if (client?.chatEndedAt || !interactive) return;
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
              <div className="chat-row-main">
                <article
                  className={`bubble bubble-${fromCustomer ? "business" : "client"} ${
                    reconnect ? "bubble-reconnect" : `bubble-${message.kind}`
                  }`}
                >
                  {staffName ? (
                    <span className="bubble-speaker">{staffName}</span>
                  ) : null}
                  {message.replyTo ? (
                    <MessageReplyQuote reply={message.replyTo} />
                  ) : null}
                  {reconnect ? (
                    <div className="client-reconnect">
                      <p>{message.body}</p>
                      <a className="client-reconnect-link" href={reconnectPath}>
                        {typeof window === "undefined"
                          ? reconnectPath
                          : `${window.location.origin}${reconnectPath}`}
                      </a>
                      <button
                        type="button"
                        className="client-reconnect-copy"
                        onClick={() => void copyReturnLink(reconnectPath)}
                      >
                        {copiedReturnLink ? "Copied" : "Copy link"}
                      </button>
                      {linkEmailSent && emailDraft.trim() ? (
                        <p className="client-reconnect-sent">
                          We&apos;ll email this chat link to{" "}
                          <strong>{emailDraft.trim()}</strong>
                          <button
                            type="button"
                            className="client-away-edit"
                            onClick={() => setLinkEmailSent(false)}
                          >
                            Change
                          </button>
                        </p>
                      ) : (
                        <form
                          className="client-away-form client-reconnect-form"
                          onSubmit={(e) => void emailReturnLink(e, reconnectPath)}
                        >
                          <label className="composer-field">
                            <span className="sr-only">Email this chat link</span>
                            <input
                              type="email"
                              value={emailDraft ?? ""}
                              onChange={(e) => setEmailDraft(e.target.value)}
                              placeholder="you@email.com"
                              required
                              autoComplete="email"
                            />
                          </label>
                          <button
                            type="submit"
                            className="btn-solid client-away-submit"
                          >
                            Email link
                          </button>
                        </form>
                      )}
                    </div>
                  ) : (
                    <>
                      <MessageMedia message={message} />
                      {message.body && message.kind !== "link" ? (
                        <p>{message.body}</p>
                      ) : null}
                    </>
                  )}
                  <MessageReactions
                    reactions={message.reactions}
                    myEmojis={myEmojis}
                    disabled={Boolean(client?.chatEndedAt)}
                    onToggle={(emoji) => reactToMessage(message.id, emoji)}
                  />
                </article>
                {interactive ? (
                  <MessageActionBar
                    align={fromCustomer ? "end" : "start"}
                    disabled={Boolean(client?.chatEndedAt)}
                    onReply={() => setReplyTo(buildReplyRef(message))}
                    onReact={(emoji) => reactToMessage(message.id, emoji)}
                  />
                ) : null}
              </div>
              <time className="chat-row-time" dateTime={message.at}>
                <span className="chat-row-time-inner">
                  {message.at.replace(", ", "\n")}
                </span>
              </time>
            </div>
          );
        })}
      </SwipeTimeStream>

      <div className="client-chat-end-wrap">
        <ChatMarketingCarousel images={chatEndImages} />
        {chatEnded ? (
          <div className="client-composer client-composer-ended" role="status">
            <p>Chat ended</p>
          </div>
        ) : (
          <form className="client-composer" onSubmit={(e) => void send(e)}>
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
            {sendError ? (
              <p className="client-send-error" role="alert">
                {sendError}
              </p>
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
                className={`composer-attach ${attaching || sending ? "is-busy" : ""}`}
                aria-label="Attach image"
                title="Attach image"
              >
                <IconPaperclip />
              </label>
              <label className="composer-field">
                <span className="sr-only">Message</span>
                <input
                  value={draft ?? ""}
                  onChange={(e) => {
                    setDraft(e.target.value);
                    if (sendError) setSendError(null);
                  }}
                  placeholder={replyTo ? "Write a reply…" : "Message…"}
                  autoFocus
                  disabled={sending}
                />
              </label>
              <button
                type="submit"
                className="composer-send"
                aria-label="Send"
                disabled={sending || !draft.trim()}
              >
                <IconArrowSend />
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
