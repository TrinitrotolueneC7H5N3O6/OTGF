import { NextResponse } from "next/server";
import { fetchLinkPreview, isPublicHttpUrl } from "@/lib/linkPreview";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const raw = new URL(request.url).searchParams.get("url") || "";
  if (!isPublicHttpUrl(raw)) {
    return NextResponse.json({ error: "Invalid url" }, { status: 400 });
  }
  const parentOrigin = new URL(request.url).origin;
  const preview = await fetchLinkPreview(raw, parentOrigin);
  if (!preview) {
    return NextResponse.json({ error: "Unavailable" }, { status: 422 });
  }
  return NextResponse.json(preview);
}
