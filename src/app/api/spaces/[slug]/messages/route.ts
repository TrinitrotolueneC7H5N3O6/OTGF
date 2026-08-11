import { NextResponse } from "next/server";
import type { Client, Message } from "@/lib/types";
import { dbAppendMessage } from "@/lib/spaceServer";

type Body = {
  message?: Message;
  client?: Client;
  upsertClient?: boolean;
  clearDeleted?: boolean;
  bumpClient?: boolean;
};

export async function POST(
  request: Request,
  context: { params: Promise<{ slug: string }> },
) {
  const { slug } = await context.params;
  const body = (await request.json().catch(() => ({}))) as Body;
  if (!body.message?.id || !body.message.clientId || !body.client?.id) {
    return NextResponse.json({ error: "Invalid message" }, { status: 400 });
  }
  if (body.message.clientId !== body.client.id) {
    return NextResponse.json({ error: "client mismatch" }, { status: 400 });
  }

  try {
    const result = await dbAppendMessage(slug, {
      message: body.message,
      client: body.client,
      upsertClient: body.upsertClient,
      clearDeleted: body.clearDeleted,
      bumpClient: body.bumpClient,
    });
    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed";
    const status = message === "Space not found" ? 404 : 400;
    return NextResponse.json({ error: message }, { status });
  }
}
