import { NextResponse } from "next/server";
import type { Trade } from "@/lib/types";
import { getSessionUser } from "@/lib/auth";
import { dbCreateBusiness, dbListBusinesses } from "@/lib/spaceServer";

export async function GET() {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json([]);
  }
  const businesses = await dbListBusinesses(user.id);
  return NextResponse.json(businesses);
}

export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as {
    name?: string;
    trade?: Trade;
  };
  if (!body.name?.trim()) {
    return NextResponse.json({ error: "Name required" }, { status: 400 });
  }
  const user = await getSessionUser();
  const space = await dbCreateBusiness(
    body.name,
    body.trade ?? "salon",
    user?.id,
  );
  return NextResponse.json(space);
}
