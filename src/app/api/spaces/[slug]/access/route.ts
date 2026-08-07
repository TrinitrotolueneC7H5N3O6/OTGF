import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { dbUserOwnsSpace } from "@/lib/spaceServer";

export async function GET(
  _request: Request,
  context: { params: Promise<{ slug: string }> },
) {
  const { slug } = await context.params;
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ user: null, owns: false });
  }
  const owns = await dbUserOwnsSpace(slug, user.id);
  return NextResponse.json({ user, owns });
}
