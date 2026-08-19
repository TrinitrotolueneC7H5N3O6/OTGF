"use client";

import { useEffect, useState } from "react";
import type { FloorSettings, ProfileLink } from "@/lib/types";
import { resolveChatIntroMessages } from "@/lib/chatIntroMessages";
import {
  ACTIVE_CHAT_SOUND_OPTIONS,
  loadFloorPrefs,
  NEW_CHAT_SOUND_OPTIONS,
  playActiveChatSound,
  playNewChatSound,
  saveFloorPrefs,
  type ActiveChatSound,
  type FloorUserPrefs,
  type NewChatSound,
} from "@/lib/floorPrefs";
import { IconTrash, IconX } from "@/components/shared/Icons";
import { ChatInterfaceSetupModal } from "./ChatInterfaceSetupModal";
import { PreChatSetupModal } from "./PreChatSetupModal";

export type PrefSection =
  | "sounds"
  | "intro"
  | "links"
  | "chat-interface"
  | "pre-chat";

export const PREF_SECTIONS: { id: PrefSection; label: string }[] = [
  { id: "sounds", label: "Sounds" },
  { id: "intro", label: "Intro" },
  { id: "links", label: "Links" },
  { id: "chat-interface", label: "Chat interface" },
  { id: "pre-chat", label: "Pre-chat page" },
];

interface UserPreferencesPanelProps {
  slug: string;
  settings: FloorSettings;
  onChangeSettings: (settings: FloorSettings) => void;
  /** modal = dialog overlay; page = dashboard inline section */
  variant?: "modal" | "page";
  section?: PrefSection;
  onClose?: () => void;
}

function newLinkId() {
  return `pl-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
}

export function UserPreferencesPanel({
  slug,
  settings,
  onChangeSettings,
  variant = "modal",
  section = "sounds",
  onClose,
}: UserPreferencesPanelProps) {
  const [prefs, setPrefs] = useState<FloorUserPrefs>(() => ({
    newChatSound: "chime",
    activeChatSound: "soft",
  }));
  const [linkLabel, setLinkLabel] = useState("");
  const [linkUrl, setLinkUrl] = useState("");
  const [linkError, setLinkError] = useState<string | null>(null);

  useEffect(() => {
    setPrefs(loadFloorPrefs(slug));
  }, [slug]);

  useEffect(() => {
    if (variant !== "modal" || !onClose) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose?.();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [variant, onClose]);

  function updatePrefs(next: FloorUserPrefs) {
    setPrefs(next);
    saveFloorPrefs(slug, next);
  }

  function patch(partial: Partial<FloorSettings>) {
    onChangeSettings({ ...settings, ...partial });
  }

  function patchIntroMessages(
    partial: Partial<NonNullable<FloorSettings["chatIntroMessages"]>>,
  ) {
    patch({
      chatIntroMessages: {
        ...(settings.chatIntroMessages ?? {
          welcome: "",
          promoFollowUp: "",
          specialtiesLabel: "Specialties",
          reconnectCopy: "",
        }),
        ...partial,
      },
    });
  }

  function addLink() {
    setLinkError(null);
    const label = linkLabel.trim();
    let url = linkUrl.trim();
    if (!label || !url) {
      setLinkError("Add a label and URL.");
      return;
    }
    if (!/^https?:\/\//i.test(url)) url = `https://${url}`;
    try {
      new URL(url);
    } catch {
      setLinkError("Enter a valid URL.");
      return;
    }
    const links = settings.profileLinks ?? [];
    if (links.length >= 8) {
      setLinkError("Up to 8 links.");
      return;
    }
    const next: ProfileLink = {
      id: newLinkId(),
      label: label.slice(0, 40),
      url,
    };
    patch({ profileLinks: [...links, next] });
    setLinkLabel("");
    setLinkUrl("");
  }

  function updateLink(id: string, partial: Partial<ProfileLink>) {
    patch({
      profileLinks: (settings.profileLinks ?? []).map((l) =>
        l.id === id ? { ...l, ...partial } : l,
      ),
    });
  }

  function removeLink(id: string) {
    patch({
      profileLinks: (settings.profileLinks ?? []).filter((l) => l.id !== id),
    });
  }

  const links = settings.profileLinks ?? [];
  const chatIntro = resolveChatIntroMessages(settings);
  const showAll = variant === "modal";
  const show = (id: PrefSection) => showAll || section === id;

  const body = (
    <div className={variant === "page" ? "dashboard-panel-body" : "floor-settings-body"}>
      {show("sounds") ? (
        <section className="floor-settings-section">
          {variant === "page" ? <h2 className="dashboard-panel-title">Sounds</h2> : <h3>Sounds</h3>}
          <p className="floor-settings-help">
            Stays on this device. Preview with the buttons — browsers may mute
            until you interact once.
          </p>

          <label className="floor-settings-note">
            <span>New chat comes in</span>
            <div className="prefs-sound-row">
              <select
                value={prefs.newChatSound}
                onChange={(e) => {
                  const newChatSound = e.target.value as NewChatSound;
                  updatePrefs({ ...prefs, newChatSound });
                  playNewChatSound(newChatSound);
                }}
              >
                {NEW_CHAT_SOUND_OPTIONS.map((opt) => (
                  <option key={opt.id} value={opt.id}>
                    {opt.label}
                  </option>
                ))}
              </select>
              <button
                type="button"
                className="btn-ghost"
                onClick={() => playNewChatSound(prefs.newChatSound)}
                disabled={prefs.newChatSound === "off"}
              >
                Preview
              </button>
            </div>
          </label>

          <label className="floor-settings-note">
            <span>Current chat sends a new message</span>
            <div className="prefs-sound-row">
              <select
                value={prefs.activeChatSound}
                onChange={(e) => {
                  const activeChatSound = e.target.value as ActiveChatSound;
                  updatePrefs({ ...prefs, activeChatSound });
                  playActiveChatSound(activeChatSound);
                }}
              >
                {ACTIVE_CHAT_SOUND_OPTIONS.map((opt) => (
                  <option key={opt.id} value={opt.id}>
                    {opt.label}
                  </option>
                ))}
              </select>
              <button
                type="button"
                className="btn-ghost"
                onClick={() => playActiveChatSound(prefs.activeChatSound)}
                disabled={prefs.activeChatSound === "off"}
              >
                Preview
              </button>
            </div>
          </label>
        </section>
      ) : null}

      {show("intro") ? (
        <section className="floor-settings-section">
          {variant === "page" ? <h2 className="dashboard-panel-title">Intro</h2> : <h3>Intro</h3>}
          <p className="floor-settings-help">
            Short bio under your name on the customer chat — like a YouTube
            channel about section.
          </p>
          <label className="floor-settings-note">
            <span className="sr-only">Intro</span>
            <textarea
              rows={4}
              value={settings.intro ?? ""}
              onChange={(e) => patch({ intro: e.target.value.slice(0, 500) })}
              placeholder="Who you are, what you offer, how to book…"
              maxLength={500}
            />
          </label>
          <p className="editor-hint">{(settings.intro ?? "").length}/500</p>

          <h3 className="prefs-subhead">Chat intro messages</h3>
          <p className="floor-settings-help">
            These are the first messages customers see when they open chat —
            before they type anything.
          </p>

          <label className="floor-settings-note">
            <span>Welcome message</span>
            <textarea
              rows={5}
              value={chatIntro.welcome}
              onChange={(e) =>
                patchIntroMessages({ welcome: e.target.value.slice(0, 2000) })
              }
              placeholder="Greeting when a customer opens chat…"
              maxLength={2000}
            />
          </label>
          <p className="editor-hint">{chatIntro.welcome.length}/2000</p>

          <label className="floor-settings-note">
            <span>Promo follow-up</span>
            <textarea
              rows={2}
              value={chatIntro.promoFollowUp}
              onChange={(e) =>
                patchIntroMessages({
                  promoFollowUp: e.target.value.slice(0, 500),
                })
              }
              placeholder="Shown right after the welcome…"
              maxLength={500}
            />
          </label>
          <p className="editor-hint">{chatIntro.promoFollowUp.length}/500</p>

          <label className="floor-settings-note">
            <span>Specialties button label</span>
            <input
              type="text"
              value={chatIntro.specialtiesLabel}
              onChange={(e) =>
                patchIntroMessages({
                  specialtiesLabel: e.target.value.slice(0, 40),
                })
              }
              placeholder="Specialties"
              maxLength={40}
            />
          </label>

          <label className="floor-settings-note">
            <span>Reconnect message</span>
            <textarea
              rows={2}
              value={chatIntro.reconnectCopy}
              onChange={(e) =>
                patchIntroMessages({
                  reconnectCopy: e.target.value.slice(0, 300),
                })
              }
              placeholder="Copy above the unique chat return link…"
              maxLength={300}
            />
          </label>
          <p className="editor-hint">{chatIntro.reconnectCopy.length}/300</p>
        </section>
      ) : null}

      {show("links") ? (
        <section className="floor-settings-section">
          {variant === "page" ? <h2 className="dashboard-panel-title">Links</h2> : <h3>Links</h3>}
          <p className="floor-settings-help">
            Buttons under your intro (Instagram, booking site, menu, etc.).
          </p>

          <ul className="prefs-link-list">
            {links.map((link) => (
              <li key={link.id} className="prefs-link-item">
                <input
                  value={link.label}
                  onChange={(e) =>
                    updateLink(link.id, {
                      label: e.target.value.slice(0, 40),
                    })
                  }
                  aria-label="Link label"
                  placeholder="Label"
                />
                <input
                  value={link.url}
                  onChange={(e) =>
                    updateLink(link.id, { url: e.target.value })
                  }
                  aria-label="Link URL"
                  placeholder="https://"
                />
                <button
                  type="button"
                  className="floor-banner-remove icon-btn"
                  onClick={() => removeLink(link.id)}
                  aria-label={`Remove ${link.label}`}
                  title="Remove"
                >
                  <IconTrash size={13} />
                </button>
              </li>
            ))}
          </ul>

          {links.length < 8 ? (
            <div className="prefs-link-add">
              <input
                value={linkLabel}
                onChange={(e) => setLinkLabel(e.target.value)}
                placeholder="Label"
                aria-label="New link label"
              />
              <input
                value={linkUrl}
                onChange={(e) => {
                  setLinkUrl(e.target.value);
                  setLinkError(null);
                }}
                placeholder="https://…"
                aria-label="New link URL"
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    addLink();
                  }
                }}
              />
              <button type="button" className="btn-solid" onClick={addLink}>
                Add
              </button>
            </div>
          ) : null}
          {linkError ? <p className="editor-error">{linkError}</p> : null}
        </section>
      ) : null}

      {show("chat-interface") ? (
        <section className="floor-settings-section">
          {variant === "page" ? (
            <h2 className="dashboard-panel-title">Set up chat interface</h2>
          ) : (
            <h3>Set up chat interface</h3>
          )}
          <p className="floor-settings-help">
            Pick up to 6 photos. They appear as a carousel at the bottom of
            customer chat as soon as it opens.
          </p>
          <ChatInterfaceSetupModal
            variant="page"
            settings={settings}
            onChangeSettings={onChangeSettings}
          />
        </section>
      ) : null}

      {show("pre-chat") ? (
        <section className="floor-settings-section">
          {variant === "page" ? (
            <h2 className="dashboard-panel-title">Edit pre-chat page</h2>
          ) : (
            <h3>Edit pre-chat page</h3>
          )}
          <p className="floor-settings-help">
            This Linktree-style page is what people see at your public link
            before they start a live chat.
          </p>
          <PreChatSetupModal
            variant="page"
            settings={settings}
            onChangeSettings={onChangeSettings}
          />
        </section>
      ) : null}
    </div>
  );

  if (variant === "page") return body;

  return (
    <div className="floor-settings-backdrop" onClick={onClose}>
      <div
        className="floor-settings-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="user-prefs-title"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="floor-settings-head">
          <div>
            <h2 id="user-prefs-title">User Preferences</h2>
            <p>Sounds for you on the floor, plus your public intro and links.</p>
          </div>
          <button
            type="button"
            className="btn-ghost icon-btn"
            onClick={onClose}
            aria-label="Close"
            title="Close"
          >
            <IconX />
          </button>
        </header>
        {body}
      </div>
    </div>
  );
}
