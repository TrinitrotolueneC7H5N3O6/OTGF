import { dbGetSpaceMeta } from "@/lib/spaceServer";
import { onSpaceEvent, type SpaceLiveEvent } from "@/lib/spaceEvents";
import { slugify } from "@/lib/spaceNormalize";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const encoder = new TextEncoder();

function frame(event: SpaceLiveEvent | { type: "hello" } | string) {
  if (typeof event === "string") return encoder.encode(event);
  return encoder.encode(`data: ${JSON.stringify(event)}\n\n`);
}

export async function GET(
  request: Request,
  context: { params: Promise<{ slug: string }> },
) {
  const { slug } = await context.params;
  const clean = slugify(slug);
  const meta = await dbGetSpaceMeta(clean);
  if (!meta) {
    return new Response(JSON.stringify({ error: "Not found" }), {
      status: 404,
      headers: { "Content-Type": "application/json" },
    });
  }

  const stream = new ReadableStream({
    start(controller) {
      const send = (event: SpaceLiveEvent) => {
        try {
          controller.enqueue(frame(event));
        } catch {
          // stream already closed
        }
      };

      send({ type: "meta", ...meta });
      const unsubscribe = onSpaceEvent(clean, send);
      const ping = setInterval(() => {
        try {
          controller.enqueue(frame(": ping\n\n"));
        } catch {
          clearInterval(ping);
        }
      }, 20_000);

      const shutdown = () => {
        clearInterval(ping);
        unsubscribe();
        try {
          controller.close();
        } catch {
          // already closed
        }
      };

      request.signal.addEventListener("abort", shutdown);
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
