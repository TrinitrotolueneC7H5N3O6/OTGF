import { createHmac, timingSafeEqual } from "node:crypto";

export function normalizePhoneNumber(value: string) {
  const trimmed = value.trim();
  if (!trimmed.startsWith("+")) return "";
  const digits = trimmed.slice(1).replace(/\D/g, "");
  return digits ? `+${digits}` : "";
}

export function isValidPhoneNumber(value: string) {
  return /^\+[1-9]\d{7,14}$/.test(value);
}

function signingSecret() {
  return (
    process.env.PHONE_ALERT_SIGNING_SECRET?.trim() ||
    process.env.TWILIO_AUTH_TOKEN?.trim() ||
    ""
  );
}

export function signPhoneConnection(slug: string, phoneNumber: string) {
  const secret = signingSecret();
  if (!secret) throw new Error("Phone alerts are not configured.");
  return createHmac("sha256", secret)
    .update(`${slug}:${phoneNumber}`)
    .digest("base64url");
}

export function verifyPhoneConnection(
  slug: string,
  phoneNumber: string,
  token: string,
) {
  if (!token) return false;
  let expected: string;
  try {
    expected = signPhoneConnection(slug, phoneNumber);
  } catch {
    return false;
  }
  const expectedBytes = Buffer.from(expected);
  const tokenBytes = Buffer.from(token);
  return (
    expectedBytes.length === tokenBytes.length &&
    timingSafeEqual(expectedBytes, tokenBytes)
  );
}

export async function sendTwilioSms(input: { to: string; text: string }) {
  const accountSid = process.env.TWILIO_ACCOUNT_SID?.trim();
  const authToken = process.env.TWILIO_AUTH_TOKEN?.trim();
  const from = normalizePhoneNumber(process.env.TWILIO_FROM_NUMBER?.trim() || "");
  const messagingServiceSid = process.env.TWILIO_MESSAGING_SERVICE_SID?.trim();
  if (
    !accountSid ||
    !authToken ||
    (!isValidPhoneNumber(from) && !messagingServiceSid)
  ) {
    return {
      error:
        "Phone alerts need Twilio credentials and either a sender number or Messaging Service SID.",
    };
  }
  const to = normalizePhoneNumber(input.to);
  if (!isValidPhoneNumber(to)) return { error: "Enter a valid phone number with country code." };
  const text = Array.from(input.text.trim()).slice(0, 700).join("");
  if (!text) return { error: "SMS message is empty." };

  const form = new URLSearchParams({ To: to, Body: text });
  if (messagingServiceSid) form.set("MessagingServiceSid", messagingServiceSid);
  else form.set("From", from);

  const response = await fetch(
    `https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(accountSid)}/Messages.json`,
    {
      method: "POST",
      headers: {
        Authorization: `Basic ${Buffer.from(`${accountSid}:${authToken}`).toString("base64")}`,
        "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8",
      },
      body: form,
      cache: "no-store",
      signal: AbortSignal.timeout(15_000),
    },
  );
  const payload = (await response.json().catch(() => null)) as
    | { sid?: string; code?: number; message?: string }
    | null;
  if (!response.ok) {
    return {
      error: payload?.message || "Twilio could not send the SMS.",
    };
  }
  return { id: payload?.sid };
}
