import { NextResponse } from "next/server";
import type { BusinessSpace, Trade } from "@/lib/types";
import { getSessionUser } from "@/lib/auth";
import {
  dbEnsureSpace,
  dbGetSpace,
  dbGetSpaceMeta,
  dbSaveSpace,
} from "@/lib/spaceServer";

export async function GET(
  request: Request,
  context: { params: Promise<{ slug: string }> },
) {
  const { slug } = await context.params;
  const metaOnly = new URL(request.url).searchParams.get("meta") === "1";
  if (metaOnly) {
    const meta = await dbGetSpaceMeta(slug);
    if (!meta) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    return NextResponse.json(meta);
  }
  const space = await dbGetSpace(slug);
  if (!space) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  return NextResponse.json(space);
}

/** Ensure space exists (create from slug if needed). */
export async function POST(
  request: Request,
  context: { params: Promise<{ slug: string }> },
) {
  const { slug } = await context.params;
  const existing = await dbGetSpace(slug);
  if (existing) {
    return NextResponse.json(existing);
  }
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  const body = (await request.json().catch(() => ({}))) as { trade?: Trade };
  const space = await dbEnsureSpace(slug, body.trade ?? "salon");
  const { dbClaimSpace } = await import("@/lib/spaceServer");
  await dbClaimSpace(slug, user.id);
  return NextResponse.json(space);
}

/** Replace entire space document. */
export async function PUT(
  request: Request,
  context: { params: Promise<{ slug: string }> },
) {
  const { slug } = await context.params;
  const body = (await request.json()) as BusinessSpace;
  if (!body?.business?.slug) {
    return NextResponse.json({ error: "Invalid space" }, { status: 400 });
  }
  // Customer chat + floor both write via PUT. Floor UI is gated by auth;
  // public customer writes still need to land.
  const space = await dbSaveSpace({
    ...body,
    business: { ...body.business, slug: body.business.slug || slug },
  });
  return NextResponse.json(space);
}
