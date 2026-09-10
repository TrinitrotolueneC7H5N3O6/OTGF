import type {
  BusinessSpace,
  FloorSettings,
  Message,
  PreChatLink,
  PreChatPage,
} from "./types";
import { messageCreatedMs } from "./messageTime";
import { isPublicLinkEnabled } from "./toolPublic";

function linkHasDestination(link: PreChatLink) {
  if (link.kind === "chat" || link.quickBuild) return true;
  if (link.id === "pre-promo") return true;
  return Boolean(link.href?.trim());
}

function contactChannel(link: PreChatLink) {
  if (link.id === "pre-call" || link.kind === "call") return "call";
  if (
    link.id === "pre-sms" ||
    link.kind === "sms" ||
    link.quickBuild?.type === "sms"
  ) {
    return "sms";
  }
  if (
    link.id === "pre-email" ||
    link.kind === "email" ||
    link.quickBuild?.type === "email"
  ) {
    return "email";
  }
  return null;
}

function withoutDuplicateContacts(links: PreChatLink[]) {
  const seen = new Set<string>();
  return links.filter((link) => {
    const channel = contactChannel(link);
    if (!channel) return true;
    if (seen.has(channel)) return false;
    seen.add(channel);
    return true;
  });
}

export function visiblePreChatLinks(
  page: PreChatPage,
  settings?: Partial<FloorSettings> | null,
): PreChatLink[] {
  return withoutDuplicateContacts(
    page.links.filter((link) => {
      if (!link.enabled || !link.label.trim()) return false;
      if (settings && !isPublicLinkEnabled(settings, link)) return false;
      return linkHasDestination(link);
    }),
  );
}

export function widgetPreChatLinks(
  page: PreChatPage,
  settings?: Partial<FloorSettings> | null,
): PreChatLink[] {
  return withoutDuplicateContacts(
    page.links.filter((link) => {
      if (!link.showInWidget || !link.label.trim()) return false;
      if (link.kind === "chat") return false;
      if (link.id === "pre-consult" || link.id === "pre-promo") return false;
      if (settings && !isPublicLinkEnabled(settings, link)) return false;
      return linkHasDestination(link);
    }),
  );
}

export function preChatHref(link: PreChatLink, slug: string): string | null {
  if (link.kind === "chat") return `/${slug}/chat`;
  if (link.id === "pre-promo" && !(link.href?.trim())) {
    return `/${slug}/chat`;
  }
  const value = link.href?.trim() ?? "";
  if (!value) return null;
  if (link.kind === "call") {
    const phone = value.replace(/[^\d+]/g, "");
    return phone ? `tel:${phone}` : null;
  }
  if (link.kind === "sms") {
    const phone = value.replace(/[^\d+]/g, "");
    return phone ? `sms:${phone}` : null;
  }
  if (link.kind === "email") {
    const email = value.replace(/^mailto:/i, "");
    return email.includes("@") ? `mailto:${email}` : null;
  }
  if (value.startsWith("/")) return value;
  if (/^https?:\/\//i.test(value)) return value;
  return `https://${value}`;
}

function isStaffReply(message: Message) {
  if (message.from !== "business") return false;
  if (message.kind === "specialties") return false;
  return !message.id.startsWith("m-auto-");
}

function lastMatching(
  messages: Message[],
  clientId: string,
  match: (message: Message) => boolean,
): Message | null {
  for (let i = messages.length - 1; i >= 0; i--) {
    const message = messages[i];
    if (message.clientId === clientId && match(message)) return message;
  }
  return null;
}

function formatWaitMinutes(mins: number) {
  if (mins < 1) return "< 1 min";
  if (mins === 1) return "~1 min";
  if (mins < 60) return `~${mins} min`;
  const hours = Math.round(mins / 60);
  return hours <= 1 ? "~1 hr" : `~${hours} hr`;
}

/** Queue position and wait estimate for a visitor about to start live chat. */
export function liveChatQueueStatus(
  space: Pick<BusinessSpace, "clients" | "messages" | "settings">,
  now = Date.now(),
) {
  const waits: number[] = [];
  for (const client of space.clients) {
    if (client.chatEndedAt) continue;
    const lastCustomer = lastMatching(
      space.messages,
      client.id,
      (m) => m.from === "client",
    );
    if (!lastCustomer) continue;
    const lastStaff = lastMatching(space.messages, client.id, isStaffReply);
    const customerAt = messageCreatedMs(lastCustomer);
    const staffAt = lastStaff ? messageCreatedMs(lastStaff) : null;
    const waiting =
      customerAt != null && (staffAt == null || customerAt > staffAt);
    if (!waiting || customerAt == null) continue;
    waits.push(Math.max(0, now - customerAt));
  }

  const ahead = waits.length;
  const position = ahead + 1;
  const avgMin =
    ahead === 0
      ? space.settings.live
        ? 0
        : 5
      : Math.max(
          2,
          Math.round(
            waits.reduce((sum, ms) => sum + ms, 0) / waits.length / 60_000,
          ) || ahead * 3,
        );

  return {
    ahead,
    position,
    waitLabel: formatWaitMinutes(avgMin),
    queueLabel: `Your queue #${position}`,
  };
}
