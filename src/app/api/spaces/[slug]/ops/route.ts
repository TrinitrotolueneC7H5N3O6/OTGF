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

  try {
    await dbApplySpaceOp(slug, op);
    return NextResponse.json({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed";
    const status = message === "Space not found" ? 404 : 400;
    return NextResponse.json({ error: message }, { status });
  }
}
