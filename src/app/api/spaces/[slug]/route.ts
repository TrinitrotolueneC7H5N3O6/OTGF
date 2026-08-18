import { NextResponse } from "next/server";
import type { BusinessSpace, Trade } from "@/lib/types";
import { getSessionUser } from "@/lib/auth";
import {
  dbEnsureSpace,
  dbGetSpace,
  dbGetSpaceEntry,
  dbGetSpaceFloorBoot,
  dbGetSpaceMeta,
  dbSaveSpace,
} from "@/lib/spaceServer";

function isDbUnreachable(err: unknown) {
  const message = err instanceof Error ? err.message : String(err);
  return (
    message.includes("Can't reach database server") ||
    message.includes("P1001") ||
    message.includes("P1017")
  );
}

function dbErrorResponse(err: unknown) {
  if (isDbUnreachable(err)) {
    return NextResponse.json(
      { error: "Database unavailable — try again in a moment" },
      { status: 503 },
    );
  }
  console.error(err);
  return NextResponse.json({ error: "Could not load space" }, { status: 500 });
}

export async function GET(
  request: Request,
  context: { params: Promise<{ slug: string }> },
) {
  try {
    const { slug } = await context.params;
    const url = new URL(request.url);
    const metaOnly = url.searchParams.get("meta") === "1";
    const entryOnly = url.searchParams.get("entry") === "1";
    const chatId = url.searchParams.get("chatId")?.trim();
    const chatIdsParam = url.searchParams.get("chatIds")?.trim();
    const threadOnly = url.searchParams.get("threadOnly") === "1";
    const floorBoot = url.searchParams.get("floorBoot") === "1";
    const chatIds = chatIdsParam
      ? chatIdsParam.split(",").map((id) => id.trim()).filter(Boolean)
      : chatId
        ? [chatId]
        : undefined;
    if (metaOnly) {
      const meta = await dbGetSpaceMeta(slug);
      if (!meta) {
        return NextResponse.json({ error: "Not found" }, { status: 404 });
      }
      return NextResponse.json(meta);
    }
    if (entryOnly) {
      const entry = await dbGetSpaceEntry(slug, {
        chatId: chatId || undefined,
      });
      if (!entry) {
        return NextResponse.json({ error: "Not found" }, { status: 404 });
      }
      return NextResponse.json(entry);
    }
    if (floorBoot) {
      const space = await dbGetSpaceFloorBoot(slug);
      if (!space) {
        return NextResponse.json({ error: "Not found" }, { status: 404 });
      }
      return NextResponse.json(space);
    }
    const space = await dbGetSpace(slug, {
      chatIds,
      threadOnly: threadOnly && Boolean(chatIds?.length),
    });
    if (!space) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    return NextResponse.json(space);
  } catch (err) {
    return dbErrorResponse(err);
  }
}

/** Ensure space exists (create from slug if needed). */
export async function POST(
  request: Request,
  context: { params: Promise<{ slug: string }> },
) {
  try {
    const { slug } = await context.params;
    const body = (await request.json().catch(() => ({}))) as {
      trade?: Trade;
      floorBoot?: boolean;
    };
    const floorBoot = body.floorBoot === true;
    const existing = floorBoot
      ? await dbGetSpaceFloorBoot(slug)
      : await dbGetSpace(slug);
    if (existing) {
      return NextResponse.json(existing);
    }
    const user = await getSessionUser();
    if (!user) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    await dbEnsureSpace(slug, body.trade ?? "salon");
    const { dbClaimSpace } = await import("@/lib/spaceServer");
    await dbClaimSpace(slug, user.id);
    const space = floorBoot
      ? await dbGetSpaceFloorBoot(slug)
      : await dbGetSpace(slug);
    if (!space) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    return NextResponse.json(space);
  } catch (err) {
    return dbErrorResponse(err);
  }
}

/** Replace entire space document. */
export async function PUT(
  request: Request,
  context: { params: Promise<{ slug: string }> },
) {
  try {
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
  } catch (err) {
    return dbErrorResponse(err);
  }
}
