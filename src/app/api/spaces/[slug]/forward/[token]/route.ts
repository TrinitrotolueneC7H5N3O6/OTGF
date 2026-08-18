import { NextResponse } from "next/server";
import { dbGetForwardInvite, dbJoinForward } from "@/lib/spaceServer";

export async function GET(
  _request: Request,
  context: { params: Promise<{ slug: string; token: string }> },
) {
  const { slug, token } = await context.params;
  const invite = await dbGetForwardInvite(token, slug);
  if (!invite || invite.slug !== slug) {
    return NextResponse.json(
      { error: "This forward link expired." },
      { status: 404 },
    );
  }
  return NextResponse.json(invite);
}

export async function POST(
  request: Request,
  context: { params: Promise<{ slug: string; token: string }> },
) {
  const { slug, token } = await context.params;
  const invite = await dbGetForwardInvite(token, slug);
  if (!invite || invite.slug !== slug) {
    return NextResponse.json(
      { error: "This forward link expired." },
      { status: 404 },
    );
  }
  const body = (await request.json().catch(() => ({}))) as {
    name?: string;
    department?: string;
    participantId?: string;
  };
  try {
    const result = await dbJoinForward(token, {
      name: String(body.name ?? ""),
      department: body.department,
      participantId: body.participantId,
    }, slug);
    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed";
    const status =
      message === "This forward link expired." || message === "Chat not found"
        ? 404
        : 400;
    return NextResponse.json({ error: message }, { status });
  }
}
