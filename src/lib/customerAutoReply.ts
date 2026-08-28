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

function extraIntroId(clientId: string, id: string) {
  return `m-auto-extra-${id}-${clientId}`;
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
  return message.id.startsWith("m-auto-reconnect-");
}

function isIntroMessage(message: Message, clientId: string) {
  if (message.clientId !== clientId || message.from !== "business") return false;
  if (
    message.id === autoReplyId(clientId) ||
    message.id === promoFollowUpId(clientId) ||
    message.id.startsWith("m-auto-extra-") ||
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
  const introBlock: Message[] = [];
  let offset = 0;
  if (intro.welcome.trim()) {
    introBlock.push({
      id: autoReplyId(clientId),
      clientId,
      from: "business",
      kind: "text",
      body: intro.welcome,
      ...messageStampAt(baseMs),
      fromName: businessName,
    });
    offset += 1;
  }
  if (intro.promoFollowUp.trim()) {
    introBlock.push({
      id: promoFollowUpId(clientId),
      clientId,
      from: "business",
      kind: "text",
      body: intro.promoFollowUp,
      ...messageStampAt(baseMs + offset),
      fromName: businessName,
    });
    offset += 1;
  }
  const extraMessages = intro.extraMessages.filter((message) =>
    message.body.trim(),
  );
  for (const message of extraMessages) {
    introBlock.push({
      id: extraIntroId(clientId, message.id),
      clientId,
      from: "business",
      kind: "text",
      body: message.body,
      ...messageStampAt(baseMs + offset),
      fromName: businessName,
    });
    offset += 1;
  }
  if (intro.specialtiesEnabled) {
    introBlock.push({
      id: specialtiesId(clientId),
      clientId,
      from: "business",
      kind: "specialties",
      body: intro.specialtiesLabel,
      ...messageStampAt(baseMs + offset),
      fromName: businessName,
    });
    offset += 1;
  }
  if (intro.reconnectEnabled) {
    introBlock.push({
      id: reconnectId(clientId),
      clientId,
      from: "business",
      kind: "text",
      body: intro.reconnectCopy,
      linkUrl: reconnectChatPath(slug, clientId),
      ...messageStampAt(baseMs + offset),
      fromName: businessName,
    });
  }
  return introBlock;
}

function welcomeMessagesMatch(
  messages: Message[],
  clientId: string,
  slug: string,
  intro: ChatIntroMessages,
): boolean {
  const auto = messages.find((m) => m.id === autoReplyId(clientId));
  const promo = messages.find((m) => m.id === promoFollowUpId(clientId));
  const specialties = messages.find((m) => m.id === specialtiesId(clientId));
  const reconnect = messages.find((m) => m.id === reconnectId(clientId));
  const welcomeEnabled = Boolean(intro.welcome.trim());
  const promoEnabled = Boolean(intro.promoFollowUp.trim());
  const extraMessages = intro.extraMessages.filter((item) => item.body.trim());
  const expectedExtraIds = new Set(
    extraMessages.map((item) => extraIntroId(clientId, item.id)),
  );
  const currentExtraMessages = messages.filter(
    (message) =>
      message.clientId === clientId && message.id.startsWith("m-auto-extra-"),
  );
  const extraMessagesMatch =
    extraMessages.every((item) => {
      const message = messages.find(
        (m) => m.id === extraIntroId(clientId, item.id),
      );
      return message?.kind === "text" && message.body === item.body;
    }) &&
    currentExtraMessages.every((message) => expectedExtraIds.has(message.id));
  return (
    (welcomeEnabled ? auto?.body === intro.welcome : !auto) &&
    (promoEnabled ? promo?.body === intro.promoFollowUp : !promo) &&
    extraMessagesMatch &&
    (intro.specialtiesEnabled
      ? Boolean(
          specialties &&
            isSpecialtiesMessage(specialties) &&
            specialties.body === intro.specialtiesLabel,
        )
      : !specialties) &&
    (intro.reconnectEnabled
      ? Boolean(
          reconnect?.kind === "text" &&
            reconnect.body === intro.reconnectCopy &&
            reconnect.linkUrl === reconnectChatPath(slug, clientId),
        )
      : !reconnect)
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
