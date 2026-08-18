import { NextResponse } from "next/server";
import {
  DB_COOKIE,
  dbStatus,
  defaultDbTarget,
  getDbTarget,
  setDbTarget,
  type DbTarget,
} from "@/lib/db";

function parseTarget(value: unknown): DbTarget | null {
  return value === "local" || value === "supabase" ? value : null;
}

function applyCookie(request: Request) {
  const raw = request.headers
    .get("cookie")
    ?.split(";")
    .map((p) => p.trim())
    .find((p) => p.startsWith(`${DB_COOKIE}=`))
    ?.slice(DB_COOKIE.length + 1);
  const fromCookie = parseTarget(raw);
  if (fromCookie) {
    try {
      setDbTarget(fromCookie);
    } catch {
      // ignore invalid combo (e.g. local requested but URL missing)
    }
  }
}

function payload() {
  return {
    target: getDbTarget(),
    defaultTarget: defaultDbTarget(),
    ...dbStatus(),
    enabled: process.env.NODE_ENV !== "production",
  };
}

export async function GET(request: Request) {
  if (process.env.NODE_ENV === "production") {
    return NextResponse.json({ enabled: false }, { status: 404 });
  }
  applyCookie(request);
  return NextResponse.json(payload());
}

export async function POST(request: Request) {
  if (process.env.NODE_ENV === "production") {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  const body = (await request.json().catch(() => ({}))) as { target?: string };
  const target = parseTarget(body.target);
  if (!target) {
    return NextResponse.json({ error: "target must be local or supabase" }, { status: 400 });
  }
  try {
    setDbTarget(target);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Could not switch database";
    return NextResponse.json({ error: message }, { status: 400 });
  }
  const res = NextResponse.json(payload());
  res.cookies.set(DB_COOKIE, target, {
    path: "/",
    sameSite: "lax",
    httpOnly: false,
    maxAge: 60 * 60 * 24 * 365,
  });
  return res;
}
