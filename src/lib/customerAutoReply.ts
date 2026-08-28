import type { ChatIntroMessages, Message } from "./types";
import { resolveChatIntroMessages } from "./chatIntroMessages";
import type { FloorSettings } from "./types";
import { messageCreatedMs } from "./messageTime";

/** @deprecated use resolveChatIntroMessages().welcome */
export const CUSTOMER_AUTO_REPLY =
  "Hi! Thank you for contacting Plastic Surgery Company. Let us know what procedures you are interested in, along with inspiration pictures, and current images of yourself if applicable. Looking forward to hearing from you soon!";

/** @deprecated use resolveChatIntroMessages().promoFollowUp */
export const CUSTOMER_AUTO_FOLLOW_UP =
  "While your beauty is loading, have a look at your daily promotions";

/** @deprecated use resolveChatIntroMessages().reconnectCopy */
export const CUSTOMER_RECONNECT_COPY =
  "If you get disconnected, reopen this chat with your history:";

function autoReplyId(clientId: string) {
  return `m-auto-${clientId}`;
}

function promoFollowUpId(clientId: string) {
  return `m-auto-promo-${clientId}`;
}

function specialtiesId(clientId: string) {
  return `m-auto-specialties-${clientId}`;
}

function reconnectId(clientId: string) {
  return `m-auto-reconnect-${clientId}`;
}

export function reconnectChatPath(slug: string, clientId: string) {
  return `/${slug}/c/${clientId}`;
}

export function isSpecialtiesMessage(message: Message) {
  return (
    message.kind === "specialties" ||
    message.id.startsWith("m-auto-specialties-")
  );
}

export function isReconnectMessage(message: Message) {
  return (
    message.id.startsWith("m-auto-reconnect-") ||
    message.id.startsWith("m-chat-link-")
  );
}

export const CHAT_LINK_COPY =
  "Your unique chat link — open it anytime to continue with the full history:";

export function formatChatHistory(
  messages: Message[],
  clientId: string,
  clientName: string,
  staffFallback = "Us",
): string {
  const lines: string[] = [];
  for (const message of messages) {
    if (message.clientId !== clientId) continue;
    if (message.kind === "system") continue;
    if (message.id.startsWith("m-auto-")) continue;
    if (message.id.startsWith("m-chat-link-")) continue;
    const who =
      message.from === "client"
        ? clientName.trim() || "You"
        : message.fromName?.trim() || staffFallback;
    if (message.kind === "image") {
      lines.push(`${who}: [photo]`);
      continue;
    }
    if (message.kind === "video") {
      lines.push(`${who}: [video]`);
      continue;
    }
    if (message.kind === "receipt") {
      lines.push(
        `${who}: [receipt] ${message.receipt?.productTitle || message.body}`.trim(),
      );
      continue;
    }
    const text = message.body.trim();
    if (!text) continue;
    lines.push(`${who}: ${text}`);
  }
  return lines.join("\n");
}

function isIntroMessage(message: Message, clientId: string) {
  if (message.clientId !== clientId || message.from !== "business") return false;
  if (
    message.id === autoReplyId(clientId) ||
    message.id === promoFollowUpId(clientId) ||
    message.id === specialtiesId(clientId) ||
    message.id === reconnectId(clientId)
  ) {
    return true;
  }
  const body = message.body.trim();
  return (
    body.startsWith("Hi! Thank you for contacting") ||
    body.startsWith("In the meanwhile, while your beauty is loading") ||
    body.startsWith("While your beauty is loading") ||
    message.kind === "specialties" ||
    body === "Specialties" ||
    body.startsWith("If you get disconnected, reopen this chat")
  );
}

function sortMessagesByTime(messages: Message[]): Message[] {
  return [...messages].sort(
    (a, b) => (messageCreatedMs(a) ?? 0) - (messageCreatedMs(b) ?? 0),
  );
}

function messageStampAt(ms: number) {
  const d = new Date(ms);
  return {
    at: d.toLocaleString([], {
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    }),
    createdAt: d.toISOString(),
  };
}

function introAnchorMs(conversation: Message[]): number {
  if (conversation.length === 0) return Date.now();
  const earliest = Math.min(
    ...conversation.map((m) => messageCreatedMs(m) ?? Date.now()),
  );
  return earliest - 10_000;
}

function buildIntroBlock(
  clientId: string,
  businessName: string,
  slug: string,
  intro: ChatIntroMessages,
  baseMs: number,
): Message[] {
  return [
    {
      id: autoReplyId(clientId),
      clientId,
      from: "business",
      kind: "text",
      body: intro.welcome,
      ...messageStampAt(baseMs),
      fromName: businessName,
    },
    {
      id: promoFollowUpId(clientId),
      clientId,
      from: "business",
      kind: "text",
      body: intro.promoFollowUp,
      ...messageStampAt(baseMs + 1),
      fromName: businessName,
    },
    {
      id: reconnectId(clientId),
      clientId,
      from: "business",
      kind: "text",
      body: intro.reconnectCopy,
      linkUrl: reconnectChatPath(slug, clientId),
      ...messageStampAt(baseMs + 2),
      fromName: businessName,
    },
  ];
}

function welcomeMessagesMatch(
  messages: Message[],
  clientId: string,
  slug: string,
  intro: ChatIntroMessages,
): boolean {
  const auto = messages.find((m) => m.id === autoReplyId(clientId));
  const promo = messages.find((m) => m.id === promoFollowUpId(clientId));
  const reconnect = messages.find((m) => m.id === reconnectId(clientId));
  return (
    auto?.body === intro.welcome &&
    promo?.body === intro.promoFollowUp &&
    !messages.some((m) => isSpecialtiesMessage(m) && m.clientId === clientId) &&
    reconnect?.kind === "text" &&
    reconnect.body === intro.reconnectCopy &&
    reconnect.linkUrl === reconnectChatPath(slug, clientId)
  );
}

function introPrecedesConversation(
  messages: Message[],
  clientId: string,
): boolean {
  const sorted = sortMessagesByTime(messages);
  const firstConv = sorted.find((m) => !isIntroMessage(m, clientId));
  if (!firstConv) return true;
  const lastIntro = [...sorted]
    .reverse()
    .find((m) => isIntroMessage(m, clientId));
  if (!lastIntro) return true;
  return (
    (messageCreatedMs(lastIntro) ?? 0) < (messageCreatedMs(firstConv) ?? 0)
  );
}

/** Ensure intro messages exist at the top of the thread, like normal chat history. */
export function ensureWelcomeMessages(
  messages: Message[],
  clientId: string,
  businessName: string,
  slug: string,
  intro: ChatIntroMessages,
): Message[] {
  const conversation = messages.filter((m) => !isIntroMessage(m, clientId));

  if (
    welcomeMessagesMatch(messages, clientId, slug, intro) &&
    introPrecedesConversation(messages, clientId)
  ) {
    return sortMessagesByTime(messages);
  }

  const baseMs = introAnchorMs(conversation);
  const introBlock = buildIntroBlock(
    clientId,
    businessName,
    slug,
    intro,
    baseMs,
  );

  return sortMessagesByTime([...introBlock, ...conversation]);
}

export function appendCustomerMessageWithAutoReply(
  messages: Message[],
  clientId: string,
  customerMessage: Message,
  businessName: string,
  slug: string,
  intro: ChatIntroMessages,
): Message[] {
  const next = messages.some((m) => m.id === customerMessage.id)
    ? messages
    : [...messages, customerMessage];
  return ensureWelcomeMessages(next, clientId, businessName, slug, intro);
}

/** After any customer message exists, keep intro replies in that thread. */
export function ensureWelcomeMessagesForSpace<
  T extends {
    business: { name: string; slug: string };
    messages: Message[];
    settings: FloorSettings;
  },
>(space: T): T {
  const intro = resolveChatIntroMessages(space.settings);
  const clientIds = new Set(
    space.messages.filter((m) => m.from === "client").map((m) => m.clientId),
  );
  let messages = space.messages;
  for (const clientId of clientIds) {
    messages = ensureWelcomeMessages(
      messages,
      clientId,
      space.business.name,
      space.business.slug,
      intro,
    );
  }
  if (messages === space.messages) return space;
  return { ...space, messages };
}

export { sortMessagesByTime };
