import { NextResponse } from "next/server";
import { dbToggleReaction } from "@/lib/spaceServer";

type Body = {
  messageId?: string;
  emoji?: string;
  actor?: {
    from?: "business" | "client";
    fromMemberId?: string;
    fromName?: string;
  };
};

export async function POST(
  request: Request,
  context: { params: Promise<{ slug: string }> },
) {
  const { slug } = await context.params;
  const body = (await request.json().catch(() => ({}))) as Body;
  const messageId = String(body.messageId ?? "").trim();
  const emoji = String(body.emoji ?? "").trim();
  const from = body.actor?.from;
  if (!messageId || !emoji || (from !== "business" && from !== "client")) {
    return NextResponse.json({ error: "Invalid reaction" }, { status: 400 });
  }

  try {
    const result = await dbToggleReaction(slug, {
      messageId,
      emoji,
      actor: {
        from,
        ...(body.actor?.fromMemberId
          ? { fromMemberId: body.actor.fromMemberId }
          : {}),
        ...(body.actor?.fromName ? { fromName: body.actor.fromName } : {}),
      },
    });
    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed";
    const status = message === "Space not found" || message === "Message not found"
      ? 404
      : 400;
    return NextResponse.json({ error: message }, { status });
  }
}
