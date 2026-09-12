"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { InAppLink } from "@/components/shared/LinkSheet";
import type { BusinessSpace, Client, PreChatLink } from "@/lib/types";
import { QuickContactModal } from "./QuickContactModal";
import { QuickBuildModal } from "./QuickBuildModal";
import { quickBuildConfigForLink } from "@/lib/quickBuilds";
import {
  applySpaceOp,
  getSpace,
  nextGuestName,
  resolveCustomerChatId,
  subscribeSpace,
} from "@/lib/store";
import { defaultPreChat, formatResponseWindows } from "@/lib/spaceNormalize";
import {
  liveChatQueueStatus,
  preChatHref,
  visiblePreChatLinks,
} from "@/lib/preChat";
import { isSolutionEnabled } from "@/lib/setupSolutions";
import { isWorkspaceComponentEnabled } from "@/lib/workspaceComponents";

interface PreChatPageProps {
  slug: string;
  embedded?: boolean;
  /** Dashboard live preview — no fetch, no navigation. */
  preview?: boolean;
  previewSpace?: BusinessSpace;
  onOpenChat?: () => void;
  onOpenStories?: () => void;
  /** Keep the public page mounted while chat opens in a modal layer. */
  modalChat?: boolean;
}

type PreparedChat = {
  spaceSlug: string;
  chatId: string;
};

function isLocalChatHref(href: string, slug: string) {
  const chatPath = `/${slug}/chat`;
  return href === chatPath || href.startsWith(`${chatPath}?`);
}

function hasChatEntry(space: BusinessSpace) {
  const preChat = space.settings.preChat ?? defaultPreChat();
  return visiblePreChatLinks(preChat, space.settings).some((link) => {
    const href = preChatHref(link, space.business.slug);
    return Boolean(
      href && (link.kind === "chat" || isLocalChatHref(href, space.business.slug)),
    );
  });
}

function lobbyClient(space: BusinessSpace, chatId: string): Client {
  const presentAt = new Date().toISOString();
  return {
    id: chatId,
    name: nextGuestName(space.clients),
    status: "unknown",
    channel: "web",
    preview: "Waiting in front lobby",
    unread: 0,
    trade: space.business.trade,
    lastActive: "Just now",
    note: "Opened front lobby",
    presentAt,
  };
}

export function PreChatPage({
  slug,
  embedded = false,
  preview = false,
  previewSpace,
  onOpenChat,
  onOpenStories,
  modalChat = false,
}: PreChatPageProps) {
  const router = useRouter();
  const [loadedSpace, setLoadedSpace] = useState<BusinessSpace | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [preparedChat, setPreparedChat] = useState<PreparedChat | null>(null);
  const [openingChat, setOpeningChat] = useState(false);
  const [contactLink, setContactLink] = useState<PreChatLink | null>(null);
  const [quickBuildLink, setQuickBuildLink] = useState<PreChatLink | null>(null);
  const prewarmSlugRef = useRef<string | null>(null);
  const space = previewSpace ?? loadedSpace;

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 15_000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    if (previewSpace) return;
    let cancelled = false;
    async function load() {
      try {
        const loaded = await getSpace(slug);
        if (cancelled) return;
        if (!loaded) {
          setError("This page isn’t set up yet.");
          return;
        }
        setLoadedSpace(loaded);
      } catch {
        if (!cancelled) setError("Could not open this page. Pull to refresh.");
      }
    }
    void load();
    const unsubscribe = subscribeSpace(slug, (next) => {
      if (next) setLoadedSpace(next);
    });
    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, [slug, previewSpace]);

  useEffect(() => {
    if (preview) return;
    if (!space) return;
    if (isSolutionEnabled(space.settings, "preChat")) return;
    if (onOpenChat) {
      onOpenChat();
      return;
    }
    router.replace(`/${slug}/chat`);
  }, [space, slug, router, onOpenChat, preview]);

  useEffect(() => {
    if (preview) return;
    if (!space) return;
    if (!isSolutionEnabled(space.settings, "preChat")) return;
    if (!hasChatEntry(space)) return;
    if (prewarmSlugRef.current === slug) return;

    let cancelled = false;
    prewarmSlugRef.current = slug;

    async function prewarmChatRoom() {
      try {
        const resolved = await resolveCustomerChatId(slug);
        if (cancelled) return;

        const existing = space!.clients.find((c) => c.id === resolved.chatId);
        if (!existing) {
          await applySpaceOp(resolved.spaceSlug, {
            type: "upsertClient",
            client: lobbyClient(space!, resolved.chatId),
            clearDeleted: true,
          });
          if (cancelled) return;
        }

        const href = `/${resolved.spaceSlug}/c/${resolved.chatId}`;
        setPreparedChat(resolved);
        router.prefetch(href);
      } catch (err) {
        console.error(err);
        if (!cancelled) prewarmSlugRef.current = null;
      }
    }

    void prewarmChatRoom();
    return () => {
      cancelled = true;
    };
  }, [space, slug, router, preview]);

  async function openChat() {
    if (openingChat) return;
    if (preview) {
      onOpenChat?.();
      return;
    }
    setOpeningChat(true);

    if (onOpenChat) {
      if (modalChat) {
        setOpeningChat(false);
        onOpenChat();
      } else {
        window.setTimeout(onOpenChat, 170);
      }
      return;
    }

    let target = preparedChat;
    try {
      if (!target) {
        target = await resolveCustomerChatId(slug);
      }
      router.push(`/${target.spaceSlug}/c/${target.chatId}`, {
        scroll: false,
        transitionTypes: ["front-lobby-chat"],
      });
    } catch (err) {
      console.error(err);
      setOpeningChat(false);
      setError("Could not open chat. Pull to refresh and try again.");
    }
  }

  function openContact(link: PreChatLink) {
    setContactLink(link);
  }

  if (error) {
    return (
      <div className="client-missing">
        <p className="brand-name">OTGF</p>
        <h1>Nothing here</h1>
        <p>{error}</p>
      </div>
    );
  }

  if (!space) {
    return <div className="client-chat-loading">Loading…</div>;
  }

  const settings = space.settings;
  if (!isSolutionEnabled(settings, "preChat")) {
    if (preview) {
      return (
        <div className="pre-chat is-embedded is-preview">
          <main className="pre-chat-card">
            <h1>Front Desk is off</h1>
            <p className="pre-chat-bio">
              Turn it on in Tools to show this micro-landing page.
            </p>
          </main>
        </div>
      );
    }
    return <div className="client-chat-loading">Opening chat…</div>;
  }

  const preChat = settings.preChat ?? defaultPreChat();
  const headline = preChat.headline.trim() || space.business.name;
  const links = visiblePreChatLinks(preChat, settings).filter((link) => {
    const isConsult =
      link.id === "pre-consult" || /consultation/i.test(link.label);
    const isPromo =
      link.id === "pre-promo" || /promotions/i.test(link.label);
    if (isConsult) return isSolutionEnabled(settings, "consultations");
    if (isPromo) return isSolutionEnabled(settings, "promos");
    return true;
  });
  const queue = liveChatQueueStatus(space, now);
  const hoursLabel = isSolutionEnabled(settings, "hours")
    ? formatResponseWindows(settings.windows)
    : "";
  const hoursNote = isSolutionEnabled(settings, "hours")
    ? settings.responseNote.trim()
    : "";
  const hoursLine = hoursLabel
    ? `${hoursLabel}${hoursNote ? ` · ${hoursNote}` : ""}`
    : "";

  return (
    <div
      className={`pre-chat${embedded || preview ? " is-embedded" : ""}${
        preview ? " is-preview" : ""
      }${settings.brandBannerUrl ? " has-banner" : ""}${
        openingChat ? " is-opening-chat" : ""
      }`}
    >
      {settings.brandBannerUrl ? (
        <div className="pre-chat-banner" aria-hidden>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={settings.brandBannerUrl} alt="" />
        </div>
      ) : null}

      <main className="pre-chat-card">
        {settings.logoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={settings.logoUrl} alt="" className="pre-chat-logo" />
        ) : (
          <span className="pre-chat-logo is-fallback" aria-hidden>
            {headline.slice(0, 1).toUpperCase()}
          </span>
        )}
        <h1>{headline}</h1>
        {hoursLine ? <p className="pre-chat-hours">{hoursLine}</p> : null}
        {preChat.bio.trim() ? <p className="pre-chat-bio">{preChat.bio}</p> : null}

        <nav className="pre-chat-links" aria-label="Ways to reach us">
          {links.map((link) => {
            const href = preChatHref(link, space.business.slug);
            const quickBuild = quickBuildConfigForLink(link);
            if (!href && !quickBuild) return null;
            const external = link.kind === "url";
            const isConsult =
              link.id === "pre-consult" || /consultation/i.test(link.label);
            const isPromo =
              link.id === "pre-promo" || /promotions/i.test(link.label);
            if (quickBuild) {
              const quickInner = (
                <>
                  <span className="pre-chat-link-label">{link.label}</span>
                  <span className="pre-chat-link-meta">{quickBuild.description}</span>
                </>
              );
              return (
                <button key={link.id} type="button" className="pre-chat-link is-chat" onClick={() => setQuickBuildLink(link)}>{quickInner}</button>
              );
            }
            if (link.kind === "call" || link.kind === "sms") {
              const phone = link.href?.trim() ?? "";
              const callInner = (
                <>
                  <span className="pre-chat-link-label">{link.label}</span>
                  {phone ? (
                    <span className="pre-chat-link-meta">
                      {link.kind === "sms" ? "Text" : "US"} {phone}
                    </span>
                  ) : null}
                </>
              );
              return link.kind === "sms" ? (
                <button
                  key={link.id}
                  type="button"
                  className="pre-chat-link is-chat"
                  onClick={() => openContact(link)}
                >
                  {callInner}
                </button>
              ) : (
                <a key={link.id} href={href!} className="pre-chat-link is-chat">
                  {callInner}
                </a>
              );
            }
            const opensChat =
              link.kind === "chat" || Boolean(href && isLocalChatHref(href, space.business.slug));
            if (opensChat) {
              const chatInner = (
                <>
                  <span className="pre-chat-link-label">{link.label}</span>
                  {link.kind === "chat" ? (
                    <span className="pre-chat-link-meta">
                      Live Wait Time {queue.waitLabel} · {queue.queueLabel}
                    </span>
                  ) : isPromo ? (
                    <span className="pre-chat-link-meta">Viewable Anytime</span>
                  ) : isConsult ? (
                    <span className="pre-chat-link-meta">Book Anytime</span>
                  ) : null}
                </>
              );
              return (
                <button
                  key={link.id}
                  type="button"
                  className="pre-chat-link is-chat"
                  onClick={() => void openChat()}
                  disabled={openingChat}
                >
                  {chatInner}
                </button>
              );
            }
            const urlInner = (
              <>
                <span className="pre-chat-link-label">{link.label}</span>
                {isConsult ? (
                  <span className="pre-chat-link-meta">Book Anytime</span>
                ) : null}
                {isPromo ? (
                  <span className="pre-chat-link-meta">Viewable Anytime</span>
                ) : null}
              </>
            );
            if (link.kind === "email") {
              return (
                <button
                  key={link.id}
                  type="button"
                  className="pre-chat-link"
                  onClick={() => openContact(link)}
                >
                  {urlInner}
                </button>
              );
            }
            return (
              <InAppLink
                key={link.id}
                href={href!}
                className={`pre-chat-link${isConsult || isPromo ? " is-chat" : ""}`}
                target={external ? "_blank" : undefined}
                rel={external ? "noreferrer" : undefined}
              >
                {urlInner}
              </InAppLink>
            );
          })}
          {isWorkspaceComponentEnabled(settings, "storytelling") ? (
            preview && !onOpenStories ? (
              <span className="pre-chat-link">
                <span className="pre-chat-link-label">See our work</span>
                <span className="pre-chat-link-meta">Search finished jobs</span>
              </span>
            ) : onOpenStories ? (
              <button type="button" className="pre-chat-link is-chat" onClick={onOpenStories}>
                <span className="pre-chat-link-label">See our work</span>
                <span className="pre-chat-link-meta">Search finished jobs</span>
              </button>
            ) : (
              <a href={`/${slug}/stories`} className="pre-chat-link">
                <span className="pre-chat-link-label">See our work</span>
                <span className="pre-chat-link-meta">Search finished jobs</span>
              </a>
            )
          ) : null}
        </nav>
      </main>
      {contactLink ? (
        <QuickContactModal
          link={contactLink}
          slug={slug}
          onClose={() => setContactLink(null)}
        />
      ) : null}
      {quickBuildLink ? (
        <QuickBuildModal
          link={quickBuildLink}
          slug={slug}
          onClose={() => setQuickBuildLink(null)}
        />
      ) : null}
    </div>
  );
}
