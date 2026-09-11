"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { IconMaximize, IconMinimize } from "@/components/shared/Icons";

export function PreviewFrame({ children, onRestart, controls, screenClassName = "" }: {
  children: ReactNode;
  onRestart: () => void;
  controls?: ReactNode;
  screenClassName?: string;
}) {
  const [device, setDevice] = useState<"mobile" | "desktop">("mobile");
  const [fullscreen, setFullscreen] = useState(false);
  const [width, setWidth] = useState(375);
  const stage = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!stage.current) return;
    const observer = new ResizeObserver(([entry]) => setWidth(entry.contentRect.width));
    observer.observe(stage.current);
    return () => observer.disconnect();
  }, []);
  useEffect(() => {
    if (!fullscreen) return;
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") setFullscreen(false);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [fullscreen]);
  const viewport = device === "mobile" ? 375 : 760;
  const scale = Math.min(1, width / viewport);

  return (
    <aside className={`tool-preview preview-frame${fullscreen ? " is-fullscreen" : ""}`} aria-label="Live preview">
      <header className="tool-preview-header">
        <strong>Live preview</strong>
        <div className="preview-frame-actions">
          <div className="client-facing-preview-segmented" aria-label="Preview device">
            {(["mobile", "desktop"] as const).map((mode) => (
              <button type="button" key={mode} className={device === mode ? "is-active" : undefined} aria-pressed={device === mode} onClick={() => setDevice(mode)}>{mode === "mobile" ? "Mobile" : "Desktop"}</button>
            ))}
          </div>
          <button type="button" className="btn-ghost" onClick={onRestart}>Restart</button>
          <button type="button" className="client-facing-preview-fs" onClick={() => setFullscreen((open) => !open)} aria-label={fullscreen ? "Exit full screen" : "Enter full screen"}>
            {fullscreen ? <IconMinimize size={16} /> : <IconMaximize size={16} />}
          </button>
        </div>
      </header>
      <div className="tool-preview-stage" ref={stage}>
        <div style={{ width: viewport * scale, height: 680 * scale, margin: "0 auto" }}>
          <div className={`tool-preview-screen is-${device} ${screenClassName}`} style={{ width: viewport, height: 680, transform: `scale(${scale})`, transformOrigin: "top left" }}>
            {children}
          </div>
        </div>
      </div>
      {controls ? <div className="preview-frame-controls">{controls}</div> : null}
    </aside>
  );
}
