import { NextResponse } from "next/server";
import { isR2Configured, uploadObjectToR2 } from "@/lib/r2";

export const runtime = "nodejs";

const MAX_BYTES = 4 * 1024 * 1024;

export async function GET() {
  return NextResponse.json({ enabled: isR2Configured() });
}

export async function POST(request: Request) {
  if (!isR2Configured()) {
    return NextResponse.json({ error: "R2 is not configured" }, { status: 503 });
  }

  const form = await request.formData().catch(() => null);
  const file = form?.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "file required" }, { status: 400 });
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json({ error: "File too large" }, { status: 413 });
  }

  const type = file.type || "application/octet-stream";
  const isPhoto = type.startsWith("image/");
  const isVideo = type.startsWith("video/");
  if (!isPhoto && !isVideo) {
    return NextResponse.json({ error: "Use a photo or video" }, { status: 400 });
  }

  const extFromName = file.name.split(".").pop()?.toLowerCase();
  const ext = isPhoto ? "jpg" : extFromName || "mp4";

  try {
    const url = await uploadObjectToR2({
      body: Buffer.from(await file.arrayBuffer()),
      contentType: isPhoto ? "image/jpeg" : type,
      ext,
    });
    return NextResponse.json({ url });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Upload failed";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
