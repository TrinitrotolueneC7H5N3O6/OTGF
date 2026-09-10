"use client";

import { useCallback, useEffect, useState } from "react";
import { IconCheck, IconCode } from "@/components/shared/Icons";
import { describeEvent, type InsightEvent, type InsightSummary } from "@/lib/insights";
import { InsightsHeatmap } from "./InsightsHeatmap";

interface InsightsPanelProps {
  slug: string;
}

type SessionDetail = {
  id: string;
  startedAt: string;
  durationMs: number;
  device: string;
  landingPath: string;
  referrer: string;
  pageCount: number;
  maxScroll: number;
  rageClicks: number;
  deadClicks: number;
  events: InsightEvent[];
};

function formatDuration(ms: number) {
  if (ms < 1000) return "under 1s";
  const seconds = Math.round(ms / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  const rest = seconds % 60;
  if (minutes < 60) return rest ? `${minutes}m ${rest}s` : `${minutes}m`;
  return `${Math.floor(minutes / 60)}h ${minutes % 60}m`;
}

function formatWhen(iso: string) {
  const date = new Date(iso);
  if (!Number.isFinite(date.getTime())) return "";
  return date.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function deviceLabel(device: string) {
  if (device === "mobile") return "Phone";
  if (device === "tablet") return "Tablet";
  return "Desktop";
}

export function InsightsPanel({ slug }: InsightsPanelProps) {
  const [origin, setOrigin] = useState(() =>
    typeof window === "undefined" ? "" : window.location.origin,
  );
  const [copied, setCopied] = useState(false);
  const [range, setRange] = useState<"24h" | "7d">("24h");
  const [summary, setSummary] = useState<InsightSummary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [openId, setOpenId] = useState<string | null>(null);
  const [detail, setDetail] = useState<SessionDetail | null>(null);

  useEffect(() => {
    setOrigin(window.location.origin);
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/spaces/${encodeURIComponent(slug)}/insights?range=${range}`,
        { cache: "no-store" },
      );
      const text = await res.text();
      let data: InsightSummary & { error?: string };
      try {
        data = text
          ? (JSON.parse(text) as InsightSummary & { error?: string })
          : ({} as InsightSummary & { error?: string });
      } catch {
        throw new Error("Could not load watch data.");
      }
      if (!res.ok) throw new Error(data.error || "Could not load watch data.");
      setSummary(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load watch data.");
    } finally {
      setLoading(false);
    }
  }, [range, slug]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!openId) {
      setDetail(null);
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch(
          `/api/spaces/${encodeURIComponent(slug)}/insights?sessionId=${encodeURIComponent(openId)}`,
          { cache: "no-store" },
        );
        const text = await res.text();
        const data = text
          ? (JSON.parse(text) as { session?: SessionDetail; error?: string })
          : ({} as { session?: SessionDetail; error?: string });
        if (!res.ok || !data.session) {
          throw new Error(data.error || "Could not load visit.");
        }
        if (!cancelled) setDetail(data.session);
      } catch {
        if (!cancelled) setDetail(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [openId, slug]);

  const snippet = `<script src="${origin}/watch.js" data-slug="${slug}" async></script>`;

  async function copySnippet() {
    try {
      await navigator.clipboard.writeText(snippet);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      /* clipboard can be blocked */
    }
  }

  const stats = summary?.stats;
  const empty = !loading && (summary?.stats.sessions ?? 0) === 0;

  return (
    <div className="dashboard-panel-body insights-panel">
      <h2 className="dashboard-panel-title">Watch</h2>
      <p className="floor-settings-help insights-intro">
        Paste this on your website and you’ll see what visitors actually do —
        where they land, what they tap, where they get stuck, and whether they
        ever reach the good part of the page. Typed text, passwords, and form
        values are never recorded.
      </p>

      <div className="pre-chat-share website-install-card">
        <div className="pre-chat-widget">
          <p className="pre-chat-widget-label">
            <IconCode size={15} />
            Paste this on your website
          </p>
          <p className="floor-settings-help">
            One snippet, any page. If you already use the chat bubble, Watch is
            included automatically.
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

      <div className="insights-toolbar">
        <div className="insights-range" role="group" aria-label="Time range">
          <button
            type="button"
            className={range === "24h" ? "is-on" : ""}
            onClick={() => setRange("24h")}
          >
            Last 24 hours
          </button>
          <button
            type="button"
            className={range === "7d" ? "is-on" : ""}
            onClick={() => setRange("7d")}
          >
            Last 7 days
          </button>
        </div>
        <button type="button" className="btn-ghost" onClick={() => void load()}>
          Refresh
        </button>
      </div>

      {error ? <p className="insights-error">{error}</p> : null}

      <section className="insights-stats" aria-label="Watch overview">
        <div className="dashboard-stat">
          <span className="dashboard-stat-label">Visits</span>
          <strong>{stats?.sessions ?? 0}</strong>
        </div>
        <div className="dashboard-stat">
          <span className="dashboard-stat-label">Time on site</span>
          <strong>{formatDuration(stats?.avgMs ?? 0)}</strong>
        </div>
        <div className="dashboard-stat">
          <span className="dashboard-stat-label">Left immediately</span>
          <strong>{`${stats?.bounceRate ?? 0}%`}</strong>
        </div>
        <div className="dashboard-stat">
          <span className="dashboard-stat-label">Pages / visit</span>
          <strong>{stats?.avgPages ?? 0}</strong>
        </div>
        <div className="dashboard-stat">
          <span className="dashboard-stat-label">Scroll depth</span>
          <strong>{`${stats?.avgScroll ?? 0}%`}</strong>
        </div>
      </section>

      {empty ? (
        <p className="dashboard-empty">
          No visits yet. Open your site with the snippet on it, click around,
          then refresh this page.
        </p>
      ) : null}

      {summary && summary.stats.sessions > 0 ? (
        <>
          <InsightsHeatmap
            slug={slug}
            range={range}
            pages={
              summary.heatmaps.length > 0
                ? summary.heatmaps
                : summary.topPages.map((page) => ({
                    path: page.path,
                    pageUrl: "",
                    clicks: 0,
                    hasSnapshot: false,
                  }))
            }
          />
          <section className="insights-block">
            <header>
              <h3>Fix these first</h3>
              <p>The few signals that usually mean the site is fighting people.</p>
            </header>
            <div className="insights-friction">
              {summary.friction.rage.length === 0 &&
              summary.friction.dead.length === 0 &&
              summary.friction.dropPages.length === 0 ? (
                <p className="dashboard-empty">
                  No obvious friction yet. Keep the snippet on and this fills in
                  as people use the site.
                </p>
              ) : null}
              {summary.friction.rage.map((item) => (
                <article key={`rage-${item.key}`} className="insights-card">
                  <span>Rage taps</span>
                  <strong>{item.label}</strong>
                  <p>
                    {`People kept tapping this on ${item.path} (${item.count === 1 ? "once" : `${item.count} times`}). It probably looks clickable and isn’t doing what they expect.`}
                  </p>
                </article>
              ))}
              {summary.friction.dead.map((item) => (
                <article key={`dead-${item.key}`} className="insights-card">
                  <span>Dead taps</span>
                  <strong>{item.label}</strong>
                  <p>
                    {`Tapped on ${item.path} with no button or link underneath${item.count === 1 ? "." : ` (${item.count} times).`}`}
                  </p>
                </article>
              ))}
              {summary.friction.dropPages.map((item) => (
                <article key={`drop-${item.path}`} className="insights-card">
                  <span>Drop-off</span>
                  <strong>{item.path}</strong>
                  <p>
                    {item.bounceRate}% of visits here left within a few seconds.
                    The first screen may not be answering the question.
                  </p>
                </article>
              ))}
            </div>
          </section>

          <section className="insights-split">
            <div className="insights-block">
              <header>
                <h3>Pages they actually use</h3>
                <p>Where people land and how far they get.</p>
              </header>
              <ul className="insights-list">
                {summary.topPages.map((page) => (
                  <li key={page.path}>
                    <strong>{page.path}</strong>
                    <span>
                      {page.views} visits · {page.avgScroll}% scroll ·{" "}
                      {formatDuration(page.avgMs)}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
            <div className="insights-block">
              <header>
                <h3>What they try to click</h3>
                <p>The controls people reach for.</p>
              </header>
              <ul className="insights-list">
                {summary.topClicks.length === 0 ? (
                  <li className="is-empty">No clicks recorded yet.</li>
                ) : (
                  summary.topClicks.map((item) => (
                    <li key={item.key}>
                      <strong>{item.label}</strong>
                      <span>
                        {item.count} taps · {item.path}
                      </span>
                    </li>
                  ))
                )}
              </ul>
            </div>
          </section>

          <section className="insights-block">
            <header>
              <h3>What someone just did</h3>
              <p>A short trail for each recent visit — not a video, the useful bits.</p>
            </header>
            <ul className="insights-sessions">
              {summary.sessions.map((session) => {
                const open = openId === session.id;
                return (
                  <li key={session.id}>
                    <button
                      type="button"
                      className={open ? "is-open" : ""}
                      onClick={() =>
                        setOpenId((current) =>
                          current === session.id ? null : session.id,
                        )
                      }
                    >
                      <span className="insights-session-when">
                        {formatWhen(session.startedAt)} ·{" "}
                        {deviceLabel(session.device)} ·{" "}
                        {formatDuration(session.durationMs)}
                      </span>
                      <strong>{session.preview}</strong>
                      <span>
                        {session.landingPath} · {session.pageCount} page
                        {session.pageCount === 1 ? "" : "s"} · {session.maxScroll}
                        % scroll
                        {session.rageClicks
                          ? ` · ${session.rageClicks} rage taps`
                          : ""}
                      </span>
                    </button>
                    {open ? (
                      <ol className="insights-trail">
                        {detail && detail.id === session.id ? (
                          detail.events.map((event, index) => (
                            <li key={`${event.t}-${event.type}-${index}`}>
                              <span>{formatDuration(event.t)}</span>
                              <p>{describeEvent(event)}</p>
                            </li>
                          ))
                        ) : (
                          <li>
                            <p>Loading trail…</p>
                          </li>
                        )}
                      </ol>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          </section>
        </>
      ) : null}
    </div>
  );
}
