"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import type { Client, Message } from "@/lib/types";
import { rememberChat } from "@/lib/chatMemory";
import {
  ensureSpace,
  formatResponseWindows,
  nextGuestName,
  patchSpace,
  readMediaFile,
  subscribeSpace,
  messageTimeStamp,
} from "@/lib/store";
import { MessageMedia } from "@/components/shared/MessageMedia";
import { ChatBannerView } from "@/components/shared/ChatBannerView";
import {
  IconArrowSend,
  IconPaperclip,
} from "@/components/shared/Icons";
import { SwipeTimeStream } from "./SwipeTimeStream";

interface ClientChatProps {
  slug: string;
  chatId: string;
}

function isGuestName(name: string) {
  return /^Guest(\s+\d+)?$/i.test(name.trim());
}

export function ClientChat({ slug, chatId }: ClientChatProps) {
  const [space, setSpace] = useState<Awaited<
    ReturnType<typeof ensureSpace>
  > | null>(null);
  const [displayName, setDisplayName] = useState("");
  const [draft, setDraft] = useState("");
  const [emailDraft, setEmailDraft] = useState("");
  const [emailSaved, setEmailSaved] = useState(false);
  const [recordingSaved, setRecordingSaved] = useState(false);
  const [ready, setReady] = useState(false);
  const [attaching, setAttaching] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

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
      if (next) setSpace(next);
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
        await patchSpace(slug, (latest) => {
          if (!latest.clients.some((c) => c.id === chatId)) return latest;
          const presentAt = new Date().toISOString();
          return {
            ...latest,
            clients: latest.clients.map((c) =>
              c.id === chatId ? { ...c, presentAt } : c,
            ),
          };
        });
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

    const body = draft.trim();
    const name = displayName.trim();
    const presentAt = new Date().toISOString();

    const next = await patchSpace(slug, (latest) => {
      const existing = latest.clients.find((c) => c.id === chatId);
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
            name: name || nextGuestName(latest.clients),
            status: "unknown",
            channel: "web",
            preview: body,
            unread: 1,
            trade: latest.business.trade,
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
        ...messageTimeStamp(),
      };

      return {
        ...latest,
        deletedClientIds: (latest.deletedClientIds ?? []).filter(
          (id) => id !== chatId,
        ),
        clients: existing
          ? [nextClient, ...latest.clients.filter((c) => c.id !== chatId)]
          : [nextClient, ...latest.clients],
        messages: [...latest.messages, message],
      };
    });

    setSpace(next);
    setDraft("");
  }

  async function sendImage(file: File) {
    if (client?.chatEndedAt) return;
    setAttaching(true);
    try {
      const media = await readMediaFile(file);
      if (media.kind !== "photo") {
        throw new Error("Pick an image file.");
      }

      const caption = draft.trim();
      const name = displayName.trim();
      const presentAt = new Date().toISOString();

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

        const message: Message = {
          id: `m-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
          clientId: chatId,
          from: "client",
          kind: "image",
          body: caption,
          imageUrl: media.url,
          ...messageTimeStamp(),
        };

        return {
          ...latest,
          deletedClientIds: (latest.deletedClientIds ?? []).filter(
            (id) => id !== chatId,
          ),
          clients: existing
            ? [nextClient, ...latest.clients.filter((c) => c.id !== chatId)]
            : [nextClient, ...latest.clients],
          messages: [...latest.messages, message],
        };
      });

      setSpace(next);
      setDraft("");
    } finally {
      setAttaching(false);
      if (fileRef.current) fileRef.current.value = "";
    }
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
        messages: [...latest.messages, message],
      };
    });
    setSpace(next);
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

  return (
    <div className="client-chat">
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

      <SwipeTimeStream
        ref={scrollRef}
        isEmpty={thread.length === 0}
        empty={
          <div className="client-chat-empty">
            <p>Send a message to get started.</p>
          </div>
        }
      >
        {thread.map((message) => {
          const fromCustomer = message.from === "client";
          const staffName =
            !fromCustomer
              ? message.fromName?.trim() ||
                (message.fromMemberId
                  ? members.find((m) => m.id === message.fromMemberId)?.name
                  : undefined) ||
                chatOwner?.name ||
                ""
              : "";
          return (
            <div key={message.id} className="chat-row">
              <div className="chat-row-main">
                <article
                  className={`bubble bubble-${fromCustomer ? "business" : "client"} bubble-${message.kind}`}
                >
                  {staffName ? (
                    <span className="bubble-speaker">{staffName}</span>
                  ) : null}
                  <MessageMedia message={message} />
                  {message.body ? <p>{message.body}</p> : null}
                </article>
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

      {chatEnded ? (
        <div className="client-composer client-composer-ended" role="status">
          <p>Chat ended</p>
        </div>
      ) : (
        <form className="client-composer" onSubmit={(e) => void send(e)}>
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
              <input
                value={draft ?? ""}
                onChange={(e) => setDraft(e.target.value)}
                placeholder="Message…"
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
  );
}
