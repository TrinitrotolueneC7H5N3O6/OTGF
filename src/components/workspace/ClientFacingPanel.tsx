"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import type { Artifact, BusinessSpace, FloorMember, FloorSettings } from "@/lib/types";
import {
  IconCheck,
  IconCode,
  IconEye,
} from "@/components/shared/Icons";
import { isSolutionEnabled } from "@/lib/setupSolutions";
import { FloorSettingsPanel } from "./FloorSettingsPanel";
import { PreChatSetupModal } from "./PreChatSetupModal";
import { UserPreferencesPanel } from "./UserPreferencesPanel";
import { ClientFacingPreview } from "./ClientFacingPreview";
import { EndScreenBehaviorPanel } from "./EndScreenBehaviorPanel";
import { StaffOutIntakePanel } from "./StaffOutIntakePanel";
import { SettingsEditorHeader } from "./SettingsEditorHeader";
import { SurfaceActionToggles } from "./SurfaceActionToggles";

export type ClientFacingSurface = "page" | "chat" | "widget";

interface ClientFacingPanelProps {
  slug: string;
  surface: ClientFacingSurface;
  space: BusinessSpace;
  settings: FloorSettings;
  members: FloorMember[];
  artifacts: Artifact[];
  onChangeSettings: (settings: FloorSettings) => void;
  onChangeMembers: (members: FloorMember[]) => void;
  hideTitle?: boolean;
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
  const hoursOn = isSolutionEnabled(settings, "hours");
  const introOn = isSolutionEnabled(settings, "intro");
  const shoutoutsOn = isSolutionEnabled(settings, "shoutouts");
  const [active, setActive] = useState<string | null>(() =>
    surface === "chat"
      ? isSolutionEnabled(settings, "intro")
        ? "cf-initial-messages"
        : "cf-end-screen"
      : null,
  );
  const [copied, setCopied] = useState(false);
  const pinActiveUntil = useRef(0);
  const previewSpace = useMemo<BusinessSpace>(
    () => ({ ...space, settings, members }),
    [space, settings, members],
  );
  const origin =
    typeof window === "undefined" ? "" : window.location.origin;
  const pageUrl = `${origin}/${slug}`;
  const snippet = `<script src="${origin}/widget.js" data-slug="${slug}" async></script>`;
  const previewHref = `/widget-demo.html?slug=${encodeURIComponent(slug)}`;
  const isPresence = surface === "page" || surface === "widget";
  const isTabbed = surface === "chat";

  const toc = useMemo((): TocItem[] => {
    if (isPresence) return [
      { id: "cf-share", label: "Share" },
      { id: "cf-contact", label: "Call, text & email" },
      { id: "cf-actions", label: "Tools" },
      ...(surface === "page" ? [{ id: "cf-look", label: "Look" }, ...(hoursOn ? [{ id: "cf-hours", label: "Hours" }] : [])] : []),
    ];
    return [
      ...(introOn
        ? [{ id: "cf-initial-messages", label: "Open Screen" }]
        : []),
      { id: "cf-end-screen", label: "End Screen" },
      { id: "cf-staff-out", label: "After Hours Screen" },
      { id: "cf-links", label: "Link Displays" },
      ...(shoutoutsOn ? [{ id: "cf-promos", label: "Banner Displays" }] : []),
      { id: "cf-sounds", label: "Sounds" },
    ];
  }, [isPresence, surface, hoursOn, introOn, shoutoutsOn]);

  useEffect(() => {
    if (isTabbed || toc.length === 0) return;
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
  }, [toc, isTabbed]);

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
    if (isTabbed) {
      const match = toc.find((item) => item.id === hash)?.id ?? toc[0]?.id ?? null;
      setActive(match);
      return;
    }
    const root = document.querySelector(".client-facing-editor");
    if (root instanceof HTMLElement && !hash) root.scrollTop = 0;
    if (!hash) return;
    const timer = window.setTimeout(() => {
      if (!document.getElementById(hash)) return;
      pinAndScroll(hash);
    }, 50);
    return () => window.clearTimeout(timer);
  }, [surface, isTabbed, toc]);

  function selectSection(id: string) {
    setActive(id);
    window.history.replaceState(null, "", `#${id}`);
    if (!isTabbed) pinAndScroll(id);
  }

  async function copyText(value: string) {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      /* clipboard can be blocked */
    }
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
    section: "intro" | "links" | "chat-interface" | "sounds",
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

  const shareCode = surface === "widget" ? snippet : pageUrl;
  const actionSurface = surface === "widget" ? "widget" : "page";

  return (
    <div className={`client-facing-layout${surface === "chat" ? " is-live-chat" : ""}`}>
      <div className="client-facing-editor dashboard-panel-body is-client-facing">
      <div className={surface === "chat" ? "client-facing-stack" : "client-facing-stack-passthrough"}>
      <SettingsEditorHeader
        title={surface === "page" ? "Front Desk" : surface === "widget" ? "Widget" : "Live Chat"}
        description={surface === "page" ? "Customize your page, choose customer actions, and share your link." : surface === "widget" ? "Customize your website widget, choose customer actions, and install it on your site." : "Customize your chat, notification sounds, opening messages, and follow-up experience."}
      />

      {toc.length > 0 ? (
        <nav className="client-facing-toc" aria-label={isTabbed ? "Live Chat sections" : "Jump to section"}>
          {toc.map((item) => (
            <button
              key={item.id}
              type="button"
              className={active === item.id ? "is-active" : undefined}
              onClick={() => selectSection(item.id)}
            >
              {item.label}
            </button>
          ))}
        </nav>
      ) : null}
      </div>

      {isPresence ? (
        <>
          <section id="cf-share" className="client-facing-section">
            <h3>Share</h3>
            <div className="pre-chat-share website-install-card">
              <div className="pre-chat-widget">
                <p className="pre-chat-widget-label">
                  <IconCode size={15} />
                  {surface === "widget"
                    ? "Paste this on your website"
                    : "Send people this link"}
                </p>
                <pre className="widget-snippet-code">
                  <code>{shareCode}</code>
                </pre>
                <div className="widget-snippet-actions">
                  {surface === "widget" ? (
                    <a
                      className="btn-ghost"
                      href={previewHref}
                      target="_blank"
                      rel="noreferrer"
                    >
                      <IconEye size={16} />
                      Open sample site
                    </a>
                  ) : (
                    <Link
                      href={`/${slug}`}
                      className="btn-ghost"
                      target="_blank"
                      rel="noreferrer"
                    >
                      <IconEye size={16} />
                      Open in new tab
                    </Link>
                  )}
                  <button
                    type="button"
                    className="btn-solid"
                    onClick={() => void copyText(shareCode)}
                  >
                    {copied ? (
                      <>
                        <IconCheck size={14} /> Copied
                      </>
                    ) : surface === "widget" ? (
                      "Copy snippet"
                    ) : (
                      "Copy link"
                    )}
                  </button>
                </div>
              </div>
            </div>
          </section>

          <section id="cf-contact" className="client-facing-section">
            <h3>Call, text & email</h3>
            <SurfaceActionToggles
              slug={slug}
              settings={settings}
              onChangeSettings={onChangeSettings}
              surface={actionSurface}
              group="contacts"
            />
          </section>

          <section id="cf-actions" className="client-facing-section">
            <h3>Tools</h3>
            <SurfaceActionToggles
              slug={slug}
              settings={settings}
              onChangeSettings={onChangeSettings}
              surface={actionSurface}
              group="tools"
            />
          </section>

          {surface === "page" ? (
            <>
              <section id="cf-look" className="client-facing-section">
                <h3>Look</h3>
                {settingsChunk("brand")}
                <p className="floor-settings-help">Headline and bio.</p>
                <PreChatSetupModal
                  variant="page"
                  hideButtons
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
          ) : null}
        </>
      ) : (
        <>
          {introOn ? (
            <section
              id="cf-initial-messages"
              className="client-facing-section"
              hidden={active !== "cf-initial-messages"}
            >
              <h3>Open Screen</h3>
              {prefChunk("intro", "messages")}
            </section>
          ) : null}

          <section
            id="cf-end-screen"
            className="client-facing-section"
            hidden={active !== "cf-end-screen"}
          >
            <h3>End Screen</h3>
            <p className="floor-settings-help">
              Choose what customers see after an employee ends the chat.
            </p>
            <EndScreenBehaviorPanel
              settings={settings}
              onChangeSettings={onChangeSettings}
            />
          </section>

          <section
            id="cf-staff-out"
            className="client-facing-section"
            hidden={active !== "cf-staff-out"}
          >
            <h3>After Hours Screen</h3>
            <p className="floor-settings-help">
              Guide visitors through a useful after-hours intake instead of a plain email box.
            </p>
            <StaffOutIntakePanel
              settings={settings}
              onChangeSettings={onChangeSettings}
            />
          </section>

          <section
            id="cf-links"
            className="client-facing-section"
            hidden={active !== "cf-links"}
          >
            <h3>Link Displays</h3>
            {prefChunk("links")}
          </section>

          {shoutoutsOn ? (
            <section
              id="cf-promos"
              className="client-facing-section"
              hidden={active !== "cf-promos"}
            >
              <h3>Banner Displays</h3>
              {settingsChunk("shoutouts")}
            </section>
          ) : null}

          <section
            id="cf-sounds"
            className="client-facing-section"
            hidden={active !== "cf-sounds"}
          >
            <h3>Sounds</h3>
            {prefChunk("sounds")}
          </section>
        </>
      )}
      </div>
      <ClientFacingPreview
        key={surface}
        slug={slug}
        surface={surface}
        space={previewSpace}
      />
    </div>
  );
}
