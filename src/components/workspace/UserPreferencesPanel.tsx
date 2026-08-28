"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import type {
  ChatIntroExtraMessage,
  FloorSettings,
  ProfileLink,
} from "@/lib/types";
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
import {
  IconCheck,
  IconCode,
  IconEye,
  IconTrash,
  IconX,
} from "@/components/shared/Icons";
import { ChatInterfaceSetupModal } from "./ChatInterfaceSetupModal";
import { PreChatSetupModal } from "./PreChatSetupModal";
import { PREF_SECTION_SOLUTION, isSolutionEnabled } from "@/lib/setupSolutions";

export type PrefSection =
  | "sounds"
  | "intro"
  | "links"
  | "chat-interface"
  | "pre-chat";

export const PREF_SECTIONS: { id: PrefSection; label: string }[] = [
  { id: "sounds", label: "Sounds" },
  { id: "intro", label: "About & greeting" },
  { id: "links", label: "Chat links" },
  { id: "chat-interface", label: "Chat photos" },
  { id: "pre-chat", label: "Public page" },
];

export function visiblePrefSections(settings: FloorSettings) {
  return PREF_SECTIONS.filter((item) => {
    const required = PREF_SECTION_SOLUTION[item.id];
    return !required || isSolutionEnabled(settings, required);
  });
}

interface UserPreferencesPanelProps {
  slug: string;
  settings: FloorSettings;
  onChangeSettings: (settings: FloorSettings) => void;
  /** page = dashboard section; embed = stacked inside another page */
  variant?: "modal" | "page";
  hideTitle?: boolean;
  section?: PrefSection;
  introMode?: "combined" | "about" | "messages";
  onClose?: () => void;
}

function newLinkId() {
  return `pl-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
}

function newIntroMessageId() {
  return `im-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
}

export function UserPreferencesPanel({
  slug,
  settings,
  onChangeSettings,
  variant = "modal",
  hideTitle = false,
  section = "sounds",
  introMode = "combined",
  onClose,
}: UserPreferencesPanelProps) {
  const [prefs, setPrefs] = useState<FloorUserPrefs>(() => ({
    newChatSound: "chime",
    activeChatSound: "soft",
  }));
  const [linkLabel, setLinkLabel] = useState("");
  const [linkUrl, setLinkUrl] = useState("");
  const [linkError, setLinkError] = useState<string | null>(null);
  const [origin, setOrigin] = useState("");
  const [widgetCopied, setWidgetCopied] = useState(false);

  useEffect(() => {
    setPrefs(loadFloorPrefs(slug));
  }, [slug]);

  useEffect(() => {
    setOrigin(window.location.origin);
  }, []);

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
        ...chatIntro,
        ...partial,
      },
    });
  }

  function updateExtraIntroMessage(
    id: string,
    partial: Partial<ChatIntroExtraMessage>,
  ) {
    patchIntroMessages({
      extraMessages: chatIntro.extraMessages.map((message) =>
        message.id === id ? { ...message, ...partial } : message,
      ),
    });
  }

  function addExtraIntroMessage() {
    if (chatIntro.extraMessages.length >= 5) return;
    patchIntroMessages({
      extraMessages: [
        ...chatIntro.extraMessages,
        {
          id: newIntroMessageId(),
          body: "",
        },
      ],
    });
  }

  function removeExtraIntroMessage(id: string) {
    patchIntroMessages({
      extraMessages: chatIntro.extraMessages.filter(
        (message) => message.id !== id,
      ),
    });
  }

  function updateContactReasonOption(index: number, label: string) {
    patchIntroMessages({
      contactReasonOptions: chatIntro.contactReasonOptions.map((option, i) =>
        i === index ? label : option,
      ),
    });
  }

  function addContactReasonOption() {
    if (chatIntro.contactReasonOptions.length >= 20) return;
    patchIntroMessages({
      contactReasonOptions: [
        ...chatIntro.contactReasonOptions,
        `Option ${chatIntro.contactReasonOptions.length + 1}`,
      ],
    });
  }

  function removeContactReasonOption(index: number) {
    patchIntroMessages({
      contactReasonOptions: chatIntro.contactReasonOptions.filter(
        (_option, i) => i !== index,
      ),
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
  const showAboutEditor = introMode === "combined" || introMode === "about";
  const showMessageEditor =
    introMode === "combined" || introMode === "messages";
  const widgetSnippet = origin
    ? `<script src="${origin}/widget.js" data-slug="${slug}" async></script>`
    : `<script src="/widget.js" data-slug="${slug}" async></script>`;

  async function copyWidgetSnippet() {
    try {
      await navigator.clipboard.writeText(widgetSnippet);
      setWidgetCopied(true);
      window.setTimeout(() => setWidgetCopied(false), 1600);
    } catch {
      /* clipboard can be blocked in some browsers */
    }
  }

  const body = (
    <div
      className={
        variant === "page" && !hideTitle
          ? "dashboard-panel-body"
          : variant === "page"
            ? undefined
            : "floor-settings-body"
      }
    >
      {show("sounds") ? (
        <section className="floor-settings-section">
          {variant === "page" && !hideTitle ? (
            <h2 className="dashboard-panel-title">Sounds</h2>
          ) : variant === "page" ? null : (
            <h3>Sounds</h3>
          )}
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
          {showAboutEditor ? (
            <>
              {variant === "page" && !hideTitle ? (
                <h2 className="dashboard-panel-title">About</h2>
              ) : variant === "page" ? null : (
                <h3>About</h3>
              )}
              <p className="floor-settings-help">
                Short bio under your business name on the customer chat.
              </p>
              <label className="floor-settings-note">
                <span className="sr-only">About</span>
                <textarea
                  rows={4}
                  value={settings.intro ?? ""}
                  onChange={(e) =>
                    patch({ intro: e.target.value.slice(0, 500) })
                  }
                  placeholder="Who you are, what you offer, how to book…"
                  maxLength={500}
                />
              </label>
              <p className="editor-hint">
                {(settings.intro ?? "").length}/500
              </p>
            </>
          ) : null}

          {showMessageEditor ? (
            <div className="opening-messages-editor">
              {variant === "page" && !hideTitle ? (
                <h2 className="dashboard-panel-title">Opening messages</h2>
              ) : variant === "page" ? null : (
                <h3>Opening messages</h3>
              )}
              <p className="floor-settings-help">
                Build the automated sequence customers see before they type.
              </p>

              <div className="opening-message-card">
                <div className="opening-message-head">
                  <div>
                    <strong>Welcome</strong>
                    <span>First message in the chat</span>
                  </div>
                </div>
                <label className="floor-settings-note">
                  <span className="sr-only">Welcome message</span>
                  <textarea
                    rows={5}
                    value={chatIntro.welcome}
                    onChange={(e) =>
                      patchIntroMessages({
                        welcome: e.target.value.slice(0, 2000),
                      })
                    }
                    placeholder="Greeting when a customer opens chat…"
                    maxLength={2000}
                  />
                </label>
                <p className="editor-hint">{chatIntro.welcome.length}/2000</p>
              </div>

              <div className="opening-message-card">
                <div className="opening-message-head">
                  <div>
                    <strong>Follow-up</strong>
                    <span>Optional second nudge or promo</span>
                  </div>
                </div>
                <label className="floor-settings-note">
                  <span className="sr-only">Follow-up message</span>
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
                <p className="editor-hint">
                  {chatIntro.promoFollowUp.length}/500
                </p>
              </div>

              {chatIntro.extraMessages.map((message, index) => (
                <div key={message.id} className="opening-message-card">
                  <div className="opening-message-head">
                    <div>
                      <strong>Custom message {index + 1}</strong>
                      <span>Extra text in the opening sequence</span>
                    </div>
                    <button
                      type="button"
                      className="floor-banner-remove icon-btn"
                      onClick={() => removeExtraIntroMessage(message.id)}
                      aria-label={`Remove custom message ${index + 1}`}
                      title="Remove"
                    >
                      <IconTrash size={13} />
                    </button>
                  </div>
                  <label className="floor-settings-note">
                    <span className="sr-only">Custom message</span>
                    <textarea
                      rows={2}
                      value={message.body}
                      onChange={(e) =>
                        updateExtraIntroMessage(message.id, {
                          body: e.target.value.slice(0, 500),
                        })
                      }
                      placeholder="Add another helpful message…"
                      maxLength={500}
                    />
                  </label>
                  <p className="editor-hint">{message.body.length}/500</p>
                </div>
              ))}

              <button
                type="button"
                className="btn-ghost opening-message-add"
                onClick={addExtraIntroMessage}
                disabled={chatIntro.extraMessages.length >= 5}
              >
                Add another message
              </button>

              <div className="opening-message-card">
                <div className="opening-message-head">
                  <div>
                    <strong>Contact reason dropdown</strong>
                    <span>
                      Ask why they are reaching out, then show editable choices
                    </span>
                  </div>
                  <label className="prefs-toggle">
                    <input
                      type="checkbox"
                      checked={chatIntro.specialtiesEnabled}
                      onChange={(e) =>
                        patchIntroMessages({
                          specialtiesEnabled: e.target.checked,
                        })
                      }
                    />
                    <span>{chatIntro.specialtiesEnabled ? "On" : "Off"}</span>
                  </label>
                </div>
                <div className="opening-specialties-fields">
                  <label className="floor-settings-note">
                    <span>Message text</span>
                    <input
                      type="text"
                      value={chatIntro.specialtiesPrompt}
                      onChange={(e) =>
                        patchIntroMessages({
                          specialtiesPrompt: e.target.value.slice(0, 120),
                        })
                      }
                      placeholder="Are you reaching out for:"
                      maxLength={120}
                    />
                  </label>
                  <div className="floor-settings-note">
                    <span>Display style</span>
                    <div className="contact-reason-style-switch">
                      {(["dropdown", "list"] as const).map((mode) => (
                        <button
                          key={mode}
                          type="button"
                          className={
                            chatIntro.contactReasonDisplay === mode
                              ? "is-active"
                              : undefined
                          }
                          onClick={() =>
                            patchIntroMessages({
                              contactReasonDisplay: mode,
                            })
                          }
                        >
                          {mode === "dropdown" ? "Dropdown" : "List"}
                        </button>
                      ))}
                    </div>
                  </div>
                  {chatIntro.contactReasonDisplay === "dropdown" ? (
                    <label className="floor-settings-note">
                      <span>Dropdown button label</span>
                      <input
                        type="text"
                        value={chatIntro.specialtiesLabel}
                        onChange={(e) =>
                          patchIntroMessages({
                            specialtiesLabel: e.target.value.slice(0, 40),
                          })
                        }
                        placeholder="Select a reason"
                        maxLength={40}
                      />
                    </label>
                  ) : null}
                </div>
                <div className="contact-reason-options">
                  <div className="contact-reason-options-head">
                    <strong>Dropdown choices</strong>
                    <span>Edit what customers can pick from.</span>
                  </div>
                  <div className="contact-reason-options-grid">
                    {chatIntro.contactReasonOptions.map((option, index) => (
                      <label
                        key={index}
                        className="contact-reason-option"
                      >
                        <span>{index + 1}</span>
                        <input
                          type="text"
                          value={option}
                          onChange={(e) =>
                            updateContactReasonOption(
                              index,
                              e.target.value.slice(0, 80),
                            )
                          }
                          placeholder={`Option ${index + 1}`}
                          maxLength={80}
                        />
                        <button
                          type="button"
                          className="floor-banner-remove icon-btn"
                          onClick={() => removeContactReasonOption(index)}
                          aria-label={`Remove dropdown choice ${index + 1}`}
                          title="Remove"
                          disabled={chatIntro.contactReasonOptions.length <= 1}
                        >
                          <IconTrash size={13} />
                        </button>
                      </label>
                    ))}
                  </div>
                  <button
                    type="button"
                    className="btn-ghost opening-message-add"
                    onClick={addContactReasonOption}
                    disabled={chatIntro.contactReasonOptions.length >= 20}
                  >
                    Add dropdown choice
                  </button>
                </div>
              </div>

              <div className="opening-message-card">
                <div className="opening-message-head">
                  <div>
                    <strong>Reopen chat link</strong>
                    <span>Show a return link if someone disconnects</span>
                  </div>
                  <label className="prefs-toggle">
                    <input
                      type="checkbox"
                      checked={chatIntro.reconnectEnabled}
                      onChange={(e) =>
                        patchIntroMessages({
                          reconnectEnabled: e.target.checked,
                        })
                      }
                    />
                    <span>{chatIntro.reconnectEnabled ? "On" : "Off"}</span>
                  </label>
                </div>
                {chatIntro.reconnectEnabled ? (
                  <>
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
                    <p className="editor-hint">
                      {chatIntro.reconnectCopy.length}/300
                    </p>
                  </>
                ) : null}
              </div>
            </div>
          ) : null}
        </section>
      ) : null}

      {show("links") ? (
        <section className="floor-settings-section">
          {variant === "page" && !hideTitle ? (
            <h2 className="dashboard-panel-title">Chat links</h2>
          ) : variant === "page" ? null : (
            <h3>Chat links</h3>
          )}
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
          {variant === "page" && !hideTitle ? (
            <h2 className="dashboard-panel-title">Chat photos</h2>
          ) : variant === "page" ? null : (
            <h3>Chat photos</h3>
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
          {variant === "page" && !hideTitle ? (
            <h2 className="dashboard-panel-title">Public page</h2>
          ) : variant === "page" ? null : (
            <h3>Public page</h3>
          )}
          {hideTitle ? null : (
          <p className="floor-settings-help">
            This is the page people hit from your public link before they start
            a live chat.
          </p>
          )}
          <div className="pre-chat-share">
            <div className="pre-chat-share-actions">
              <Link
                href={`/${slug}`}
                className="btn-solid"
                target="_blank"
                rel="noreferrer"
              >
                <IconEye size={16} />
                Preview page
              </Link>
              <a
                className="btn-ghost"
                href={`/${slug}/embed`}
                target="_blank"
                rel="noreferrer"
              >
                Preview embed
              </a>
            </div>
            <div className="pre-chat-widget">
              <p className="pre-chat-widget-label">
                <IconCode size={15} />
                Website widget
              </p>
              <p className="floor-settings-help">
                Paste this on your store site — a chat bubble appears in the
                corner, same inbox as the link.
              </p>
              <pre className="widget-snippet-code">
                <code>{widgetSnippet}</code>
              </pre>
              <div className="widget-snippet-actions">
                <button
                  type="button"
                  className="btn-solid"
                  onClick={() => void copyWidgetSnippet()}
                >
                  {widgetCopied ? (
                    <>
                      <IconCheck size={14} /> Copied
                    </>
                  ) : (
                    "Copy snippet"
                  )}
                </button>
              </div>
            </div>
          </div>
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
