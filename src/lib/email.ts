import { Resend } from "resend";

const RETRYABLE = new Set(["rate_limit_exceeded", "api_error"]);

let client: Resend | null | undefined;

export function getResend(): Resend | null {
  if (client !== undefined) return client;
  const key = process.env.RESEND_API_KEY?.trim();
  client = key ? new Resend(key) : null;
  return client;
}

export function appOrigin(fallback?: string) {
  const explicit =
    process.env.NEXT_PUBLIC_APP_URL?.trim() || process.env.APP_URL?.trim();
  if (explicit) return explicit.replace(/\/$/, "");
  if (fallback) {
    try {
      return new URL(fallback).origin;
    } catch {
      // ignore
    }
  }
  const vercel = process.env.VERCEL_URL?.trim();
  if (vercel) return `https://${vercel.replace(/^https?:\/\//, "").replace(/\/$/, "")}`;
  return "http://localhost:3010";
}

export function fromAddress(businessName: string) {
  const name = businessName.trim() || "OTGF";
  const configured = process.env.RESEND_FROM_EMAIL?.trim();
  if (configured) {
    return configured.includes("<") ? configured : `${name} <${configured}>`;
  }
  return `${name} <onboarding@resend.dev>`;
}

export function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function isValidEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim().toLowerCase());
}

export type EmailPayload = {
  to: string | string[];
  subject: string;
  html: string;
  text: string;
  from: string;
  replyTo?: string;
  idempotencyKey: string;
  tags?: { name: string; value: string }[];
};

export async function sendTransactionalEmail(
  payload: EmailPayload,
): Promise<{ id?: string; error?: string }> {
  const resend = getResend();
  if (!resend) {
    return { error: "Email sending isn’t configured yet." };
  }

  const to = (Array.isArray(payload.to) ? payload.to : [payload.to])
    .map((email) => email.trim().toLowerCase())
    .filter((email) => isValidEmail(email));
  if (to.length === 0) {
    return { error: "No valid recipient." };
  }

  const maxRetries = 3;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const { data, error } =
      to.length === 1
        ? await resend.emails.send(
            {
              from: payload.from,
              to,
              subject: payload.subject,
              html: payload.html,
              text: payload.text,
              ...(payload.replyTo ? { replyTo: payload.replyTo } : {}),
              ...(payload.tags ? { tags: payload.tags } : {}),
            },
            { idempotencyKey: payload.idempotencyKey.slice(0, 256) },
          )
        : await resend.batch.send(
            to.map((email) => ({
              from: payload.from,
              to: [email],
              subject: payload.subject,
              html: payload.html,
              text: payload.text,
              ...(payload.replyTo ? { replyTo: payload.replyTo } : {}),
              ...(payload.tags ? { tags: payload.tags } : {}),
            })),
            { idempotencyKey: `batch-${payload.idempotencyKey}`.slice(0, 256) },
          );

    if (!error) {
      const id = Array.isArray(data)
        ? data[0]?.id
        : data && "id" in data
          ? data.id
          : undefined;
      return { id };
    }

    const name = "name" in error ? String(error.name) : "";
    if (!RETRYABLE.has(name) || attempt === maxRetries) {
      return { error: error.message || "Could not send email." };
    }
    await new Promise((resolve) => setTimeout(resolve, 2 ** attempt * 1000));
  }

  return { error: "Could not send email." };
}

export function wrapEmailHtml(title: string, inner: string) {
  return `<!doctype html>
<html>
  <body style="margin:0;padding:24px;background:#f4f1ec;color:#1c1916;font-family:ui-sans-serif,system-ui,-apple-system,Segoe UI,sans-serif;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;margin:0 auto;background:#fffaf4;border:1px solid #eadfd0;border-radius:16px;">
      <tr>
        <td style="padding:24px 24px 8px;">
          <p style="margin:0 0 16px;font-size:11px;letter-spacing:.08em;text-transform:uppercase;color:#8a7b6b;">${escapeHtml(title)}</p>
          ${inner}
        </td>
      </tr>
    </table>
  </body>
</html>`;
}
