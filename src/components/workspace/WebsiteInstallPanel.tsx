"use client";

import { useEffect, useState } from "react";
import { IconCheck, IconCode, IconEye } from "@/components/shared/Icons";

export type WebsiteInstallKind = "contact" | "bubble";

interface WebsiteInstallPanelProps {
  slug: string;
  kind: WebsiteInstallKind;
  publicPageOn: boolean;
  embed?: boolean;
}

export function WebsiteInstallPanel({
  slug,
  kind,
  publicPageOn,
  embed = false,
}: WebsiteInstallPanelProps) {
  const [origin, setOrigin] = useState(() =>
    typeof window === "undefined" ? "" : window.location.origin,
  );
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    setOrigin(window.location.origin);
  }, []);

  const host = origin || "";
  const snippet =
    kind === "contact"
      ? `<div id="otgf"></div>\n<script src="${host}/widget.js" data-slug="${slug}" data-mode="page" async></script>`
      : `<script src="${host}/widget.js" data-slug="${slug}" async></script>`;
  const previewHref =
    kind === "contact"
      ? `/site-contact-demo.html?slug=${encodeURIComponent(slug)}`
      : `/widget-demo.html?slug=${encodeURIComponent(slug)}`;

  async function copySnippet() {
    try {
      await navigator.clipboard.writeText(snippet);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      /* clipboard can be blocked in some browsers */
    }
  }

  const isContact = kind === "contact";
  const heading = isContact ? "Contact Page" : "Chat Bubble";
  const help = isContact
    ? "Replace the old Contact Us page. Visitors stay on your site: they see your public page first, then live chat."
    : "A button in the bottom-right corner. It opens live chat — same inbox as your link.";

  const content = (
    <>
      {embed ? null : <h2 className="dashboard-panel-title">{heading}</h2>}
      <p className="floor-settings-help">{help}</p>

      {!isContact || publicPageOn ? null : (
        <p className="floor-settings-help">
          Public page is off in Setup, so this embed goes straight to chat.
        </p>
      )}

      <div className="pre-chat-share website-install-card">
        <div className="pre-chat-share-actions">
          <a
            className="btn-solid"
            href={previewHref}
            target="_blank"
            rel="noreferrer"
          >
            <IconEye size={16} />
            Preview on a sample site
          </a>
        </div>

        <div className="pre-chat-widget">
          <p className="pre-chat-widget-label">
            <IconCode size={15} />
            Paste this on your website
          </p>
          <p className="floor-settings-help">
            {isContact
              ? "Drop it where the contact form used to be. You can wrap it in a div and style that div if you want a specific height."
              : "Paste once in your site footer so it shows on every page."}
          </p>
          <pre className="widget-snippet-code">
            <code>{snippet}</code>
          </pre>
          <div className="widget-snippet-actions">
            <button
              type="button"
              className="btn-solid"
              onClick={() => void copySnippet()}
            >
              {copied ? (
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
    </>
  );

  if (embed) return content;
  return <div className="dashboard-panel-body">{content}</div>;
}
