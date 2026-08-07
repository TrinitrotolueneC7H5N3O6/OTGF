import { NextResponse } from "next/server";
import { randomBytes } from "crypto";
import { getSessionUser } from "@/lib/auth";
import { prisma } from "@/lib/db";

function newId() {
  return `fb_${Date.now().toString(36)}_${randomBytes(4).toString("hex")}`;
}

export async function POST(req: Request) {
  let body: { message?: string; email?: string; page?: string };
  try {
    body = (await req.json()) as {
      message?: string;
      email?: string;
      page?: string;
    };
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  const message = typeof body.message === "string" ? body.message.trim() : "";
  if (!message || message.length > 4000) {
    return NextResponse.json(
      { error: "Write a short note (under 4000 characters)." },
      { status: 400 },
    );
  }

  let email =
    typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return NextResponse.json({ error: "Enter a valid email." }, { status: 400 });
  }

  const page =
    typeof body.page === "string" ? body.page.trim().slice(0, 200) : "";

  const user = await getSessionUser();
  if (!email && user?.email) email = user.email;

  await prisma.feedback.create({
    data: {
      id: newId(),
      message,
      email: email || null,
      page: page || null,
      userId: user?.id ?? null,
    },
  });

  return NextResponse.json({ ok: true });
}
