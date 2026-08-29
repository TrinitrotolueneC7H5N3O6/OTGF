import type { Client, FloorSettings, Message } from "./types";
import { reconnectChatPath } from "./customerAutoReply";
import { EMAIL_ALERT_DEFAULTS } from "./emailAlertOptions";
import {
  appOrigin,
  escapeHtml,
  fromAddress,
  isValidEmail,
  sendTransactionalEmail,
  wrapEmailHtml,
} from "./email";

const META_PREFIXES = [
  "Staff-out intake:",
  "End screen contact:",
  "Email for reply:",
  "Email this chat link to me:",
  "Recording email:",
] as const;

type ClientNotice =
  | "staff_out"
  | "end_screen"
  | "email_reply"
  | "chat_link"
  | "chat"
  | "ignore";

function previewText(value: string, max = 280) {
  const compact = value.replace(/\s+/g, " ").trim();
  if (compact.length <= max) return compact;
  return `${compact.slice(0, max - 1)}…`;
}

function customerEmail(client: Client, fallback?: string) {
  const raw =
    client.email ||
    client.contactInfo?.email ||
    client.staffOutIntake?.email ||
    fallback ||
    "";
  const email = raw.trim().toLowerCase();
  return isValidEmail(email) ? email : "";
}

function extractEmail(body: string) {
  const match = body.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i);
  return match && isValidEmail(match[0]) ? match[0].toLowerCase() : "";
}

function classifyClientNotice(message: Message): ClientNotice {
  if (message.from !== "client") return "ignore";
  if (message.kind === "system") return "ignore";
  const body = message.body?.trim() ?? "";
  if (body.startsWith("Staff-out intake:")) return "staff_out";
  if (body.startsWith("End screen contact:")) return "end_screen";
  if (body.startsWith("Email for reply:")) return "email_reply";
  if (body.startsWith("Email this chat link to me:")) return "chat_link";
  if (body.startsWith("Recording email:")) return "ignore";
  return "chat";
}

function isChatCustomerMessage(message: Message) {
  if (message.from !== "client") return false;
  if (message.kind === "system") return false;
  const body = message.body?.trim() ?? "";
  if (META_PREFIXES.some((prefix) => body.startsWith(prefix))) return false;
  if (
    message.kind === "image" ||
    message.kind === "video" ||
    message.kind === "link" ||
    message.kind === "item"
  ) {
    return true;
  }
  return Boolean(body);
}

function messageLine(message: Message) {
  if (message.kind === "receipt") {
    const title = message.receipt?.productTitle || "Receipt";
    const price = message.receipt?.productPrice
      ? ` (${message.receipt.productPrice})`
      : "";
    return `${title}${price}`;
  }
  if (message.kind === "image") return message.body.trim() || "Photo";
  if (message.kind === "video") return message.body.trim() || "Video";
  if (message.kind === "item") return message.body.trim() || "Product inquiry";
  return message.body.trim();
}

function threadLines(thread: Message[], clientId: string) {
  return thread
    .filter((message) => message.clientId === clientId)
    .filter((message) => classifyClientNotice(message) === "chat" || message.from === "business")
    .filter((message) => !message.id.startsWith("m-auto-"))
    .slice(-40)
    .map((message) => {
      const who = message.from === "client" ? "Customer" : "Team";
      return `${who}: ${previewText(messageLine(message), 400)}`;
    })
    .filter((line) => !line.endsWith(":"));
}

function ctaHtml(href: string, label: string) {
  return `<p style="margin:20px 0 0;"><a href="${escapeHtml(href)}" style="display:inline-block;background:#1c1916;color:#fffaf4;text-decoration:none;padding:10px 16px;border-radius:999px;font-size:14px;font-weight:650;">${escapeHtml(label)}</a></p>`;
}

function paragraph(text: string) {
  return `<p style="margin:0 0 12px;font-size:15px;line-height:1.5;">${escapeHtml(text)}</p>`;
}

export async function sendCustomerChatLinkEmail(input: {
  businessName: string;
  to: string;
  chatUrl: string;
  slug: string;
  chatId: string;
}) {
  const subject = `Your chat link with ${input.businessName}`;
  const text = `Use this link to return to your chat with ${input.businessName}:\n\n${input.chatUrl}`;
  const html = wrapEmailHtml(
    input.businessName,
    `${paragraph(`Use this link to return to your chat with ${input.businessName}.`)}${ctaHtml(input.chatUrl, "Open chat")}`,
  );
  return sendTransactionalEmail({
    to: input.to,
    from: fromAddress(input.businessName),
    subject,
    html,
    text,
    idempotencyKey: `customer-chat-link/${input.slug}/${input.chatId}/${input.to}`,
    tags: [
      { name: "email_type", value: "customer-chat-link" },
      { name: "space", value: input.slug.replace(/[^a-z0-9_-]/gi, "-").slice(0, 50) },
    ],
  });
}

async function sendOwnerEmail(input: {
  settings: FloorSettings;
  businessName: string;
  slug: string;
  subject: string;
  html: string;
  text: string;
  idempotencyKey: string;
  emailType: string;
}) {
  const to = input.settings.notifyEmails.filter(isValidEmail);
  if (to.length === 0) return;
  const result = await sendTransactionalEmail({
    to,
    from: fromAddress(input.businessName),
    subject: input.subject,
    html: input.html,
    text: input.text,
    idempotencyKey: input.idempotencyKey,
    tags: [
      { name: "email_type", value: input.emailType },
      { name: "space", value: input.slug.replace(/[^a-z0-9_-]/gi, "-").slice(0, 50) },
    ],
  });
  if (result.error) {
    console.error(`[email] ${input.emailType} failed:`, result.error);
  }
}

async function sendCustomerEmail(input: {
  to: string;
  businessName: string;
  slug: string;
  subject: string;
  html: string;
  text: string;
  idempotencyKey: string;
  emailType: string;
}) {
  if (!isValidEmail(input.to)) return;
  const result = await sendTransactionalEmail({
    to: input.to,
    from: fromAddress(input.businessName),
    subject: input.subject,
    html: input.html,
    text: input.text,
    idempotencyKey: input.idempotencyKey,
    tags: [
      { name: "email_type", value: input.emailType },
      { name: "space", value: input.slug.replace(/[^a-z0-9_-]/gi, "-").slice(0, 50) },
    ],
  });
  if (result.error) {
    console.error(`[email] ${input.emailType} failed:`, result.error);
  }
}

export async function dispatchAlertForMessage(input: {
  slug: string;
  businessName: string;
  settings: FloorSettings;
  client: Client;
  message: Message;
  thread: Message[];
  origin?: string;
}) {
  const origin = appOrigin(input.origin);
  const floorUrl = `${origin}/${input.slug}/floor`;
  const chatUrl = `${origin}${reconnectChatPath(input.slug, input.client.id)}`;
  const alerts = input.settings.emailAlerts ?? EMAIL_ALERT_DEFAULTS;
  const name = input.client.name?.trim() || "A customer";
  const { message, client, settings } = input;

  if (message.from === "business") {
    if (message.kind === "receipt" && alerts.customerReceipt) {
      const to = customerEmail(client);
      if (!to || !message.receipt) return;
      const receipt = message.receipt;
      const details = [
        receipt.productTitle,
        receipt.productPrice,
        receipt.paymentLabel,
        receipt.paymentDetail,
      ]
        .filter(Boolean)
        .join(" · ");
      const text = `Payment details from ${input.businessName}\n\n${details}\n\nReturn to chat: ${chatUrl}`;
      const html = wrapEmailHtml(
        input.businessName,
        `${paragraph(`Here’s a copy of the payment details from ${input.businessName}.`)}${paragraph(details)}${ctaHtml(chatUrl, "Open chat")}`,
      );
      await sendCustomerEmail({
        to,
        businessName: input.businessName,
        slug: input.slug,
        subject: `Payment details from ${input.businessName}`,
        html,
        text,
        idempotencyKey: `customer-receipt/${input.slug}/${message.id}`,
        emailType: "customer-receipt",
      });
    }
    return;
  }

  const notice = classifyClientNotice(message);
  if (notice === "ignore") return;

  if (notice === "staff_out") {
    if (alerts.ownerStaffOutIntake) {
      const body = previewText(message.body, 800);
      await sendOwnerEmail({
        settings,
        businessName: input.businessName,
        slug: input.slug,
        subject: `After-hours intake from ${name}`,
        text: `${name} submitted an after-hours intake.\n\n${body}\n\nOpen inbox: ${floorUrl}`,
        html: wrapEmailHtml(
          input.businessName,
          `${paragraph(`${name} submitted an after-hours intake.`)}${paragraph(body)}${ctaHtml(floorUrl, "Open inbox")}`,
        ),
        idempotencyKey: `owner-staff-out/${input.slug}/${client.id}`,
        emailType: "owner-staff-out",
      });
    }
    if (alerts.customerIntakeReceived) {
      const to = customerEmail(client, extractEmail(message.body));
      if (to) {
        const responseTime = settings.staffOutIntake.responseTime.trim();
        const follow = responseTime || "We’ll follow up as soon as we can.";
        await sendCustomerEmail({
          to,
          businessName: input.businessName,
          slug: input.slug,
          subject: `We received your message for ${input.businessName}`,
          text: `Thanks — ${input.businessName} received your request.\n\n${follow}\n\nReturn to chat: ${chatUrl}`,
          html: wrapEmailHtml(
            input.businessName,
            `${paragraph(`Thanks — ${input.businessName} received your request.`)}${paragraph(follow)}${ctaHtml(chatUrl, "Return to chat")}`,
          ),
          idempotencyKey: `customer-intake/${input.slug}/${client.id}`,
          emailType: "customer-intake",
        });
      }
    }
    return;
  }

  if (notice === "end_screen") {
    if (alerts.ownerContactCaptured) {
      await sendOwnerEmail({
        settings,
        businessName: input.businessName,
        slug: input.slug,
        subject: `${name} left contact details`,
        text: `${name} left contact details after chat.\n\n${previewText(message.body, 500)}\n\nOpen inbox: ${floorUrl}`,
        html: wrapEmailHtml(
          input.businessName,
          `${paragraph(`${name} left contact details after chat.`)}${paragraph(previewText(message.body, 500))}${ctaHtml(floorUrl, "Open inbox")}`,
        ),
        idempotencyKey: `owner-contact/${input.slug}/${client.id}/end-screen`,
        emailType: "owner-contact",
      });
    }
    if (alerts.customerConversationCopy) {
      const to = customerEmail(client, extractEmail(message.body));
      if (to) {
        const lines = threadLines(input.thread, client.id);
        const transcript = lines.join("\n") || "Thanks for chatting with us.";
        await sendCustomerEmail({
          to,
          businessName: input.businessName,
          slug: input.slug,
          subject: `Your chat with ${input.businessName}`,
          text: `Here’s a copy of your conversation with ${input.businessName}.\n\n${transcript}\n\nReturn to chat: ${chatUrl}`,
          html: wrapEmailHtml(
            input.businessName,
            `${paragraph(`Here’s a copy of your conversation with ${input.businessName}.`)}<pre style="white-space:pre-wrap;font:inherit;margin:0 0 12px;line-height:1.5;">${escapeHtml(transcript)}</pre>${ctaHtml(chatUrl, "Return to chat")}`,
          ),
          idempotencyKey: `customer-transcript/${input.slug}/${client.id}`,
          emailType: "customer-transcript",
        });
      }
    }
    return;
  }

  if (notice === "email_reply" || notice === "chat_link") {
    if (alerts.ownerContactCaptured) {
      await sendOwnerEmail({
        settings,
        businessName: input.businessName,
        slug: input.slug,
        subject: `${name} left an email`,
        text: `${name} left ${customerEmail(client, extractEmail(message.body)) || "an email"} for follow-up.\n\nOpen inbox: ${floorUrl}`,
        html: wrapEmailHtml(
          input.businessName,
          `${paragraph(`${name} left an email so you can follow up.`)}${paragraph(customerEmail(client, extractEmail(message.body)) || previewText(message.body, 180))}${ctaHtml(floorUrl, "Open inbox")}`,
        ),
        idempotencyKey: `owner-contact/${input.slug}/${client.id}/${notice}`,
        emailType: "owner-contact",
      });
    }
    return;
  }

  if (!isChatCustomerMessage(message)) return;

  const prior = input.thread.filter(
    (item) => item.id !== message.id && isChatCustomerMessage(item),
  );
  const isNewChat = prior.length === 0;
  const snippet = previewText(messageLine(message) || "New message", 280);

  if (isNewChat && alerts.ownerNewChat) {
    const awayNote = settings.live
      ? ""
      : " Live chat is currently off.";
    await sendOwnerEmail({
      settings,
      businessName: input.businessName,
      slug: input.slug,
      subject: `New chat on ${input.businessName}`,
      text: `${name} started a chat.${awayNote}\n\n${snippet}\n\nOpen inbox: ${floorUrl}`,
      html: wrapEmailHtml(
        input.businessName,
        `${paragraph(`${name} started a chat.${awayNote}`)}${paragraph(snippet)}${ctaHtml(floorUrl, "Open inbox")}`,
      ),
      idempotencyKey: `owner-new-chat/${input.slug}/${client.id}`,
      emailType: "owner-new-chat",
    });
    return;
  }

  if (!settings.live && alerts.ownerAwayMessage) {
    await sendOwnerEmail({
      settings,
      businessName: input.businessName,
      slug: input.slug,
      subject: `${name} wrote while you’re away`,
      text: `${name} sent a message while live chat is off.\n\n${snippet}\n\nOpen inbox: ${floorUrl}`,
      html: wrapEmailHtml(
        input.businessName,
        `${paragraph(`${name} sent a message while live chat is off.`)}${paragraph(snippet)}${ctaHtml(floorUrl, "Open inbox")}`,
      ),
      idempotencyKey: `owner-away-message/${input.slug}/${message.id}`,
      emailType: "owner-away-message",
    });
    return;
  }

  if (alerts.ownerEveryMessage) {
    await sendOwnerEmail({
      settings,
      businessName: input.businessName,
      slug: input.slug,
      subject: `New message from ${name}`,
      text: `${name} sent a message.\n\n${snippet}\n\nOpen inbox: ${floorUrl}`,
      html: wrapEmailHtml(
        input.businessName,
        `${paragraph(`${name} sent a message.`)}${paragraph(snippet)}${ctaHtml(floorUrl, "Open inbox")}`,
      ),
      idempotencyKey: `owner-every-message/${input.slug}/${message.id}`,
      emailType: "owner-every-message",
    });
  }
}

export async function dispatchAlertsForNewMessages(input: {
  slug: string;
  businessName: string;
  settings: FloorSettings;
  items: { message: Message; client: Client }[];
  threadByChat: Map<string, Message[]>;
  origin?: string;
}) {
  for (const item of input.items) {
    try {
      await dispatchAlertForMessage({
        slug: input.slug,
        businessName: input.businessName,
        settings: input.settings,
        client: item.client,
        message: item.message,
        thread: input.threadByChat.get(item.client.id) ?? [item.message],
        origin: input.origin,
      });
    } catch (err) {
      console.error("[email] alert dispatch failed:", err);
    }
  }
}
