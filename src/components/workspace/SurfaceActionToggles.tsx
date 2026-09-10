"use client";

import { useMemo, useState } from "react";
import type { FloorSettings, PreChatLink } from "@/lib/types";
import {
  CONTACT_LINK_IDS,
  DEFAULT_CALL_PHONE,
  defaultPreChat,
} from "@/lib/spaceNormalize";
import { IconTrash } from "@/components/shared/Icons";
import {
  isContactLink,
  isPublicActionEnabled,
  publicActionFromLink,
} from "@/lib/toolPublic";

function chatLinkFrom(links: PreChatLink[]) {
  return links.find((link) => link.kind === "chat" || link.id === "pre-live-chat");
}

function contactFrom(links: PreChatLink[], id: (typeof CONTACT_LINK_IDS)[number]) {
  return links.find((link) => link.id === id);
}

function isSimpleLink(link: PreChatLink) {
  return link.kind === "url" && !link.quickBuild;
}

function normalizeLinkUrl(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const candidate = /^https?:\/\//i.test(trimmed)
    ? trimmed
    : `https://${trimmed}`;
  try {
    return new URL(candidate).toString();
  } catch {
    return null;
  }
}

function ToggleList({
  items,
  onToggle,
  onRemove,
}: {
  items: { id: string; label: string; blurb: string; on: boolean; removable?: boolean }[];
  onToggle: (id: string) => void;
  onRemove?: (id: string) => void;
}) {
  return (
    <div className="widget-add-list">
      {items.map((item) =>
        item.removable && onRemove ? (
          <div
            key={item.id}
            className={`components-toggle-row${item.on ? " is-on" : ""}`}
          >
            <button
              type="button"
              className="components-toggle-copy"
              role="switch"
              aria-checked={item.on}
              aria-label={item.label}
              onClick={() => onToggle(item.id)}
            >
              <strong>{item.label}</strong>
              <em>{item.blurb}</em>
            </button>
            <span
              className={`components-switch${item.on ? " is-on" : ""}`}
              aria-hidden
            />
            <button
              type="button"
              className="btn-ghost icon-btn"
              aria-label={`Remove ${item.label}`}
              onClick={() => onRemove(item.id)}
            >
              <IconTrash size={14} />
            </button>
          </div>
        ) : (
          <button
            key={item.id}
            type="button"
            className={`components-toggle-row${item.on ? " is-on" : ""}`}
            role="switch"
            aria-checked={item.on}
            aria-label={item.label}
            onClick={() => onToggle(item.id)}
          >
            <span className="components-toggle-copy">
              <strong>{item.label}</strong>
              <em>{item.blurb}</em>
            </span>
            <span
              className={`components-switch${item.on ? " is-on" : ""}`}
              aria-hidden
            />
          </button>
        ),
      )}
    </div>
  );
}

export function SurfaceActionToggles({
  settings,
  onChangeSettings,
  surface,
  group,
}: {
  slug: string;
  settings: FloorSettings;
  onChangeSettings: (settings: FloorSettings) => void;
  surface: "page" | "widget";
  group: "contacts" | "tools";
}) {
  const page = settings.preChat ?? defaultPreChat();
  const chatOn = isPublicActionEnabled(settings, "chat");
  const chatLink = chatLinkFrom(page.links);
  const onPage = surface === "page";
  const callLink = contactFrom(page.links, "pre-call");
  const smsLink = contactFrom(page.links, "pre-sms");
  const emailLink = contactFrom(page.links, "pre-email");
  const phone = callLink?.href?.trim() || smsLink?.href?.trim() || "";
  const email = emailLink?.href?.trim() || "";
  const [linkLabel, setLinkLabel] = useState("");
  const [linkHref, setLinkHref] = useState("");
  const [linkError, setLinkError] = useState<string | null>(null);

  const contactItems = useMemo(
    () =>
      CONTACT_LINK_IDS.map((id) => {
        const link = contactFrom(page.links, id);
        const labels = {
          "pre-call": { label: "Call", blurb: "Starts a phone call." },
          "pre-sms": { label: "Text", blurb: "Opens a text message." },
          "pre-email": { label: "Email", blurb: "Opens a new email." },
        } as const;
        return {
          id,
          label: link?.label.trim() || labels[id].label,
          blurb: labels[id].blurb,
          on: onPage
            ? Boolean(link?.enabled)
            : Boolean(link?.showInWidget),
        };
      }),
    [page.links, onPage],
  );

  const toolItems = useMemo(() => {
    const next: {
      id: string;
      label: string;
      blurb: string;
      on: boolean;
      removable?: boolean;
    }[] = [];
    if (chatOn) {
      next.push({
        id: "chat",
        label: "Live Chat",
        blurb: onPage
          ? "A button that opens your inbox."
          : "The bubble that opens your inbox.",
        on: onPage
          ? Boolean(chatLink?.enabled)
          : Boolean(chatLink?.showInWidget),
      });
    }
    for (const link of page.links) {
      if (isContactLink(link)) continue;
      if (link.kind === "chat") continue;
      if (
        !onPage &&
        (link.id === "pre-consult" || link.id === "pre-promo")
      ) {
        continue;
      }
      const action = publicActionFromLink(link);
      if (action === "call" || action === "sms" || action === "email") continue;
      if (action === "form" || action === "scheduler") {
        if (!isPublicActionEnabled(settings, action)) continue;
      } else if (!isSimpleLink(link)) {
        continue;
      }
      const href = link.href?.trim() ?? "";
      next.push({
        id: link.id,
        label: link.label.trim() || "Link",
        blurb: isSimpleLink(link)
          ? href.replace(/^https?:\/\//i, "") || "Opens a website."
          : onPage
            ? "Shows as a button on your micro-landing page."
            : "Shows as a button on the widget bar.",
        on: onPage ? Boolean(link.enabled) : Boolean(link.showInWidget),
        removable: link.id.startsWith("pre-link-"),
      });
    }
    return next;
  }, [page.links, settings, chatOn, chatLink, onPage]);

  function persistLinks(links: PreChatLink[]) {
    onChangeSettings({
      ...settings,
      preChat: { ...page, links },
    });
  }

  function patchContact(
    id: (typeof CONTACT_LINK_IDS)[number],
    patch: Partial<PreChatLink>,
  ) {
    persistLinks(
      page.links.map((item) =>
        item.id === id ? { ...item, ...patch } : item,
      ),
    );
  }

  function setPhone(value: string) {
    persistLinks(
      page.links.map((item) =>
        item.id === "pre-call" || item.id === "pre-sms"
          ? { ...item, href: value }
          : item,
      ),
    );
  }

  function toggleSurface(link: PreChatLink | undefined) {
    if (!link) return;
    persistLinks(
      page.links.map((item) =>
        item.id === link.id
          ? onPage
            ? { ...item, enabled: !item.enabled }
            : { ...item, showInWidget: !item.showInWidget }
          : item,
      ),
    );
  }

  function toggleItem(id: string) {
    if (id === "chat") {
      const turningOn = onPage
        ? !chatLink?.enabled
        : !chatLink?.showInWidget;
      if (!chatLink) {
        persistLinks([
          ...page.links,
          {
            id: "pre-live-chat",
            kind: "chat",
            label: "Live Chat",
            enabled: onPage ? turningOn : false,
            showInWidget: onPage ? false : turningOn,
          },
        ]);
        return;
      }
      persistLinks(
        page.links.map((item) =>
          item.id === chatLink.id
            ? onPage
              ? { ...item, enabled: turningOn }
              : { ...item, showInWidget: turningOn }
            : item,
        ),
      );
      return;
    }
    toggleSurface(page.links.find((item) => item.id === id));
  }

  function addSimpleLink() {
    const nextLabel = linkLabel.trim().slice(0, 80);
    const nextHref = normalizeLinkUrl(linkHref);
    if (!nextLabel) {
      setLinkError("Give the button a label.");
      return;
    }
    if (!nextHref) {
      setLinkError("Enter a web address.");
      return;
    }
    if (page.links.length >= 16) {
      setLinkError("Remove a button before adding another.");
      return;
    }
    persistLinks([
      ...page.links,
      {
        id: `pre-link-${Date.now().toString(36)}`,
        kind: "url",
        label: nextLabel,
        href: nextHref,
        enabled: onPage,
        showInWidget: !onPage,
      },
    ]);
    setLinkLabel("");
    setLinkHref("");
    setLinkError(null);
  }

  function removeLink(id: string) {
    persistLinks(page.links.filter((item) => item.id !== id));
  }

  if (group === "contacts") {
    return (
      <>
        <div className="contact-destinations">
          <label className="floor-settings-note">
            <span>Phone</span>
            <input
              type="tel"
              value={phone}
              onChange={(event) => setPhone(event.target.value)}
              placeholder={DEFAULT_CALL_PHONE}
              autoComplete="tel"
            />
          </label>
          <label className="floor-settings-note">
            <span>Email</span>
            <input
              type="email"
              value={email}
              onChange={(event) =>
                patchContact("pre-email", { href: event.target.value })
              }
              placeholder="hello@yourbusiness.com"
              autoComplete="email"
            />
          </label>
        </div>
        <ToggleList items={contactItems} onToggle={toggleItem} />
        <p className="floor-settings-help">
          Call and text use the same number. Email uses the address above.
        </p>
      </>
    );
  }

  return (
    <>
      {toolItems.length > 0 ? (
        <ToggleList
          items={toolItems}
          onToggle={toggleItem}
          onRemove={removeLink}
        />
      ) : (
        <p className="floor-settings-help">
          Turn on Live Chat, Forms, or Schedule in Tools, then add them here.
        </p>
      )}
      <div className="surface-add-link">
        <p className="floor-settings-help">Add a simple link button.</p>
        <div className="contact-destinations">
          <label className="floor-settings-note">
            <span>Button label</span>
            <input
              value={linkLabel}
              onChange={(event) => {
                setLinkLabel(event.target.value.slice(0, 80));
                setLinkError(null);
              }}
              placeholder="Menu"
              maxLength={80}
            />
          </label>
          <label className="floor-settings-note">
            <span>Link</span>
            <input
              type="url"
              value={linkHref}
              onChange={(event) => {
                setLinkHref(event.target.value);
                setLinkError(null);
              }}
              placeholder="https://your-site.com/menu"
              autoComplete="url"
            />
          </label>
        </div>
        {linkError ? <p className="space-auth-error">{linkError}</p> : null}
        <button type="button" className="btn-solid" onClick={addSimpleLink}>
          Add link
        </button>
      </div>
    </>
  );
}
