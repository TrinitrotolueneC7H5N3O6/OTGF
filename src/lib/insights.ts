export type InsightEventType =
  | "page"
  | "click"
  | "scroll"
  | "rage"
  | "dead"
  | "leave";

export type InsightEvent = {
  t: number;
  type: InsightEventType;
  path: string;
  label?: string;
  x?: number;
  y?: number;
  depth?: number;
  url?: string;
};

export type InsightHeatPoint = {
  x: number;
  y: number;
  type: "click" | "rage" | "dead";
};

export type InsightHeatmapPage = {
  path: string;
  pageUrl: string;
  clicks: number;
  hasSnapshot: boolean;
};

export type InsightHeatmap = {
  path: string;
  pageUrl: string;
  snapshot: string | null;
  width: number;
  height: number;
  points: InsightHeatPoint[];
  scrollReach: number[];
};

export type InsightSessionRow = {
  id: string;
  startedAt: string;
  lastSeenAt: string;
  landingPath: string;
  referrer: string;
  device: string;
  viewportW: number;
  viewportH: number;
  pageCount: number;
  durationMs: number;
  maxScroll: number;
  rageClicks: number;
  deadClicks: number;
  events: InsightEvent[];
};

export type InsightCount = {
  key: string;
  label: string;
  path: string;
  count: number;
};

export type InsightPageRow = {
  path: string;
  views: number;
  avgScroll: number;
  avgMs: number;
  bounceRate: number;
};

export type InsightSummary = {
  rangeHours: number;
  stats: {
    sessions: number;
    avgMs: number;
    bounceRate: number;
    avgPages: number;
    avgScroll: number;
  };
  friction: {
    rage: InsightCount[];
    dead: InsightCount[];
    dropPages: InsightPageRow[];
  };
  topPages: InsightPageRow[];
  topClicks: InsightCount[];
  heatmaps: InsightHeatmapPage[];
  sessions: Array<{
    id: string;
    startedAt: string;
    durationMs: number;
    device: string;
    landingPath: string;
    pageCount: number;
    rageClicks: number;
    deadClicks: number;
    maxScroll: number;
    preview: string;
  }>;
};

const EVENT_TYPES = new Set<InsightEventType>([
  "page",
  "click",
  "scroll",
  "rage",
  "dead",
  "leave",
]);

const MAX_EVENTS = 160;
const MAX_LABEL = 80;
const MAX_PATH = 180;
const MAX_URL = 240;
const MAX_REFERRER = 240;

export function cleanPageUrl(value: unknown) {
  if (typeof value !== "string") return "";
  try {
    const url = new URL(value.trim());
    if (url.protocol !== "http:" && url.protocol !== "https:") return "";
    url.hash = "";
    return url.toString().slice(0, MAX_URL);
  } catch {
    return "";
  }
}

export function cleanPath(value: unknown) {
  if (typeof value !== "string") return "/";
  let next = value.trim() || "/";
  try {
    if (/^https?:\/\//i.test(next)) {
      const url = new URL(next);
      next = `${url.pathname}${url.search}`;
    }
  } catch {
    /* keep as-is */
  }
  next = next.replace(/#.*$/, "").replace(/\?.*$/, "");
  if (!next.startsWith("/")) next = `/${next}`;
  return next.slice(0, MAX_PATH) || "/";
}

export function cleanReferrer(value: unknown) {
  if (typeof value !== "string") return "";
  return value.trim().slice(0, MAX_REFERRER);
}

export function deviceFromViewport(width: number) {
  if (width > 0 && width < 760) return "mobile";
  if (width > 0 && width < 1100) return "tablet";
  return "desktop";
}

export function sanitizeEvent(raw: unknown): InsightEvent | null {
  if (!raw || typeof raw !== "object") return null;
  const row = raw as Record<string, unknown>;
  const type = row.type;
  if (typeof type !== "string" || !EVENT_TYPES.has(type as InsightEventType)) {
    return null;
  }
  const t = Number(row.t);
  if (!Number.isFinite(t) || t < 0) return null;
  const event: InsightEvent = {
    t: Math.min(Math.round(t), 1000 * 60 * 60 * 6),
    type: type as InsightEventType,
    path: cleanPath(row.path),
  };
  if (typeof row.label === "string") {
    const label = row.label.replace(/\s+/g, " ").trim().slice(0, MAX_LABEL);
    if (label) event.label = label;
  }
  if (typeof row.x === "number" && Number.isFinite(row.x)) {
    event.x = Math.max(0, Math.min(100, Math.round(row.x * 10) / 10));
  }
  if (typeof row.y === "number" && Number.isFinite(row.y)) {
    event.y = Math.max(0, Math.min(100, Math.round(row.y * 10) / 10));
  }
  if (typeof row.depth === "number" && Number.isFinite(row.depth)) {
    event.depth = Math.max(0, Math.min(100, Math.round(row.depth)));
  }
  const url = cleanPageUrl(row.url);
  if (url) event.url = url;
  return event;
}

export function mergeEvents(
  current: InsightEvent[],
  incoming: InsightEvent[],
): InsightEvent[] {
  const merged = [...current];
  const seen = new Set(
    current.map((event) => `${event.t}:${event.type}:${event.path}:${event.label ?? ""}`),
  );
  for (const event of incoming) {
    const key = `${event.t}:${event.type}:${event.path}:${event.label ?? ""}`;
    if (seen.has(key)) continue;
    seen.add(key);
    merged.push(event);
  }
  merged.sort((a, b) => a.t - b.t);
  return merged.slice(-MAX_EVENTS);
}

export function eventsFromJson(value: unknown): InsightEvent[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((row) => sanitizeEvent(row))
    .filter((row): row is InsightEvent => Boolean(row));
}

function bounce(session: InsightSessionRow) {
  return session.pageCount <= 1 && session.durationMs < 12_000;
}

function countKey(path: string, label: string) {
  return `${path}::${label}`;
}

function bumpCount(
  map: Map<string, InsightCount>,
  path: string,
  label: string,
) {
  const key = countKey(path, label);
  const current = map.get(key);
  if (current) {
    current.count += 1;
    return;
  }
  map.set(key, { key, path, label, count: 1 });
}

function topCounts(map: Map<string, InsightCount>, limit: number) {
  return [...map.values()].sort((a, b) => b.count - a.count).slice(0, limit);
}

export function sessionPreview(events: InsightEvent[]) {
  const steps: string[] = [];
  for (const event of events) {
    if (event.type === "page") steps.push(`Opened ${event.path}`);
    else if (event.type === "click" && event.label) {
      steps.push(`Clicked “${event.label}”`);
    } else if (event.type === "rage" && event.label) {
      steps.push(`Kept tapping “${event.label}”`);
    } else if (event.type === "dead" && event.label) {
      steps.push(`Tapped “${event.label}” with no action`);
    }
    if (steps.length >= 3) break;
  }
  return steps.join(" → ") || "Visited the site";
}

export function summarizeSessions(
  rows: InsightSessionRow[],
  rangeHours: number,
): InsightSummary {
  const statsBase = {
    sessions: rows.length,
    avgMs: 0,
    bounceRate: 0,
    avgPages: 0,
    avgScroll: 0,
  };
  if (rows.length === 0) {
    return {
      rangeHours,
      stats: statsBase,
      friction: { rage: [], dead: [], dropPages: [] },
      topPages: [],
      topClicks: [],
      heatmaps: [],
      sessions: [],
    };
  }

  const bounceCount = rows.filter(bounce).length;
  const avgMs = Math.round(
    rows.reduce((sum, row) => sum + row.durationMs, 0) / rows.length,
  );
  const avgPages =
    Math.round(
      (rows.reduce((sum, row) => sum + row.pageCount, 0) / rows.length) * 10,
    ) / 10;
  const avgScroll = Math.round(
    rows.reduce((sum, row) => sum + row.maxScroll, 0) / rows.length,
  );

  const rage = new Map<string, InsightCount>();
  const dead = new Map<string, InsightCount>();
  const clicks = new Map<string, InsightCount>();
  const heatPages = new Map<
    string,
    { pageUrl: string; clicks: number }
  >();
  const pages = new Map<
    string,
    { views: number; scroll: number; ms: number; bounces: number }
  >();

  for (const row of rows) {
    const landing = pages.get(row.landingPath) ?? {
      views: 0,
      scroll: 0,
      ms: 0,
      bounces: 0,
    };
    landing.views += 1;
    landing.scroll += row.maxScroll;
    landing.ms += row.durationMs;
    if (bounce(row)) landing.bounces += 1;
    pages.set(row.landingPath, landing);

    for (const event of row.events) {
      if (event.type === "rage" && event.label) {
        bumpCount(rage, event.path, event.label);
      }
      if (event.type === "dead" && event.label) {
        bumpCount(dead, event.path, event.label);
      }
      if (event.type === "click" && event.label) {
        bumpCount(clicks, event.path, event.label);
      }
      if (
        (event.type === "click" ||
          event.type === "rage" ||
          event.type === "dead") &&
        typeof event.x === "number" &&
        typeof event.y === "number"
      ) {
        const heat = heatPages.get(event.path) ?? {
          pageUrl: event.url || "",
          clicks: 0,
        };
        heat.clicks += 1;
        if (!heat.pageUrl && event.url) heat.pageUrl = event.url;
        heatPages.set(event.path, heat);
      }
    }
  }

  const topPages: InsightPageRow[] = [...pages.entries()]
    .map(([path, value]) => ({
      path,
      views: value.views,
      avgScroll: Math.round(value.scroll / value.views),
      avgMs: Math.round(value.ms / value.views),
      bounceRate: Math.round((value.bounces / value.views) * 100),
    }))
    .sort((a, b) => b.views - a.views)
    .slice(0, 8);

  return {
    rangeHours,
    stats: {
      sessions: rows.length,
      avgMs,
      bounceRate: Math.round((bounceCount / rows.length) * 100),
      avgPages,
      avgScroll,
    },
    friction: {
      rage: topCounts(rage, 5),
      dead: topCounts(dead, 5),
      dropPages: topPages
        .filter((page) => page.views >= 2 && page.bounceRate >= 50)
        .slice(0, 4),
    },
    topPages,
    topClicks: topCounts(clicks, 8),
    heatmaps: [...heatPages.entries()]
      .map(([path, value]) => ({
        path,
        pageUrl: value.pageUrl,
        clicks: value.clicks,
        hasSnapshot: false,
      }))
      .sort((a, b) => b.clicks - a.clicks)
      .slice(0, 8),
    sessions: [...rows]
      .sort(
        (a, b) =>
          Date.parse(b.lastSeenAt) - Date.parse(a.lastSeenAt) ||
          Date.parse(b.startedAt) - Date.parse(a.startedAt),
      )
      .slice(0, 25)
      .map((row) => ({
        id: row.id,
        startedAt: row.startedAt,
        durationMs: row.durationMs,
        device: row.device,
        landingPath: row.landingPath,
        pageCount: row.pageCount,
        rageClicks: row.rageClicks,
        deadClicks: row.deadClicks,
        maxScroll: row.maxScroll,
        preview: sessionPreview(row.events),
      })),
  };
}

export function describeEvent(event: InsightEvent) {
  if (event.type === "page") return `Opened ${event.path}`;
  if (event.type === "click") {
    return event.label
      ? `Clicked “${event.label}”`
      : `Clicked on ${event.path}`;
  }
  if (event.type === "rage") {
    return event.label
      ? `Kept tapping “${event.label}” — it may not be doing anything`
      : "Kept tapping the same spot";
  }
  if (event.type === "dead") {
    return event.label
      ? `Tapped “${event.label}” and nothing happened`
      : "Tapped something that isn’t clickable";
  }
  if (event.type === "scroll") {
    return `Scrolled to ${event.depth ?? 0}%`;
  }
  return "Left the page";
}

export function buildHeatmap(
  rows: InsightSessionRow[],
  path: string,
  snapshot?: {
    image: string;
    pageUrl: string;
    width: number;
    height: number;
  } | null,
): InsightHeatmap {
  const points: InsightHeatPoint[] = [];
  let pageUrl = snapshot?.pageUrl || "";
  const visitMax = new Map<string, number>();

  for (const row of rows) {
    let maxOnPage = 0;
    for (const event of row.events) {
      if (event.path !== path) continue;
      if (!pageUrl && event.url) pageUrl = event.url;
      if (event.type === "scroll" && typeof event.depth === "number") {
        maxOnPage = Math.max(maxOnPage, event.depth);
      }
      if (
        (event.type === "click" ||
          event.type === "rage" ||
          event.type === "dead") &&
        typeof event.x === "number" &&
        typeof event.y === "number" &&
        points.length < 600
      ) {
        points.push({ x: event.x, y: event.y, type: event.type });
      }
    }
    if (row.landingPath === path) {
      maxOnPage = Math.max(maxOnPage, row.maxScroll);
    }
    if (maxOnPage > 0 || row.landingPath === path) {
      visitMax.set(row.id, Math.max(visitMax.get(row.id) ?? 0, maxOnPage));
    }
  }

  const visits = Math.max(visitMax.size, 1);
  const scrollReach: number[] = [];
  for (let band = 0; band <= 100; band += 5) {
    let reached = 0;
    for (const depth of visitMax.values()) {
      if (depth >= band) reached += 1;
    }
    scrollReach.push(Math.round((reached / visits) * 100));
  }

  return {
    path,
    pageUrl,
    snapshot: snapshot?.image ?? null,
    width: snapshot?.width ?? 0,
    height: snapshot?.height ?? 0,
    points,
    scrollReach,
  };
}
