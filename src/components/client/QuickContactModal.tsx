"use client";

import { useState } from "react";
import { IconX } from "@/components/shared/Icons";
import { preChatHref } from "@/lib/preChat";
import type { PreChatLink } from "@/lib/types";

interface QuickContactModalProps {
  link: PreChatLink;
  slug: string;
  onClose: () => void;
}

export function QuickContactModal({ link, slug, onClose }: QuickContactModalProps) {
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");

  const baseHref = preChatHref(link, slug) ?? "";
  const params = new URLSearchParams();
  if (link.kind === "email" && subject.trim()) params.set("subject", subject.trim());
  if (message.trim()) params.set("body", message.trim());
  const query = params.toString();
  const href = query ? `${baseHref}?${query}` : baseHref;

  return (
    <div className="pre-chat-contact-backdrop" onClick={onClose}>
      <section
        className="pre-chat-contact-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="pre-chat-contact-title"
        onClick={(event) => event.stopPropagation()}
      >
        <header>
          <div>
            <span>{link.kind === "sms" ? "TEXT MESSAGE" : "EMAIL"}</span>
            <h2 id="pre-chat-contact-title">{link.label}</h2>
          </div>
          <button
            type="button"
            className="btn-ghost icon-btn"
            aria-label="Close"
            onClick={onClose}
          >
            <IconX />
          </button>
        </header>
        <p className="pre-chat-contact-destination">
          To <strong>{link.href}</strong>
        </p>
        {link.kind === "email" ? (
          <label className="floor-settings-note">
            <span>Subject</span>
            <input
              value={subject}
              onChange={(event) => setSubject(event.target.value)}
              placeholder="How can we help?"
            />
          </label>
        ) : null}
        <label className="floor-settings-note">
          <span>Your message</span>
          <textarea
            value={message}
            onChange={(event) => setMessage(event.target.value)}
            placeholder="Write a quick message…"
            rows={5}
          />
        </label>
        <a className="btn-solid pre-chat-contact-send" href={href} onClick={onClose}>
          Open {link.kind === "sms" ? "messages" : "email"}
        </a>
        <p className="floor-settings-help">
          You can review everything once more before sending.
        </p>
      </section>
    </div>
  );
}
