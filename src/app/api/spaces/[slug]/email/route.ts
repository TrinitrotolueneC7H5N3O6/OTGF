import { NextResponse } from "next/server";
import { dbGetSpace } from "@/lib/spaceServer";
import { reconnectChatPath } from "@/lib/customerAutoReply";
import { appOrigin, isValidEmail } from "@/lib/email";
import { sendCustomerChatLinkEmail } from "@/lib/emailAlerts";

type Body = {
  kind?: string;
  chatId?: string;
  email?: string;
  origin?: string;
};

export async function POST(
  request: Request,
  context: { params: Promise<{ slug: string }> },
) {
  const { slug } = await context.params;
  const body = (await request.json().catch(() => ({}))) as Body;
  if (body.kind !== "chat_link") {
    return NextResponse.json({ error: "Unknown email kind." }, { status: 400 });
  }

  const chatId = body.chatId?.trim() ?? "";
  const email = body.email?.trim().toLowerCase() ?? "";
  if (!chatId || !isValidEmail(email)) {
    return NextResponse.json(
      { error: "Enter a valid email for this chat." },
      { status: 400 },
    );
  }

  const space = await dbGetSpace(slug, { chatIds: [chatId], threadOnly: true });
  if (!space) {
    return NextResponse.json({ error: "Space not found" }, { status: 404 });
  }
  if (!space.settings.emailAlerts?.customerChatLink) {
    return NextResponse.json(
      { error: "Chat-link emails are turned off for this space." },
      { status: 400 },
    );
  }

  const client = space.clients.find((item) => item.id === chatId);
  if (!client) {
    return NextResponse.json({ error: "Chat not found" }, { status: 404 });
  }

  const origin = appOrigin(body.origin || request.headers.get("origin") || undefined);
  const result = await sendCustomerChatLinkEmail({
    businessName: space.business.name,
    to: email,
    chatUrl: `${origin}${reconnectChatPath(space.business.slug, chatId)}`,
    slug: space.business.slug,
    chatId,
  });

  if (result.error) {
    const testing =
      /testing emails|verify a domain/i.test(result.error);
    return NextResponse.json(
      {
        error: testing
          ? "This email couldn’t be sent yet. The business still needs to finish email setup."
          : result.error,
      },
      { status: 502 },
    );
  }
  return NextResponse.json({ ok: true, id: result.id });
}
