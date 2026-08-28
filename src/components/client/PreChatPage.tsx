"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
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
              const phone = link.href?.trim() ?? "";
              const callInner = (
                <>
                  <span className="pre-chat-link-label">{link.label}</span>
                  {phone ? (
                    <span className="pre-chat-link-meta">US {phone}</span>
                  ) : null}
                  {hoursMeta}
                </>
              );
              if (preview) {
                return (
                  <span key={link.id} className="pre-chat-link is-chat">
                    {callInner}
                  </span>
                );
              }
              return (
                <a key={link.id} href={href} className="pre-chat-link is-chat">
                  {callInner}
                </a>
              );
            }
            const opensChat =
              link.kind === "chat" || isLocalChatHref(href, space.business.slug);
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
                  {link.kind === "chat" ? hoursMeta : null}
                </>
              );
              if (preview) {
                return (
                  <span key={link.id} className="pre-chat-link is-chat">
                    {chatInner}
                  </span>
                );
              }
              if (onOpenChat) {
                return (
                  <button
                    key={link.id}
                    type="button"
                    className="pre-chat-link is-chat"
                    onClick={onOpenChat}
                  >
                    {chatInner}
                  </button>
                );
              }
              return (
                <Link key={link.id} href={href} className="pre-chat-link is-chat">
                  {chatInner}
                </Link>
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
