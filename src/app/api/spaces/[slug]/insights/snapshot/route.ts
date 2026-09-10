import { randomBytes } from "crypto";
import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { applyDbCookieFromRequest, prisma } from "@/lib/db";
import { cleanPageUrl, cleanPath } from "@/lib/insights";
import { dbUserOwnsSpace } from "@/lib/spaceServer";
import { slugify } from "@/lib/spaceNormalize";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
  "Access-Control-Max-Age": "86400",
};

const IMAGE = /^data:image\/(jpeg|jpg|png);base64,([a-z0-9+/=\s]+)$/i;
const MAX_IMAGE = 480_000;

function corsJson(body: unknown, init?: { status?: number }) {
  return NextResponse.json(body, {
    status: init?.status ?? 200,
    headers: CORS,
  });
}

function bytesFromDataUrl(image: string) {
  const match = image.trim().match(IMAGE);
  if (!match) return null;
  const kind = match[1].toLowerCase() === "png" ? "image/png" : "image/jpeg";
  return {
    type: kind,
    body: Buffer.from(match[2].replace(/\s/g, ""), "base64"),
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
    return new NextResponse("Unauthorized", { status: 401 });
  }

  const path = cleanPath(new URL(request.url).searchParams.get("path"));
  try {
    const row = await prisma.insightSnapshot.findUnique({
      where: { spaceSlug_path: { spaceSlug: clean, path } },
      select: { image: true },
    });
    const parsed = row ? bytesFromDataUrl(row.image) : null;
    if (!parsed) return new NextResponse("Not found", { status: 404 });
    return new NextResponse(parsed.body, {
      headers: {
        "Content-Type": parsed.type,
        "Cache-Control": "private, max-age=120",
      },
    });
  } catch {
    return new NextResponse("Not found", { status: 404 });
  }
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
    if (text.length > MAX_IMAGE + 8_000) {
      return corsJson({ error: "Too large" }, { status: 413 });
    }
    body = JSON.parse(text) as Record<string, unknown>;
  } catch {
    return corsJson({ error: "Invalid request" }, { status: 400 });
  }

  const space = await prisma.space.findUnique({
    where: { slug: clean },
    select: { slug: true },
  });
  if (!space) return corsJson({ error: "Not found" }, { status: 404 });

  const path = cleanPath(body.path);
  const pageUrl = cleanPageUrl(body.pageUrl);
  const image = typeof body.image === "string" ? body.image.trim() : "";
  if (!IMAGE.test(image) || image.length > MAX_IMAGE) {
    return corsJson({ error: "Invalid snapshot" }, { status: 400 });
  }
  const width = Math.max(0, Math.min(2400, Number(body.width) || 0));
  const height = Math.max(0, Math.min(8000, Number(body.height) || 0));
  const id = `shot_${Date.now().toString(36)}_${randomBytes(3).toString("hex")}`;

  try {
    await prisma.insightSnapshot.upsert({
      where: { spaceSlug_path: { spaceSlug: clean, path } },
      update: { image, pageUrl, width, height, capturedAt: new Date() },
      create: {
        id,
        spaceSlug: clean,
        path,
        pageUrl,
        image,
        width,
        height,
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Could not save snapshot";
    console.error("[insights/snapshot]", message);
    return corsJson({ error: "Could not save snapshot" }, { status: 500 });
  }

  return corsJson({ ok: true });
}
