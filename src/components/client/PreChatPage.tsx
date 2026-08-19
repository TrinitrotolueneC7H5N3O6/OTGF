"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import type { BusinessSpace } from "@/lib/types";
import { getSpace, subscribeSpace } from "@/lib/store";
import { defaultPreChat, formatResponseWindows } from "@/lib/spaceNormalize";
import {
  liveChatQueueStatus,
  preChatHref,
  visiblePreChatLinks,
} from "@/lib/preChat";

interface PreChatPageProps {
  slug: string;
}

export function PreChatPage({ slug }: PreChatPageProps) {
  const [space, setSpace] = useState<BusinessSpace | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 15_000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const loaded = await getSpace(slug);
        if (cancelled) return;
        if (!loaded) {
          setError("This page isn’t set up yet.");
          return;
        }
        setSpace(loaded);
      } catch {
        if (!cancelled) setError("Could not open this page. Pull to refresh.");
      }
    }
    void load();
    const unsubscribe = subscribeSpace(slug, (next) => {
      if (next) setSpace(next);
    });
    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, [slug]);

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
  const preChat = settings.preChat ?? defaultPreChat();
  const headline = preChat.headline.trim() || space.business.name;
  const links = visiblePreChatLinks(preChat);
  const queue = liveChatQueueStatus(space, now);
  const hoursLabel = formatResponseWindows(settings.windows);
  const hoursNote = settings.responseNote.trim();
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
      className={`pre-chat ${settings.brandBannerUrl ? "has-banner" : ""}`}
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
              return (
                <a key={link.id} href={href} className="pre-chat-link is-chat">
                  <span className="pre-chat-link-label">{link.label}</span>
                  {phone ? (
                    <span className="pre-chat-link-meta">US {phone}</span>
                  ) : null}
                  {hoursMeta}
                </a>
              );
            }
            if (link.kind === "chat") {
              return (
                <Link key={link.id} href={href} className="pre-chat-link is-chat">
                  <span className="pre-chat-link-label">{link.label}</span>
                  <span className="pre-chat-link-meta">
                    Live Wait Time {queue.waitLabel} · {queue.queueLabel}
                  </span>
                  {hoursMeta}
                </Link>
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
                <span className="pre-chat-link-label">{link.label}</span>
                {isConsult ? (
                  <span className="pre-chat-link-meta">Book Anytime</span>
                ) : null}
                {isPromo ? (
                  <span className="pre-chat-link-meta">Viewable Anytime</span>
                ) : null}
              </a>
            );
          })}
        </nav>
      </main>
    </div>
  );
}
