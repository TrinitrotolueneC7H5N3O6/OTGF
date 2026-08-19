import type { Message } from "./types";
import { messageTimeStamp } from "./spaceNormalize";

export const CUSTOMER_AUTO_REPLY =
  "Hi! Thank you for contacting Plastic Surgery Company. Let us know what procedures you are interested in, along with inspiration pictures, and current images of yourself if applicable. Looking forward to hearing from you soon!";

export const CUSTOMER_AUTO_FOLLOW_UP =
  "While your beauty is loading, have a look at your daily promotions";

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
  return message.id.startsWith("m-auto-reconnect-");
}

function isOldWelcomeCopy(message: Message, clientId: string) {
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
    body.startsWith("Hi! Thank you for contacting Plastic Surgery Company") ||
    body.startsWith("In the meanwhile, while your beauty is loading") ||
    body.startsWith("While your beauty is loading") ||
    message.kind === "specialties" ||
    body === "Specialties" ||
    body.startsWith("If you get disconnected, reopen this chat")
  );
}

function coreWelcomeMatch(
  messages: Message[],
  clientId: string,
): boolean {
  const auto = messages.find((m) => m.id === autoReplyId(clientId));
  const promo = messages.find((m) => m.id === promoFollowUpId(clientId));
  const specialties = messages.find((m) => m.id === specialtiesId(clientId));
  return (
    auto?.body === CUSTOMER_AUTO_REPLY &&
    promo?.body === CUSTOMER_AUTO_FOLLOW_UP &&
    Boolean(specialties && isSpecialtiesMessage(specialties))
  );
}

function welcomeMessagesMatch(
  messages: Message[],
  clientId: string,
  slug: string,
): boolean {
  const reconnect = messages.find((m) => m.id === reconnectId(clientId));
  return (
    coreWelcomeMatch(messages, clientId) &&
    reconnect?.kind === "text" &&
    reconnect.body === CUSTOMER_RECONNECT_COPY &&
    reconnect.linkUrl === reconnectChatPath(slug, clientId)
  );
}

function offsetStamp(stamp: ReturnType<typeof messageTimeStamp>, ms: number) {
  const createdAt = new Date(Date.parse(stamp.createdAt ?? "") + ms).toISOString();
  return {
    at: stamp.at,
    createdAt: Number.isNaN(Date.parse(createdAt)) ? stamp.createdAt : createdAt,
  };
}

/** Attach (or replace) the first-message auto-replies for this chat. */
export function ensureWelcomeMessages(
  messages: Message[],
  clientId: string,
  businessName: string,
  slug: string,
): Message[] {
  if (welcomeMessagesMatch(messages, clientId, slug)) return messages;

  const stamp = messageTimeStamp();
  const reconnectMessage: Message = {
    id: reconnectId(clientId),
    clientId,
    from: "business",
    kind: "text",
    body: CUSTOMER_RECONNECT_COPY,
    linkUrl: reconnectChatPath(slug, clientId),
    ...offsetStamp(stamp, 3),
    fromName: businessName,
  };

  if (coreWelcomeMatch(messages, clientId)) {
    const withoutReconnect = messages.filter(
      (m) => m.id !== reconnectId(clientId),
    );
    const specialtiesIndex = withoutReconnect.findIndex(
      (m) => m.id === specialtiesId(clientId),
    );
    if (specialtiesIndex >= 0) {
      const specialties = withoutReconnect[specialtiesIndex];
      const created = Date.parse(specialties.createdAt ?? "");
      return [
        ...withoutReconnect.slice(0, specialtiesIndex + 1),
        {
          ...reconnectMessage,
          at: specialties.at,
          createdAt: Number.isNaN(created)
            ? specialties.createdAt
            : new Date(created + 1).toISOString(),
        },
        ...withoutReconnect.slice(specialtiesIndex + 1),
      ];
    }
  }

  return [
    ...messages.filter((m) => !isOldWelcomeCopy(m, clientId)),
    {
      id: autoReplyId(clientId),
      clientId,
      from: "business",
      kind: "text",
      body: CUSTOMER_AUTO_REPLY,
      ...stamp,
      fromName: businessName,
    },
    {
      id: promoFollowUpId(clientId),
      clientId,
      from: "business",
      kind: "text",
      body: CUSTOMER_AUTO_FOLLOW_UP,
      ...offsetStamp(stamp, 1),
      fromName: businessName,
    },
    {
      id: specialtiesId(clientId),
      clientId,
      from: "business",
      kind: "specialties",
      body: "Specialties",
      ...offsetStamp(stamp, 2),
      fromName: businessName,
    },
    reconnectMessage,
  ];
}

export function appendCustomerMessageWithAutoReply(
  messages: Message[],
  clientId: string,
  customerMessage: Message,
  businessName: string,
  slug: string,
): Message[] {
  const next = messages.some((m) => m.id === customerMessage.id)
    ? messages
    : [...messages, customerMessage];
  return ensureWelcomeMessages(next, clientId, businessName, slug);
}

/** After any customer message exists, keep the welcome replies in that thread. */
export function ensureWelcomeMessagesForSpace<
  T extends { business: { name: string; slug: string }; messages: Message[] },
>(space: T): T {
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
    );
  }
  if (messages === space.messages) return space;
  return { ...space, messages };
}
