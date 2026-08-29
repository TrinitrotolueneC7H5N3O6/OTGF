"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import type { Artifact, BusinessSpace, FloorMember, FloorSettings } from "@/lib/types";
import { IconEye } from "@/components/shared/Icons";
import { isSolutionEnabled } from "@/lib/setupSolutions";
import { FloorSettingsPanel } from "./FloorSettingsPanel";
import { PreChatSetupModal } from "./PreChatSetupModal";
import { UserPreferencesPanel } from "./UserPreferencesPanel";
import { ClientFacingPreview } from "./ClientFacingPreview";
import { EndScreenBehaviorPanel } from "./EndScreenBehaviorPanel";
import { WebsiteInstallPanel } from "./WebsiteInstallPanel";
import { StaffOutIntakePanel } from "./StaffOutIntakePanel";

export type ClientFacingSurface = "page" | "chat";

interface ClientFacingPanelProps {
  slug: string;
  surface: ClientFacingSurface;
  space: BusinessSpace;
  settings: FloorSettings;
  members: FloorMember[];
  artifacts: Artifact[];
  onChangeSettings: (settings: FloorSettings) => void;
  onChangeMembers: (members: FloorMember[]) => void;
}

interface TocItem {
  id: string;
  label: string;
}

export function ClientFacingPanel({
  slug,
  surface,
  space,
  settings,
  members,
  artifacts,
  onChangeSettings,
  onChangeMembers,
}: ClientFacingPanelProps) {
  const pageOn = isSolutionEnabled(settings, "preChat");
  const hoursOn = isSolutionEnabled(settings, "hours");
  const introOn = isSolutionEnabled(settings, "intro");
  const shoutoutsOn = isSolutionEnabled(settings, "shoutouts");
  const photosOn = isSolutionEnabled(settings, "chatInterface");
  const sharedOnChat = !pageOn;
  const [active, setActive] = useState<string | null>(null);
  const pinActiveUntil = useRef(0);
  const previewSpace = useMemo<BusinessSpace>(
    () => ({ ...space, settings, members }),
    [space, settings, members],
  );

  const toc = useMemo((): TocItem[] => {
    if (surface === "page") {
      return [
        { id: "cf-share", label: "Share" },
        { id: "cf-look", label: "Logo & banner" },
        { id: "cf-content", label: "Copy & buttons" },
        ...(hoursOn ? [{ id: "cf-hours", label: "Hours" }] : []),
      ];
    }
    return [
      { id: "cf-bubble", label: "Chat Bubble" },
      ...(sharedOnChat ? [{ id: "cf-look", label: "Logo & banner" }] : []),
      ...(sharedOnChat && hoursOn
        ? [{ id: "cf-hours", label: "Hours" }]
        : []),
      ...(introOn ? [{ id: "cf-about", label: "About" }] : []),
      { id: "cf-links", label: "Chat links" },
      ...(introOn
        ? [{ id: "cf-initial-messages", label: "Opening messages" }]
        : []),
      { id: "cf-staff-out", label: "When staff out" },
      { id: "cf-end-screen", label: "End screen behavior" },
      ...(shoutoutsOn ? [{ id: "cf-promos", label: "Promo banners" }] : []),
      ...(photosOn ? [{ id: "cf-photos", label: "Chat photos" }] : []),
    ];
  }, [surface, sharedOnChat, hoursOn, introOn, shoutoutsOn, photosOn]);

  useEffect(() => {
    const root = document.querySelector(".client-facing-editor");
    if (!(root instanceof HTMLElement)) return;
    const editorRoot = root;
    let frame = 0;
    function updateActive() {
      if (Date.now() < pinActiveUntil.current) return;
      const tocEl = editorRoot.querySelector(".client-facing-toc");
      const offset = tocEl instanceof HTMLElement ? tocEl.offsetHeight + 24 : 24;
      const y = editorRoot.scrollTop + offset;
      const current =
        [...toc]
          .map((item) => {
            const el = document.getElementById(item.id);
            return el instanceof HTMLElement
              ? { id: item.id, top: el.offsetTop }
              : null;
          })
          .filter((item): item is { id: string; top: number } => Boolean(item))
          .filter((item) => item.top <= y)
          .sort((a, b) => b.top - a.top)[0]?.id ?? toc[0]?.id ?? null;
      setActive((prev) => (prev === current ? prev : current));
    }
    function onScroll() {
      window.cancelAnimationFrame(frame);
      frame = window.requestAnimationFrame(updateActive);
    }
    updateActive();
    editorRoot.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      window.cancelAnimationFrame(frame);
      editorRoot.removeEventListener("scroll", onScroll);
    };
  }, [toc]);

  function scrollSectionIntoView(id: string) {
    const root = document.querySelector(".client-facing-editor");
    const el = document.getElementById(id);
    if (!(root instanceof HTMLElement) || !el) return;
    const tocEl = root.querySelector(".client-facing-toc");
    const offset = tocEl instanceof HTMLElement ? tocEl.offsetHeight + 8 : 8;
    const delta =
      el.getBoundingClientRect().top -
      root.getBoundingClientRect().top -
      offset;
    root.scrollTop = Math.max(0, root.scrollTop + delta);
  }

  function pinAndScroll(id: string) {
    pinActiveUntil.current = Date.now() + 900;
    scrollSectionIntoView(id);
    setActive(id);
  }

  useEffect(() => {
    const hash = window.location.hash.replace(/^#/, "");
    const root = document.querySelector(".client-facing-editor");
    if (root instanceof HTMLElement && !hash) root.scrollTop = 0;
    if (!hash) return;
    const timer = window.setTimeout(() => {
      if (!document.getElementById(hash)) return;
      pinAndScroll(hash);
    }, 50);
    return () => window.clearTimeout(timer);
  }, [surface]);

  function scrollTo(id: string) {
    pinAndScroll(id);
    window.history.replaceState(null, "", `#${id}`);
  }

  function settingsChunk(tab: "brand" | "hours" | "shoutouts") {
    return (
      <FloorSettingsPanel
        key={`${surface}-${tab}`}
        settings={settings}
        members={members}
        artifacts={artifacts}
        variant="page"
        embed
        activeTab={tab}
        onChangeSettings={onChangeSettings}
        onChangeMembers={onChangeMembers}
        onLogOut={() => undefined}
      />
    );
  }

  function prefChunk(
    section: "intro" | "links" | "chat-interface",
    introMode?: "combined" | "about" | "messages",
  ) {
    return (
      <UserPreferencesPanel
        key={`${surface}-${section}-${introMode ?? "combined"}`}
        slug={slug}
        settings={settings}
        onChangeSettings={onChangeSettings}
        variant="page"
        hideTitle
        section={section}
        introMode={introMode}
      />
    );
  }

  return (
    <div className="client-facing-layout">
      <div className="client-facing-editor dashboard-panel-body is-client-facing">
      <h2 className="dashboard-panel-title">
        {surface === "page" ? "Public Page" : "Live Chat"}
      </h2>
      <p className="floor-settings-help">
        {surface === "page"
          ? "This is the page people hit from your link — before they start a live chat."
          : pageOn
            ? "This is the live conversation after they tap chat. Logo, banner, and hours are set on Public page."
            : "This is the live conversation after they tap chat."}
      </p>

      <nav className="client-facing-toc" aria-label="Jump to section">
        {toc.map((item) => (
          <button
            key={item.id}
            type="button"
            className={active === item.id ? "is-active" : undefined}
            onClick={() => scrollTo(item.id)}
          >
            {item.label}
          </button>
        ))}
      </nav>

      {surface === "page" ? (
        <>
          <section id="cf-share" className="client-facing-section">
            <h3>Share</h3>
            <p className="floor-settings-help">
              This updates live on the right. You can also open it in a new
              tab. To put it on your site, use On your website.
            </p>
            <div className="pre-chat-share">
              <div className="pre-chat-share-actions">
                <Link
                  href={`/${slug}`}
                  className="btn-solid"
                  target="_blank"
                  rel="noreferrer"
                >
                  <IconEye size={16} />
                  Open in new tab
                </Link>
              </div>
            </div>
          </section>

          <section id="cf-look" className="client-facing-section">
            <h3>Logo & banner</h3>
            {settingsChunk("brand")}
          </section>

          <section id="cf-content" className="client-facing-section">
            <h3>Copy & buttons</h3>
            <p className="floor-settings-help">
              Headline, bio, and the buttons on the public page.
            </p>
            <PreChatSetupModal
              variant="page"
              settings={settings}
              onChangeSettings={onChangeSettings}
            />
          </section>

          {hoursOn ? (
            <section id="cf-hours" className="client-facing-section">
              <h3>Hours</h3>
              {settingsChunk("hours")}
            </section>
          ) : null}
        </>
      ) : (
        <>
          <section id="cf-bubble" className="client-facing-section">
            <h3>Chat Bubble</h3>
            <WebsiteInstallPanel
              slug={slug}
              kind="bubble"
              publicPageOn={pageOn}
              embed
            />
          </section>

          {sharedOnChat ? (
            <section id="cf-look" className="client-facing-section">
              <h3>Logo & banner</h3>
              {settingsChunk("brand")}
            </section>
          ) : null}

          {sharedOnChat && hoursOn ? (
            <section id="cf-hours" className="client-facing-section">
              <h3>Hours</h3>
              {settingsChunk("hours")}
            </section>
          ) : null}

          {introOn ? (
            <section id="cf-about" className="client-facing-section">
              <h3>About</h3>
              {prefChunk("intro", "about")}
            </section>
          ) : null}

          <section id="cf-links" className="client-facing-section">
            <h3>Chat links</h3>
            {prefChunk("links")}
          </section>

          {introOn ? (
            <section id="cf-initial-messages" className="client-facing-section">
              <h3>Opening messages</h3>
              {prefChunk("intro", "messages")}
            </section>
          ) : null}

          <section id="cf-staff-out" className="client-facing-section">
            <h3>When staff out</h3>
            <p className="floor-settings-help">
              Guide visitors through a useful after-hours intake instead of a plain email box.
            </p>
            <StaffOutIntakePanel
              settings={settings}
              onChangeSettings={onChangeSettings}
            />
          </section>

          <section id="cf-end-screen" className="client-facing-section">
            <h3>End screen behavior</h3>
            <p className="floor-settings-help">
              Choose what customers see after an employee ends the chat.
            </p>
            <EndScreenBehaviorPanel
              settings={settings}
              onChangeSettings={onChangeSettings}
            />
          </section>

          {shoutoutsOn ? (
            <section id="cf-promos" className="client-facing-section">
              <h3>Promo banners</h3>
              {settingsChunk("shoutouts")}
            </section>
          ) : null}

          {photosOn ? (
            <section id="cf-photos" className="client-facing-section">
              <h3>Chat photos</h3>
              {prefChunk("chat-interface")}
            </section>
          ) : null}
        </>
      )}
      </div>
      <ClientFacingPreview
        slug={slug}
        surface={surface}
        space={previewSpace}
      />
    </div>
  );
}
