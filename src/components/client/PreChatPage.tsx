"use client";

import Link from "next/link";
import { useEffect, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import type { BusinessSpace } from "@/lib/types";
import { getSpace, subscribeSpace } from "@/lib/store";
import { defaultPreChat, formatResponseWindows } from "@/lib/spaceNormalize";
import {
  liveChatQueueStatus,
  preChatHref,
  visiblePreChatLinks,
} from "@/lib/preChat";
import { isSolutionEnabled } from "@/lib/setupSolutions";

interface PreChatPageProps {
  slug: string;
  embedded?: boolean;
  /** Dashboard live preview — no fetch, no navigation. */
  preview?: boolean;
  previewSpace?: BusinessSpace;
  onOpenChat?: () => void;
}

function isLocalChatHref(href: string, slug: string) {
  return href === `/${slug}/chat` || href.startsWith(`/${slug}/chat?`);
}

function ReachWaitTip({
  waitPhrase,
  children,
}: {
  waitPhrase: string;
  children: ReactNode;
}) {
  return (
    <span className="pre-chat-wait-anchor">
      {children}
      <span className="pre-chat-wait-tip" role="tooltip">
        Help Desk is working with Client. Your place in line is secured with a
        live wait time of {waitPhrase}.
      </span>
    </span>
  );
}

const WAIT_BUBBLE_SHOW_MS = 10_000;
const WAIT_BUBBLE_REPEAT_MS = 60_000;

function WaitProgressBubble({
  waitPhrase,
  wrappingUp,
}: {
  waitPhrase: string;
  wrappingUp: boolean;
}) {
  const [open, setOpen] = useState(true);
  const [shownAt, setShownAt] = useState(() => Date.now());

  useEffect(() => {
    let hideTimer = 0;
    const show = () => {
      setShownAt(Date.now());
      setOpen(true);
      window.clearTimeout(hideTimer);
      hideTimer = window.setTimeout(() => setOpen(false), WAIT_BUBBLE_SHOW_MS);
    };
    show();
    const repeat = window.setInterval(show, WAIT_BUBBLE_REPEAT_MS);
    return () => {
      window.clearTimeout(hideTimer);
      window.clearInterval(repeat);
    };
  }, []);

  useEffect(() => {
    if (!wrappingUp) return;
    setShownAt(Date.now());
    setOpen(true);
    const hide = window.setTimeout(() => setOpen(false), WAIT_BUBBLE_SHOW_MS);
    return () => window.clearTimeout(hide);
  }, [wrappingUp]);

  if (!open) return null;

  return (
    <aside
      key={shownAt}
      className="pre-chat-wait-bubble"
      role="status"
      aria-live="polite"
    >
      {wrappingUp
        ? "Help Desk chat is wrapping up and will now be with you. Thank you for waiting and looking forward to our chat."
        : `Help Desk Chat is working with a Client. Your expected wait time is ${waitPhrase}.`}
    </aside>
  );
}

export function PreChatPage({
  slug,
  embedded = false,
  preview = false,
  previewSpace,
  onOpenChat,
}: PreChatPageProps) {
  const router = useRouter();
  const [loadedSpace, setLoadedSpace] = useState<BusinessSpace | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const space = previewSpace ?? loadedSpace;

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 5_000);
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
            <h1>Public page is off</h1>
            <p className="pre-chat-bio">
              Turn it on in Setup to show this page.
            </p>
          </main>
        </div>
      );
    }
    return <div className="client-chat-loading">Opening chat…</div>;
  }

  const preChat = settings.preChat ?? defaultPreChat();
  const headline = preChat.headline.trim() || space.business.name;
  const links = visiblePreChatLinks(preChat).filter((link) => {
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
  const hoursMeta = hoursLabel ? (
    <>
      <span className="pre-chat-link-meta">Hours of Operation</span>
      <span className="pre-chat-link-meta">
        {hoursLabel}
        {hoursNote ? ` · ${hoursNote}` : ""}
      </span>
    </>
  ) : null;

  return (
    <div
      className={`pre-chat${embedded || preview ? " is-embedded" : ""}${
        preview ? " is-preview" : ""
      }${settings.brandBannerUrl ? " has-banner" : ""}`}
    >
      {settings.brandBannerUrl ? (
        <div className="pre-chat-banner" aria-hidden>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={settings.brandBannerUrl} alt="" />
        </div>
      ) : null}

      <WaitProgressBubble
        waitPhrase={queue.waitPhrase}
        wrappingUp={queue.wrappingUp}
      />

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
        {preChat.bio.trim() ? <p className="pre-chat-bio">{preChat.bio}</p> : null}

        <nav className="pre-chat-links" aria-label="Ways to reach us">
          {links.map((link) => {
            const href = preChatHref(link, space.business.slug);
            if (!href) return null;
            const external = link.kind === "url";
            const isConsult =
              link.id === "pre-consult" || /consultation/i.test(link.label);
            const isPromo =
              link.id === "pre-promo" || /promotions/i.test(link.label);
            if (link.kind === "call") {
              const callInner = (
                <>
                  <span className="pre-chat-link-label">{link.label}</span>
                  {hoursMeta}
                </>
              );
              if (preview) {
                return (
                  <ReachWaitTip key={link.id} waitPhrase={queue.waitPhrase}>
                    <span className="pre-chat-link is-chat">{callInner}</span>
                  </ReachWaitTip>
                );
              }
              return (
                <ReachWaitTip key={link.id} waitPhrase={queue.waitPhrase}>
                  <a href={href} className="pre-chat-link is-chat">
                    {callInner}
                  </a>
                </ReachWaitTip>
              );
            }
            const opensChat =
              link.kind === "chat" || isLocalChatHref(href, space.business.slug);
            const chatInner = (
              <>
                <span className="pre-chat-link-label">{link.label}</span>
                {link.kind === "chat" ? (
                  <>
                    <span className="pre-chat-link-meta">
                      Live Wait Time {queue.waitLabel}
                    </span>
                    <span className="pre-chat-link-meta">{queue.queueLabel}</span>
                  </>
                ) : isPromo ? (
                  <>
                    <span className="pre-chat-link-meta">Book With Us Through</span>
                    <span className="pre-chat-link-meta">
                      Live Chat, Call, Or Email
                    </span>
                  </>
                ) : isConsult ? (
                  <span className="pre-chat-link-meta">Book Anytime</span>
                ) : null}
              </>
            );
            const chatAction = preview ? (
              <span className="pre-chat-link is-chat">{chatInner}</span>
            ) : onOpenChat ? (
              <button
                type="button"
                className="pre-chat-link is-chat"
                onClick={onOpenChat}
              >
                {chatInner}
              </button>
            ) : (
              <Link href={href} className="pre-chat-link is-chat">
                {chatInner}
              </Link>
            );
            if (opensChat) {
              if (link.kind === "chat") {
                return (
                  <ReachWaitTip key={link.id} waitPhrase={queue.waitPhrase}>
                    {chatAction}
                  </ReachWaitTip>
                );
              }
              return (
                <span key={link.id} className="pre-chat-link-wrap">
                  {chatAction}
                </span>
              );
            }
            const urlInner = (
              <>
                <span className="pre-chat-link-label">{link.label}</span>
                {isConsult ? (
                  <span className="pre-chat-link-meta">Book Anytime</span>
                ) : null}
                {isPromo ? (
                  <>
                    <span className="pre-chat-link-meta">Book With Us Through</span>
                    <span className="pre-chat-link-meta">
                      Live Chat, Call, Or Email
                    </span>
                  </>
                ) : null}
              </>
            );
            if (preview) {
              return (
                <span
                  key={link.id}
                  className={`pre-chat-link${isConsult || isPromo ? " is-chat" : ""}`}
                >
                  {urlInner}
                </span>
              );
            }
            return (
              <a
                key={link.id}
                href={href}
                className={`pre-chat-link${isConsult || isPromo ? " is-chat" : ""}`}
                target={external ? "_blank" : undefined}
                rel={external ? "noreferrer" : undefined}
              >
                {urlInner}
              </a>
            );
          })}
        </nav>
      </main>
    </div>
  );
}
