import type {
  Message,
  MessageKind,
  MessageReaction,
  MessageReplyRef,
} from "./types";

export const MESSAGE_REACTION_EMOJIS = [
  "👍",
  "❤️",
  "😂",
  "😮",
  "🔥",
] as const;

export type ReactionActor = {
  from: "business" | "client";
  fromMemberId?: string;
  fromName?: string;
};

export function messagePreview(message: Message, max = 72): string {
  if (message.kind === "image") {
    if (message.imageUrls && message.imageUrls.length > 1) {
      return `Photos · ${message.imageUrls.length}`;
    }
    return "Photo";
  }
  if (message.kind === "video") return "Video";
  if (message.kind === "link") {
    return truncate(message.body || message.linkUrl || "Link", max);
  }
  if (message.kind === "receipt") {
    return truncate(message.body || message.receipt?.productTitle || "Receipt", max);
  }
  if (message.kind === "item") {
    return truncate(message.body || "Inquiry", max);
  }
  if (message.kind === "system") {
    return truncate(message.body || "Update", max);
  }
  return truncate(message.body || "Message", max);
}

export function buildReplyRef(message: Message): MessageReplyRef {
  return {
    id: message.id,
    from: message.from,
    ...(message.fromName ? { fromName: message.fromName } : {}),
    preview: messagePreview(message),
    kind: message.kind as MessageKind,
  };
}

export function reactorKey(reaction: Pick<MessageReaction, "from" | "fromMemberId">) {
  if (reaction.from === "client") return "client";
  return `business:${reaction.fromMemberId || "floor"}`;
}

export function actorKey(actor: ReactionActor) {
  return reactorKey(actor);
}

/** Toggle emoji for this actor — same emoji removes; different emoji replaces. */
export function toggleMessageReaction(
  reactions: MessageReaction[] | undefined,
  emoji: string,
  actor: ReactionActor,
): MessageReaction[] {
  const list = Array.isArray(reactions) ? [...reactions] : [];
  const key = actorKey(actor);
  const existingIndex = list.findIndex((r) => reactorKey(r) === key);

  if (existingIndex >= 0) {
    if (list[existingIndex].emoji === emoji) {
      list.splice(existingIndex, 1);
      return list;
    }
    list[existingIndex] = {
      emoji,
      from: actor.from,
      ...(actor.fromMemberId ? { fromMemberId: actor.fromMemberId } : {}),
      ...(actor.fromName ? { fromName: actor.fromName } : {}),
    };
    return list;
  }

  list.push({
    emoji,
    from: actor.from,
    ...(actor.fromMemberId ? { fromMemberId: actor.fromMemberId } : {}),
    ...(actor.fromName ? { fromName: actor.fromName } : {}),
  });
  return list;
}

export function groupReactions(reactions: MessageReaction[] | undefined) {
  const map = new Map<string, { emoji: string; count: number; mine: boolean }>();
  for (const r of reactions ?? []) {
    const row = map.get(r.emoji) ?? { emoji: r.emoji, count: 0, mine: false };
    row.count += 1;
    map.set(r.emoji, row);
  }
  return [...map.values()];
}

function truncate(text: string, max: number) {
  const trimmed = text.trim().replace(/\s+/g, " ");
  if (trimmed.length <= max) return trimmed;
  return `${trimmed.slice(0, max - 1)}…`;
}
