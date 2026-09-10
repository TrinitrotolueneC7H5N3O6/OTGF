"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { InsightHeatmap, InsightHeatmapPage } from "@/lib/insights";

interface InsightsHeatmapProps {
  slug: string;
  range: "24h" | "7d";
  pages: InsightHeatmapPage[];
}

type HeatMode = "clicks" | "scroll";

function heatColor(t: number): [number, number, number] {
  const stops: Array<[number, number, number, number]> = [
    [0, 37, 99, 235],
    [0.35, 34, 211, 238],
    [0.55, 74, 222, 128],
    [0.75, 250, 204, 21],
    [1, 239, 68, 68],
  ];
  const clamped = Math.max(0, Math.min(1, t));
  for (let i = 1; i < stops.length; i += 1) {
    if (clamped <= stops[i][0]) {
      const a = stops[i - 1];
      const b = stops[i];
      const span = b[0] - a[0] || 1;
      const p = (clamped - a[0]) / span;
      return [
        Math.round(a[1] + (b[1] - a[1]) * p),
        Math.round(a[2] + (b[2] - a[2]) * p),
        Math.round(a[3] + (b[3] - a[3]) * p),
      ];
    }
  }
  return [239, 68, 68];
}

function embedSrc(pageUrl: string, path: string, origin: string) {
  if (pageUrl) {
    try {
      const url = new URL(pageUrl);
      if (url.origin === origin) return url.toString();
    } catch {
      /* ignore */
    }
  }
  if (path.startsWith("/") && origin) return `${origin}${path}`;
  return "";
}

function drawClickHeat(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  points: InsightHeatmap["points"],
) {
  ctx.clearRect(0, 0, width, height);
  if (points.length === 0) return;
  const radius = Math.max(26, Math.round(Math.min(width, height) * 0.05));
  for (const point of points) {
    const x = (point.x / 100) * width;
    const y = (point.y / 100) * height;
    const alpha = point.type === "rage" ? 0.5 : point.type === "dead" ? 0.28 : 0.22;
    const gradient = ctx.createRadialGradient(x, y, 0, x, y, radius);
    gradient.addColorStop(0, `rgba(255, 0, 0, ${alpha})`);
    gradient.addColorStop(1, "rgba(255, 0, 0, 0)");
    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    ctx.fill();
  }
  const image = ctx.getImageData(0, 0, width, height);
  const data = image.data;
  for (let i = 0; i < data.length; i += 4) {
    const a = data[i + 3];
    if (a === 0) continue;
    const [r, g, b] = heatColor(Math.min(1, a / 180));
    data[i] = r;
    data[i + 1] = g;
    data[i + 2] = b;
    data[i + 3] = Math.min(200, Math.round(a * 1.35));
  }
  ctx.putImageData(image, 0, 0);
}

function drawScrollHeat(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  reach: number[],
) {
  ctx.clearRect(0, 0, width, height);
  if (reach.length === 0) return;
  const band = height / Math.max(reach.length - 1, 1);
  for (let i = 0; i < reach.length; i += 1) {
    const t = reach[i] / 100;
    const [r, g, b] = heatColor(t);
    ctx.fillStyle = `rgba(${r}, ${g}, ${b}, ${0.18 + t * 0.42})`;
    ctx.fillRect(0, i * band, width, band + 1);
  }
}

export function InsightsHeatmap({ slug, range, pages }: InsightsHeatmapProps) {
  const origin = typeof window === "undefined" ? "" : window.location.origin;
  const [selectedPath, setPath] = useState("");
  const path = selectedPath || pages[0]?.path || "";
  const [mode, setMode] = useState<HeatMode>("clicks");
  const [map, setMap] = useState<InsightHeatmap | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [ready, setReady] = useState(0);
  const frameRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const iframeRef = useRef<HTMLIFrameElement>(null);

  useEffect(() => {
    if (!path) return;
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch(
          `/api/spaces/${encodeURIComponent(slug)}/insights?heatmapPath=${encodeURIComponent(path)}&range=${range}`,
          { cache: "no-store" },
        );
        const text = await res.text();
        let data: InsightHeatmap & { error?: string };
        try {
          data = text
            ? (JSON.parse(text) as InsightHeatmap & { error?: string })
            : ({} as InsightHeatmap & { error?: string });
        } catch {
          throw new Error("Could not load heatmap.");
        }
        if (!res.ok) throw new Error(data.error || "Could not load heatmap.");
        if (!cancelled) {
          setMap(data);
          setError(null);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Could not load heatmap.");
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [path, range, slug]);

  const src = useMemo(
    () => (map ? embedSrc(map.pageUrl, map.path, origin) : ""),
    [map, origin],
  );
  const useShot = Boolean(map?.snapshot);

  useEffect(() => {
    const canvas = canvasRef.current;
    const frame = frameRef.current;
    if (!canvas || !frame || !map) return;

    function paint() {
      const next = canvasRef.current;
      const host = frameRef.current;
      if (!next || !host || !map) return;
      const width = Math.max(1, Math.round(host.clientWidth));
      const height = Math.max(1, Math.round(host.clientHeight));
      const ratio = window.devicePixelRatio || 1;
      next.width = Math.round(width * ratio);
      next.height = Math.round(height * ratio);
      next.style.width = `${width}px`;
      next.style.height = `${height}px`;
      const ctx = next.getContext("2d");
      if (!ctx) return;
      ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
      if (mode === "scroll") drawScrollHeat(ctx, width, height, map.scrollReach);
      else drawClickHeat(ctx, width, height, map.points);
    }

    paint();
    const observer = new ResizeObserver(paint);
    observer.observe(frame);
    return () => observer.disconnect();
  }, [map, mode, useShot, ready]);

  if (pages.length === 0 && !path) return null;

  const picks = pages.length > 0 ? pages : path ? [{ path, pageUrl: src, clicks: map?.points.length ?? 0, hasSnapshot: useShot }] : [];

  return (
    <section className="insights-block insights-heatmap">
      <header>
        <h3>Heatmap</h3>
        <p>
          The real page underneath, with a heat overlay on top — same idea as
          Hotjar. A photo is used when Watch has one; otherwise a live preview.
        </p>
      </header>
      <div className="insights-heatmap-tools">
        <div className="insights-range" role="group" aria-label="Heatmap page">
          {picks.map((page) => (
            <button
              key={page.path}
              type="button"
              className={path === page.path ? "is-on" : ""}
              onClick={() => setPath(page.path)}
            >
              {page.path}
              {page.hasSnapshot ? " · photo" : ""}
            </button>
          ))}
        </div>
        <div className="insights-range" role="group" aria-label="Heatmap type">
          <button
            type="button"
            className={mode === "clicks" ? "is-on" : ""}
            onClick={() => setMode("clicks")}
          >
            Clicks
          </button>
          <button
            type="button"
            className={mode === "scroll" ? "is-on" : ""}
            onClick={() => setMode("scroll")}
          >
            Scroll
          </button>
        </div>
      </div>
      {error ? <p className="insights-error">{error}</p> : null}
      <div className="insights-heatmap-shell">
        <div className="insights-heatmap-scroll">
          <div ref={frameRef} className="insights-heatmap-layer">
            {useShot ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={map?.snapshot ?? ""}
                alt={`Snapshot of ${path}`}
                className="insights-heatmap-shot"
                onLoad={() => setReady((n) => n + 1)}
              />
            ) : src ? (
              <iframe
                ref={iframeRef}
                className="insights-heatmap-frame"
                src={src}
                title={`Live preview of ${path}`}
                // The heatmap is a visual preview. Running the embedded site
                // also starts its widgets and persistent connections, which can
                // exhaust the origin’s connection pool and stall navigation.
                sandbox="allow-same-origin"
                tabIndex={-1}
                onLoad={() => {
                  const frame = iframeRef.current;
                  try {
                    const doc = frame?.contentDocument;
                    const height = doc?.documentElement.scrollHeight;
                    if (frame && height) frame.style.height = `${height}px`;
                    setReady((n) => n + 1);
                  } catch {
                    /* cross-origin */
                  }
                }}
              />
            ) : (
              <div className="insights-heatmap-empty">
                Waiting for a page snapshot. Open the site with Watch installed
                and this fills in.
              </div>
            )}
            <canvas
              ref={canvasRef}
              className="insights-heatmap-canvas"
            />
          </div>
          <div className="insights-heatmap-scale" aria-hidden="true">
            <span>Cold</span>
            <i />
            <span>Hot</span>
          </div>
          <span className="insights-heatmap-chip">
            {useShot ? "Page photo" : src ? "Live preview" : "No capture yet"}
          </span>
        </div>
        <p className="insights-heatmap-legend">
          {mode === "clicks"
            ? `${map?.points.length ?? 0} taps on this page. Cooler is fewer, hotter is where people keep hitting.`
            : "Color shows how far people typically get down the page. Cooler means they dropped off."}
        </p>
      </div>
    </section>
  );
}
