import { dbChatExists, dbTouchPresence } from "@/lib/spaceServer";

/** Customer tab heartbeat — upsert one presence row, push tiny SSE patch. */
export async function POST(
  request: Request,
  context: { params: Promise<{ slug: string }> },
) {
  const { slug } = await context.params;
  const body = (await request.json().catch(() => ({}))) as {
    chatId?: string;
    id?: string;
  };
  const chatId = String(body.id ?? body.chatId ?? "").trim();
  if (!chatId) {
    return new Response(null, { status: 400 });
  }

  if (!(await dbChatExists(slug, chatId))) {
    return new Response(null, { status: 204 });
  }

  await dbTouchPresence(slug, chatId);
  return new Response(null, { status: 204 });
}
