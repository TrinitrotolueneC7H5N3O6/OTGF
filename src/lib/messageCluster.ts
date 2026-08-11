import type { Message } from "./types";

export type MessageClusterRole = "alone" | "start" | "middle" | "end";

export function messageCluster(
  messages: Pick<Message, "from">[],
  index: number,
): { role: MessageClusterRole; continued: boolean } {
  const cur = messages[index]?.from;
  const prev = messages[index - 1]?.from;
  const next = messages[index + 1]?.from;
  const samePrev = Boolean(cur && prev === cur);
  const sameNext = Boolean(cur && next === cur);

  if (!samePrev && !sameNext) return { role: "alone", continued: false };
  if (!samePrev && sameNext) return { role: "start", continued: false };
  if (samePrev && sameNext) return { role: "middle", continued: true };
  return { role: "end", continued: true };
}

export function clusterClassName(role: MessageClusterRole, continued: boolean) {
  return [
    `is-cluster-${role}`,
    continued ? "is-continued" : "is-turn",
  ].join(" ");
}
