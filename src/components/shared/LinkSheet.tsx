"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type AnchorHTMLAttributes,
  type MouseEvent,
  type ReactNode,
  type SyntheticEvent,
} from "react";
import { createPortal } from "react-dom";
import { IconArrowUpRight, IconX } from "@/components/shared/Icons";
import { frameSrcFor } from "@/lib/linkFrame";
import type { LinkPreview } from "@/lib/linkPreview";

type LinkSheetTarget = {
  href: string;
  portalRoot: HTMLElement;
};

type OpenLinkSheet = (href: string, portalRoot?: HTMLElement | null) => void;

const LinkSheetContext = createContext<OpenLinkSheet | null>(null);

export function useLinkSheet() {
  return useContext(LinkSheetContext);
}

function toHref(raw: string) {
  const trimmed = raw.trim();
  if (!trimmed) return "";
  if (/^[a-z][a-z0-9+.-]*:/i.test(trimmed)) return trimmed;
  if (trimmed.startsWith("/")) return trimmed;
  return `https://${trimmed}`;
}

export function isInAppBrowseUrl(raw: string) {
  const href = toHref(raw);
  try {
    const origin =
      typeof window === "undefined"
        ? "https://localhost"
        : window.location.origin;
    const url = new URL(href, origin);
    if (url.protocol !== "http:" && url.protocol !== "https:") return false;
    if (href.startsWith("data:")) return false;
    if (typeof window !== "undefined" && url.origin === window.location.origin) {
      return false;
    }
    return true;
  } catch {
    return false;
  }
}

function hostLabel(href: string) {
  try {
    return new URL(href).hostname.replace(/^www\./, "");
  } catch {
    return href;
  }
}

export function InAppLink({
  href,
  onClick,
  ...props
}: AnchorHTMLAttributes<HTMLAnchorElement> & { href: string }) {
  const open = useLinkSheet();
  const resolved = toHref(href);

  function handleClick(e: MouseEvent<HTMLAnchorElement>) {
    onClick?.(e);
    if (e.defaultPrevented) return;
    if (open && isInAppBrowseUrl(resolved)) {
      e.preventDefault();
      e.stopPropagation();
      open(
        resolved,
        e.currentTarget.closest<HTMLDialogElement>("dialog[open]"),
      );
    }
  }

  return (
    <a
      {...props}
      href={resolved}
      target={open && isInAppBrowseUrl(resolved) ? undefined : props.target}
      rel={open && isInAppBrowseUrl(resolved) ? undefined : props.rel}
      onClick={handleClick}
    />
  );
}

export function LinkSheetProvider({ children }: { children: ReactNode }) {
  const [target, setTarget] = useState<LinkSheetTarget | null>(null);
  const open = useCallback((next: string, portalRoot?: HTMLElement | null) => {
    if (isInAppBrowseUrl(next)) {
      setTarget({ href: toHref(next), portalRoot: portalRoot ?? document.body });
    }
    else window.open(toHref(next), "_blank", "noopener,noreferrer");
  }, []);

  return (
    <LinkSheetContext.Provider value={open}>
      {children}
      {target ? (
        <LinkSheetFrame
          key={target.href}
          href={target.href}
          portalRoot={target.portalRoot}
          onClose={() => setTarget(null)}
        />
      ) : null}
    </LinkSheetContext.Provider>
  );
}

function frameLooksBlocked(iframe: HTMLIFrameElement) {
  try {
    const loc = iframe.contentWindow?.location.href ?? "";
    if (!loc || loc === "about:blank") return true;
    if (loc.startsWith("chrome-error:") || loc.startsWith("edge-error:")) {
      return true;
    }
    return false;
  } catch {
    return false;
  }
}

function LinkSheetFrame({
  href,
  portalRoot,
  onClose,
}: {
  href: string;
  portalRoot: HTMLElement;
  onClose: () => void;
}) {
  const [blocked, setBlocked] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [preview, setPreview] = useState<LinkPreview | null>(null);
  const host = useMemo(() => hostLabel(href), [href]);
  const frameSrc = useMemo(() => frameSrcFor(href), [href]);
  const rewritten = frameSrc !== href;
  const showFrame = !blocked && (rewritten || preview?.embeddable !== false);

  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.preventDefault();
      e.stopImmediatePropagation();
      onClose();
    };
    window.addEventListener("keydown", onKey, true);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener("keydown", onKey, true);
    };
  }, [onClose]);

  useEffect(() => {
    const ac = new AbortController();
    fetch(`/api/link-preview?url=${encodeURIComponent(href)}`, {
      signal: ac.signal,
    })
      .then((res) => (res.ok ? res.json() : null))
      .then((data: LinkPreview | null) => {
        if (data) setPreview(data);
      })
      .catch(() => {});
    return () => ac.abort();
  }, [href]);

  function onFrameLoad(e: SyntheticEvent<HTMLIFrameElement>) {
    setLoaded(true);
    if (frameLooksBlocked(e.currentTarget)) setBlocked(true);
  }

  if (typeof document === "undefined") return null;

  return createPortal(
    <div
      className="link-sheet"
      role="dialog"
      aria-modal="true"
      aria-label={`Page from ${host}`}
    >
      <div className="link-sheet-bar">
        <button
          type="button"
          className="link-sheet-close"
          onClick={onClose}
          aria-label="Back to chat"
        >
          <IconX size={18} />
          Done
        </button>
        <p className="link-sheet-host">{host}</p>
        <a
          className="link-sheet-external"
          href={href}
          target="_blank"
          rel="noreferrer"
          aria-label="Open in browser"
        >
          <IconArrowUpRight size={16} />
        </a>
      </div>
      <div className="link-sheet-stage">
        {showFrame ? (
          <>
            {!loaded ? <p className="link-sheet-loading">Loading…</p> : null}
            <iframe
              key={frameSrc}
              className="link-sheet-frame"
              src={frameSrc}
              title={host}
              allow="payment; geolocation; microphone; camera; fullscreen"
              onLoad={onFrameLoad}
              onError={() => setBlocked(true)}
            />
          </>
        ) : (
          <LinkPreviewCard href={href} host={host} preview={preview} />
        )}
      </div>
    </div>,
    portalRoot,
  );
}

function LinkPreviewCard({
  href,
  host,
  preview,
}: {
  href: string;
  host: string;
  preview: LinkPreview | null;
}) {
  const title = preview?.title || host;
  const description = preview?.description || "Open this page without leaving the chat.";
  return (
    <div className="link-sheet-preview">
      {preview?.image ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img className="link-sheet-preview-image" src={preview.image} alt="" />
      ) : null}
      <div className="link-sheet-preview-body">
        <p className="link-sheet-preview-site">
          {preview?.favicon ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={preview.favicon} alt="" />
          ) : null}
          {preview?.siteName || host}
        </p>
        <h2>{title}</h2>
        {description ? <p>{description}</p> : null}
        <a className="btn-ghost" href={href} target="_blank" rel="noreferrer">
          Open in browser
        </a>
      </div>
    </div>
  );
}
