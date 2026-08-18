import type { ReactNode } from "react";

const URL_IN_TEXT =
  /\b((?:https?:\/\/|www\.)[^\s<]+|(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,}(?:\/[^\s<]*)?)/gi;

function trimTrailingPunctuation(raw: string) {
  return raw.replace(/[),.;:!?]+$/g, "");
}

export function normalizeHref(raw: string): string | null {
  const trimmed = trimTrailingPunctuation(raw.trim());
  if (!trimmed) return null;
  let href = trimmed;
  if (!/^https?:\/\//i.test(href)) href = `https://${href}`;
  try {
    const url = new URL(href);
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    return url.href;
  } catch {
    return null;
  }
}

/** True when the whole message is a single URL (optionally with whitespace). */
export function parseSoloUrl(text: string): string | null {
  const trimmed = text.trim();
  if (!trimmed || /\s/.test(trimmed)) return null;
  if (!/^(https?:\/\/|www\.|[a-z0-9][a-z0-9-]*\.[a-z]{2,})/i.test(trimmed)) {
    return null;
  }
  return normalizeHref(trimmed);
}

export function linkifyText(text: string): ReactNode[] {
  const nodes: ReactNode[] = [];
  let last = 0;
  const re = new RegExp(URL_IN_TEXT.source, URL_IN_TEXT.flags);
  let match: RegExpExecArray | null;
  let key = 0;
  while ((match = re.exec(text)) != null) {
    const raw = match[0];
    const start = match.index;
    const href = normalizeHref(raw);
    if (!href) continue;
    if (start > last) {
      nodes.push(text.slice(last, start));
    }
    const display = trimTrailingPunctuation(raw);
    const trailing = raw.slice(display.length);
    nodes.push(
      <a
        key={`u-${key++}`}
        href={href}
        target="_blank"
        rel="noreferrer"
        onClick={(e) => e.stopPropagation()}
      >
        {display}
      </a>,
    );
    if (trailing) nodes.push(trailing);
    last = start + raw.length;
  }
  if (last < text.length) nodes.push(text.slice(last));
  return nodes.length ? nodes : [text];
}
