import { NextResponse } from "next/server";
import { dbCreateForwardLink } from "@/lib/spaceServer";

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
  try {
    const result = await dbCreateForwardLink(slug, chatId);
    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed";
    const status = message === "Chat not found" ? 404 : 400;
    return NextResponse.json({ error: message }, { status });
  }
}
