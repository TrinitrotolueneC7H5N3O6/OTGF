import { NextResponse } from "next/server";
import type { SpaceOp } from "@/lib/spaceOps";
import { dbApplySpaceOp } from "@/lib/spaceServer";

export async function POST(
  request: Request,
  context: { params: Promise<{ slug: string }> },
) {
  const { slug } = await context.params;
  const op = (await request.json().catch(() => null)) as SpaceOp | null;
  if (!op || typeof op !== "object" || !("type" in op) || !op.type) {
    return NextResponse.json({ error: "Invalid op" }, { status: 400 });
  }

  if (op.type === "createScheduleRequest" && !op.schedulerId) return NextResponse.json({ error: "Choose an event type." }, { status: 400 });

  try {
    await dbApplySpaceOp(slug, op);
    return NextResponse.json({ ok: true });
  } catch (err) {
    const raw = err instanceof Error ? err.message : "Failed";
    const message =
      raw.includes("does not exist in the current database") ||
      raw.includes("TURBOPACK")
        ? "Could not save that. Try again in a moment."
        : raw;
    const status = raw === "Space not found" ? 404 : 400;
    return NextResponse.json({ error: message }, { status });
  }
}
