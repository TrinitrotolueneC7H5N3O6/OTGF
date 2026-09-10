import { NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import { getSessionUser } from "@/lib/auth";
import { applyDbCookieFromRequest, prisma } from "@/lib/db";
import {
  buildHeatmap,
  cleanPath,
  cleanReferrer,
  deviceFromViewport,
  eventsFromJson,
  mergeEvents,
  sanitizeEvent,
  summarizeSessions,
  type InsightEvent,
  type InsightSessionRow,
} from "@/lib/insights";
import { dbUserOwnsSpace } from "@/lib/spaceServer";
import { slugify } from "@/lib/spaceNormalize";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
  "Access-Control-Max-Age": "86400",
};

const SESSION_ID = /^w_[a-z0-9]{8,40}$/i;
const RETENTION_MS = 1000 * 60 * 60 * 24 * 14;
const MAX_SESSIONS = 400;

function corsJson(body: unknown, init?: { status?: number }) {
  return NextResponse.json(body, {
    status: init?.status ?? 200,
    headers: CORS,
  });
}

function asSessionRow(row: {
  id: string;
  startedAt: Date;
  lastSeenAt: Date;
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
  events: Prisma.JsonValue;
}): InsightSessionRow {
  return {
    id: row.id,
    startedAt: row.startedAt.toISOString(),
    lastSeenAt: row.lastSeenAt.toISOString(),
    landingPath: row.landingPath,
    referrer: row.referrer,
    device: row.device,
    viewportW: row.viewportW,
    viewportH: row.viewportH,
    pageCount: row.pageCount,
    durationMs: row.durationMs,
    maxScroll: row.maxScroll,
    rageClicks: row.rageClicks,
    deadClicks: row.deadClicks,
    events: eventsFromJson(row.events),
  };
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS });
}

export async function GET(
  request: Request,
  context: { params: Promise<{ slug: string }> },
) {
  applyDbCookieFromRequest(request);
  const { slug } = await context.params;
  const clean = slugify(slug);
  const user = await getSessionUser();
  if (!user || !(await dbUserOwnsSpace(clean, user.id))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const url = new URL(request.url);
  const sessionId = url.searchParams.get("sessionId")?.trim() || "";
  if (sessionId) {
    const row = await prisma.insightSession.findUnique({
      where: { id: sessionId },
    });
    if (!row || row.spaceSlug !== clean) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    return NextResponse.json({ session: asSessionRow(row) });
  }

  const heatmapPath = url.searchParams.get("heatmapPath")?.trim() || "";
  const rangeHours = url.searchParams.get("range") === "7d" ? 168 : 24;
  const since = new Date(Date.now() - rangeHours * 60 * 60 * 1000);
  const rows = await prisma.insightSession.findMany({
    where: { spaceSlug: clean, lastSeenAt: { gte: since } },
    orderBy: { lastSeenAt: "desc" },
    take: 300,
  });
  const mapped = rows.map(asSessionRow);
  if (heatmapPath) {
    const path = cleanPath(heatmapPath);
    let snapshot: {
      pageUrl: string;
      width: number;
      height: number;
      capturedAt: Date;
    } | null = null;
    try {
      snapshot = await prisma.insightSnapshot.findUnique({
        where: { spaceSlug_path: { spaceSlug: clean, path } },
        select: { pageUrl: true, width: true, height: true, capturedAt: true },
      });
    } catch {
      snapshot = null;
    }
    const map = buildHeatmap(
      mapped,
      path,
      snapshot
        ? {
            image: `/api/spaces/${encodeURIComponent(clean)}/insights/snapshot?path=${encodeURIComponent(path)}&t=${snapshot.capturedAt.getTime()}`,
            pageUrl: snapshot.pageUrl,
            width: snapshot.width,
            height: snapshot.height,
          }
        : null,
    );
    return NextResponse.json(map);
  }

  const summary = summarizeSessions(mapped, rangeHours);
  let shot = new Set<string>();
  try {
    const snapshots = await prisma.insightSnapshot.findMany({
      where: { spaceSlug: clean },
      select: { path: true },
    });
    shot = new Set(snapshots.map((row) => row.path));
  } catch {
    shot = new Set();
  }
  summary.heatmaps = summary.heatmaps.map((page) => ({
    ...page,
    hasSnapshot: shot.has(page.path),
  }));
  for (const path of shot) {
    if (!summary.heatmaps.some((page) => page.path === path)) {
      summary.heatmaps.push({
        path,
        pageUrl: "",
        clicks: 0,
        hasSnapshot: true,
      });
    }
  }
  return NextResponse.json(summary);
}

export async function POST(
  request: Request,
  context: { params: Promise<{ slug: string }> },
) {
  applyDbCookieFromRequest(request);
  const { slug } = await context.params;
  const clean = slugify(slug);

  let body: Record<string, unknown>;
  try {
    const text = await request.text();
    if (text.length > 64_000) {
      return corsJson({ error: "Too large" }, { status: 413 });
    }
    body = JSON.parse(text) as Record<string, unknown>;
  } catch {
    return corsJson({ error: "Invalid request" }, { status: 400 });
  }

  const sessionId =
    typeof body.sessionId === "string" ? body.sessionId.trim() : "";
  if (!SESSION_ID.test(sessionId)) {
    return corsJson({ error: "Invalid session" }, { status: 400 });
  }

  const space = await prisma.space.findUnique({
    where: { slug: clean },
    select: { slug: true },
  });
  if (!space) return corsJson({ error: "Not found" }, { status: 404 });

  const incoming = Array.isArray(body.events)
    ? body.events
        .slice(0, 80)
        .map((row) => sanitizeEvent(row))
        .filter((row): row is InsightEvent => Boolean(row))
    : [];

  const viewport =
    body.viewport && typeof body.viewport === "object"
      ? (body.viewport as Record<string, unknown>)
      : {};
  const viewportW = Math.max(0, Math.min(4000, Number(viewport.w) || 0));
  const viewportH = Math.max(0, Math.min(4000, Number(viewport.h) || 0));
  const durationMs = Math.max(
    0,
    Math.min(1000 * 60 * 60 * 6, Number(body.durationMs) || 0),
  );
  const startedAtRaw =
    typeof body.startedAt === "string" ? Date.parse(body.startedAt) : NaN;
  const startedAt = Number.isFinite(startedAtRaw)
    ? new Date(startedAtRaw)
    : new Date();
  const now = new Date();

  const existing = await prisma.insightSession.findUnique({
    where: { id: sessionId },
  });
  if (existing && existing.spaceSlug !== clean) {
    return corsJson({ error: "Invalid session" }, { status: 409 });
  }

  const currentEvents = existing ? eventsFromJson(existing.events) : [];
  const events = mergeEvents(currentEvents, incoming);
  const pageCount = Math.max(
    1,
    new Set(events.filter((event) => event.type === "page").map((event) => event.path))
      .size || (existing?.pageCount ?? 1),
  );
  const maxScroll = Math.max(
    existing?.maxScroll ?? 0,
    ...events.map((event) => event.depth ?? 0),
  );
  const rageClicks = events.filter((event) => event.type === "rage").length;
  const deadClicks = events.filter((event) => event.type === "dead").length;
  const firstPage =
    events.find((event) => event.type === "page")?.path ||
    existing?.landingPath ||
    "/";

  const data = {
    spaceSlug: clean,
    startedAt: existing?.startedAt ?? startedAt,
    lastSeenAt: now,
    landingPath: cleanPath(existing?.landingPath || firstPage),
    referrer: existing?.referrer || cleanReferrer(body.referrer),
    device: deviceFromViewport(viewportW || existing?.viewportW || 0),
    viewportW: viewportW || existing?.viewportW || 0,
    viewportH: viewportH || existing?.viewportH || 0,
    pageCount,
    durationMs: Math.max(existing?.durationMs ?? 0, durationMs),
    maxScroll,
    rageClicks,
    deadClicks,
    events: events as unknown as Prisma.InputJsonValue,
  };

  await prisma.insightSession.upsert({
    where: { id: sessionId },
    create: { id: sessionId, ...data },
    update: data,
  });

  if (Math.random() < 0.08) {
    const cutoff = new Date(Date.now() - RETENTION_MS);
    await prisma.insightSession.deleteMany({
      where: { spaceSlug: clean, lastSeenAt: { lt: cutoff } },
    });
    const extra = await prisma.insightSession.findMany({
      where: { spaceSlug: clean },
      orderBy: { lastSeenAt: "desc" },
      skip: MAX_SESSIONS,
      take: 200,
      select: { id: true },
    });
    if (extra.length > 0) {
      await prisma.insightSession.deleteMany({
        where: { id: { in: extra.map((row) => row.id) } },
      });
    }
  }

  return corsJson({ ok: true });
}
