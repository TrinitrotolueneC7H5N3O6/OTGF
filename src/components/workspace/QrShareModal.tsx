"use client";

import { useEffect, useState } from "react";
import QRCode from "qrcode";
import { IconCheck, IconLink, IconX } from "@/components/shared/Icons";

interface QrShareModalProps {
  url: string;
  businessName: string;
  onClose: () => void;
  onCopyLink: () => void;
  copied: boolean;
}

export function QrShareModal({
  url,
  businessName,
  onClose,
  onCopyLink,
  copied,
}: QrShareModalProps) {
  const [dataUrl, setDataUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const next = await QRCode.toDataURL(url, {
          width: 280,
          margin: 2,
          color: { dark: "#14161a", light: "#ffffff" },
        });
        if (!cancelled) {
          setDataUrl(next);
          setError(null);
        }
      } catch {
        if (!cancelled) setError("Could not generate QR code.");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [url]);

  function downloadPng() {
    if (!dataUrl) return;
    const a = document.createElement("a");
    a.href = dataUrl;
    a.download = `${businessName.replace(/[^\w]+/g, "-").toLowerCase() || "otgf"}-qr.png`;
    a.click();
  }

  return (
    <div className="widget-snippet-backdrop" onClick={onClose}>
      <div
        className="widget-snippet-modal qr-share-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="qr-share-title"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="widget-snippet-head">
          <div>
            <h2 id="qr-share-title">QR code</h2>
            <p>Customers scan this to open your chat link.</p>
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
        <div className="widget-snippet-body qr-share-body">
          {error ? <p className="editor-error">{error}</p> : null}
          {dataUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img className="qr-share-image" src={dataUrl} alt="QR code" />
          ) : !error ? (
            <p className="editor-hint">Generating…</p>
          ) : null}
          <code className="qr-share-url">{url}</code>
          <div className="widget-snippet-actions">
            <button type="button" className="btn-solid" onClick={downloadPng}>
              Download PNG
            </button>
            <button type="button" className="btn-ghost" onClick={onCopyLink}>
              {copied ? (
                <>
                  <IconCheck size={14} /> Copied
                </>
              ) : (
                <>
                  <IconLink size={14} /> Copy link
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
