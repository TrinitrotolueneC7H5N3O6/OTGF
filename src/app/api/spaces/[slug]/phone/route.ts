import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { appOrigin } from "@/lib/email";
import { dbGetSpace, dbUserOwnsSpace } from "@/lib/spaceServer";
import {
  isValidPhoneNumber,
  normalizePhoneNumber,
  sendTwilioSms,
  signPhoneConnection,
} from "@/lib/phoneAlerts";

type Body = {
  action?: string;
  phoneNumber?: string;
  sampleType?: string;
};

type SampleType =
  | "new-chat"
  | "new-message"
  | "away-message"
  | "after-hours"
  | "contact-captured";

const SAMPLE_TYPES = new Set<SampleType>([
  "new-chat",
  "new-message",
  "away-message",
  "after-hours",
  "contact-captured",
]);

function sampleSms(type: SampleType, businessName: string, floorUrl: string) {
  switch (type) {
    case "new-message":
      return `New message from Jamie\n\nJamie sent a message.\n\nCould someone tell me which service would be the best fit?\n\nOpen inbox: ${floorUrl}`;
    case "away-message":
      return `Jamie wrote while you’re away\n\nJamie sent a message while live chat is off.\n\nI’d like to book a consultation for next week.\n\nOpen inbox: ${floorUrl}`;
    case "after-hours":
      return `After-hours intake from Jamie\n\nJamie submitted an after-hours intake.\n\nInterested in a consultation and available tomorrow afternoon.\n\nOpen inbox: ${floorUrl}`;
    case "contact-captured":
      return `Jamie left contact details\n\nJamie left contact details after chat.\n\njamie@example.com · (555) 010-1234\n\nOpen inbox: ${floorUrl}`;
    case "new-chat":
      return `New chat on ${businessName}\n\nJamie started a chat.\n\nHi, I’d like to learn more about your services.\n\nOpen inbox: ${floorUrl}`;
  }
}

export async function POST(
  request: Request,
  context: { params: Promise<{ slug: string }> },
) {
  const { slug } = await context.params;
  const user = await getSessionUser();
  if (!user || !(await dbUserOwnsSpace(slug, user.id))) {
    return NextResponse.json({ error: "Not authorized." }, { status: 401 });
  }
  const body = (await request.json().catch(() => ({}))) as Body;
  if (body.action !== "connect" && body.action !== "sample") {
    return NextResponse.json({ error: "Unknown phone action." }, { status: 400 });
  }
  const phoneNumber = normalizePhoneNumber(body.phoneNumber || "");
  if (!isValidPhoneNumber(phoneNumber)) {
    return NextResponse.json(
      { error: "Enter a valid phone number including country code, such as +14155551234." },
      { status: 400 },
    );
  }
  const space = await dbGetSpace(slug);
  if (!space) return NextResponse.json({ error: "Space not found." }, { status: 404 });

  let text = `${space.business.name}: Phone alerts are connected. You’ll receive enabled team notifications here.`;
  if (body.action === "sample") {
    if (!SAMPLE_TYPES.has(body.sampleType as SampleType)) {
      return NextResponse.json({ error: "Choose a valid sample notification." }, { status: 400 });
    }
    const floorUrl = `${appOrigin(request.url)}/${space.business.slug}/live-chat`;
    text = sampleSms(body.sampleType as SampleType, space.business.name, floorUrl);
  }
  const result = await sendTwilioSms({ to: phoneNumber, text });
  if (result.error) {
    return NextResponse.json({ error: result.error }, { status: 502 });
  }
  if (body.action === "sample") {
    return NextResponse.json({ ok: true, phoneNumber });
  }
  return NextResponse.json({
    ok: true,
    phoneNumber,
    verificationToken: signPhoneConnection(space.business.slug, phoneNumber),
  });
}
