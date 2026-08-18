import type { Message } from "./types";

export type MessageClusterRole = "alone" | "start" | "middle" | "end";

export function messageCluster(
  messages: Pick<Message, "from" | "kind">[],
  index: number,
): { role: MessageClusterRole; continued: boolean } {
  const cur = messages[index];
  if (!cur || cur.kind === "system") {
    return { role: "alone", continued: false };
  }
  const prev = messages[index - 1];
  const next = messages[index + 1];
  const samePrev = Boolean(
    prev && prev.kind !== "system" && prev.from === cur.from,
  );
  const sameNext = Boolean(
    next && next.kind !== "system" && next.from === cur.from,
  );

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
