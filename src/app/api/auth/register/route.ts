import { NextResponse } from "next/server";
import {
  createSession,
  createUser,
  sessionCookieOptions,
  SESSION_COOKIE,
} from "@/lib/auth";
import { dbClaimSpace } from "@/lib/spaceServer";

export async function POST(request: Request) {
  try {
    const body = (await request.json().catch(() => ({}))) as {
      email?: string;
      password?: string;
      name?: string;
      claimSlug?: string;
    };
    if (!body.email || !body.password) {
      return NextResponse.json(
        { error: "Email and password are required." },
        { status: 400 },
      );
    }
    const user = await createUser({
      email: body.email,
      password: body.password,
      name: body.name,
    });
    if (body.claimSlug?.trim()) {
      await dbClaimSpace(body.claimSlug, user.id);
    }
    const { token, expiresAt } = await createSession(user.id);
    const res = NextResponse.json({
      user: { id: user.id, email: user.email, name: user.name },
    });
    res.cookies.set(SESSION_COOKIE, token, sessionCookieOptions(expiresAt));
    return res;
  } catch (err) {
    const message = err instanceof Error ? err.message : "Could not create account.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
