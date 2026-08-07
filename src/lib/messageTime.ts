import type { Message } from "./types";

/** Best-effort timestamp for when a message was created (ms since epoch). */
export function messageCreatedMs(
  message: Pick<Message, "id" | "createdAt">,
): number | null {
  if (message.createdAt) {
    const t = Date.parse(message.createdAt);
    if (Number.isFinite(t)) return t;
  }
  const fromId = /^m-(\d+)/.exec(message.id);
  if (fromId) {
    const t = Number(fromId[1]);
    // Message ids use Date.now() ms; ignore tiny/invalid values.
    if (Number.isFinite(t) && t > 1_000_000_000_000) return t;
  }
  return null;
}

export function lastClientMessage(
  clientId: string,
  messages: Message[],
): Message | null {
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i].clientId === clientId) return messages[i];
  }
  return null;
}

/** Compact wait label: now / 3m / 2h / 1d since the last message. */
export function waitSinceLabel(fromMs: number, now = Date.now()): string {
  const mins = Math.max(0, Math.floor((now - fromMs) / 60_000));
  if (mins < 1) return "now";
  if (mins < 60) return `${mins}m`;
  const hours = Math.floor(mins / 60);
  if (hours < 48) return `${hours}h`;
  return `${Math.floor(hours / 24)}d`;
}

export function waitSinceTitle(
  from: Message["from"],
  fromMs: number,
  now = Date.now(),
): string {
  const mins = Math.max(0, Math.floor((now - fromMs) / 60_000));
  const span =
    mins < 1
      ? "just now"
      : mins === 1
        ? "1 minute"
        : mins < 60
          ? `${mins} minutes`
          : (() => {
              const hours = Math.floor(mins / 60);
              return hours === 1 ? "1 hour" : `${hours} hours`;
            })();
  if (from === "client") {
    return `${span} since customer asked — awaiting your reply`;
  }
  return `${span} since your reply — awaiting customer`;
}
