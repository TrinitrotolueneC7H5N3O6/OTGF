import { NextResponse } from "next/server";
import { dbGetSpace, dbTouchPresence } from "@/lib/spaceServer";

export async function POST(
  request: Request,
  context: { params: Promise<{ slug: string }> },
) {
  const { slug } = await context.params;
  const body = (await request.json().catch(() => ({}))) as { chatId?: string };
  const chatId = String(body.chatId ?? "").trim();
  if (!chatId) {
    return NextResponse.json({ error: "chatId required" }, { status: 400 });
  }

  const space = await dbGetSpace(slug);
  if (!space) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  if (!space.clients.some((c) => c.id === chatId)) {
    return NextResponse.json({ presentAt: null, skipped: true });
  }

  const result = await dbTouchPresence(slug, chatId);
  return NextResponse.json(result);
}
