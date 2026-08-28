"use client";

import { useEffect, useState } from "react";
import type { FloorSettings, PreChatLink, PreChatLinkKind } from "@/lib/types";
import { DEFAULT_CALL_PHONE, defaultPreChat } from "@/lib/spaceNormalize";
import { IconTrash, IconX } from "@/components/shared/Icons";

const KIND_OPTIONS: { id: PreChatLinkKind; label: string }[] = [
  { id: "chat", label: "Live Chat" },
  { id: "call", label: "Call Us" },
  { id: "url", label: "Link" },
  { id: "email", label: "Email" },
];

interface PreChatSetupModalProps {
  settings: FloorSettings;
  onChangeSettings: (settings: FloorSettings) => void;
  onClose?: () => void;
  variant?: "modal" | "page";
}

export function PreChatSetupModal({
  settings,
  onChangeSettings,
  onClose,
  variant = "modal",
}: PreChatSetupModalProps) {
  const page = settings.preChat ?? defaultPreChat();
  const [headline, setHeadline] = useState(page.headline);
  const [bio, setBio] = useState(page.bio);
  const [links, setLinks] = useState<PreChatLink[]>(page.links);

  useEffect(() => {
    if (variant !== "modal" || !onClose) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose?.();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose, variant]);

  function persist(next: {
    headline?: string;
    bio?: string;
    links?: PreChatLink[];
  }) {
    const headlineValue = next.headline ?? headline;
    const bioValue = next.bio ?? bio;
    const linksValue = next.links ?? links;
    if (next.headline != null) setHeadline(headlineValue);
    if (next.bio != null) setBio(bioValue);
    if (next.links) setLinks(linksValue);
    onChangeSettings({
      ...settings,
      preChat: {
        headline: headlineValue,
        bio: bioValue,
        links: linksValue,
      },
    });
  }

  function patchLink(id: string, partial: Partial<PreChatLink>) {
    persist({
      links: links.map((link) =>
        link.id === id ? { ...link, ...partial } : link,
      ),
    });
  }

  function addLink() {
    persist({
      links: [
        ...links,
        {
          id: `pre-${Date.now().toString(36)}`,
          kind: "url",
          label: "New link",
          enabled: true,
          href: "",
        },
      ],
    });
  }

  function moveLink(index: number, direction: -1 | 1) {
    const next = [...links];
    const swap = index + direction;
    if (swap < 0 || swap >= next.length) return;
    [next[index], next[swap]] = [next[swap], next[index]];
    persist({ links: next });
  }

  const body = (
    <div className="floor-settings-body pre-chat-editor">
      <label className="floor-settings-note">
        <span>Headline</span>
        <input
          value={headline}
          onChange={(e) => persist({ headline: e.target.value })}
          placeholder="Business name"
        />
      </label>
      <label className="floor-settings-note">
        <span>Bio</span>
        <textarea
          value={bio}
          onChange={(e) => persist({ bio: e.target.value })}
          placeholder="A short line about the business"
          rows={3}
        />
      </label>

      <label className="floor-settings-note">
        <span>Phone number</span>
        <input
          type="tel"
          value={links.find((link) => link.kind === "call")?.href ?? ""}
          onChange={(e) => {
            const phone = e.target.value;
            const existing = links.find((link) => link.kind === "call");
            if (existing) {
              patchLink(existing.id, { href: phone });
              return;
            }
            persist({
              links: [
                {
                  id: "pre-call",
                  kind: "call",
                  label: "Call Us",
                  enabled: true,
                  href: phone,
                },
                ...links,
              ],
            });
          }}
          placeholder={DEFAULT_CALL_PHONE}
          autoComplete="tel"
        />
      </label>

      <div className="pre-chat-editor-links">
        <div className="pre-chat-editor-links-head">
          <h3>Buttons</h3>
          <button type="button" className="btn-ghost" onClick={addLink}>
            Add button
          </button>
        </div>
        {links.map((link, index) => (
          <div key={link.id} className="pre-chat-editor-row">
            <label className="pre-chat-editor-enabled">
              <input
                type="checkbox"
                checked={link.enabled}
                onChange={(e) =>
                  patchLink(link.id, { enabled: e.target.checked })
                }
              />
              <span className="sr-only">Show {link.label}</span>
            </label>
            <input
              className="pre-chat-editor-label"
              value={link.label}
              onChange={(e) => patchLink(link.id, { label: e.target.value })}
              placeholder="Label"
            />
            <select
              value={link.kind}
              onChange={(e) =>
                patchLink(link.id, {
                  kind: e.target.value as PreChatLinkKind,
                })
              }
            >
              {KIND_OPTIONS.map((option) => (
                <option key={option.id} value={option.id}>
                  {option.label}
                </option>
              ))}
            </select>
            {link.kind === "chat" ? (
              <p className="pre-chat-editor-hint">Opens live chat</p>
            ) : link.kind === "call" ? (
              <p className="pre-chat-editor-hint">Uses phone number above</p>
            ) : (
              <input
                value={link.href ?? ""}
                onChange={(e) => patchLink(link.id, { href: e.target.value })}
                placeholder={
                  link.kind === "email" ? "hello@email.com" : "https://"
                }
              />
            )}
            <div className="pre-chat-editor-move">
              <button
                type="button"
                className="btn-ghost"
                onClick={() => moveLink(index, -1)}
                disabled={index === 0}
                aria-label="Move up"
              >
                ↑
              </button>
              <button
                type="button"
                className="btn-ghost"
                onClick={() => moveLink(index, 1)}
                disabled={index === links.length - 1}
                aria-label="Move down"
              >
                ↓
              </button>
              <button
                type="button"
                className="btn-ghost icon-btn"
                onClick={() =>
                  persist({
                    links: links.filter((item) => item.id !== link.id),
                  })
                }
                aria-label={`Remove ${link.label}`}
              >
                <IconTrash />
              </button>
            </div>
          </div>
        ))}
      </div>
      <p className="floor-settings-help">
        Call Us stays hidden on the public page until you add a phone number.
        Email and link buttons also need a value. Logo and banner are set in
        Logo & banner above.
      </p>
    </div>
  );

  if (variant === "page") return body;

  return (
    <div className="floor-settings-backdrop" onClick={onClose}>
      <div
        className="floor-settings-modal pre-chat-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="pre-chat-title"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="floor-settings-head">
          <div>
            <h2 id="pre-chat-title">Edit public page</h2>
            <p>
              This is the page people hit from your link — before they start a
              live chat.
            </p>
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
