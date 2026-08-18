import type { ChatParticipant } from "./types";

export const FORWARD_LINK_TTL_MS = 24 * 60 * 60 * 1000;

export function joinedChatLabel(name: string, department?: string) {
  const n = name.trim();
  const d = department?.trim();
  if (!n) return "Someone has joined the chat";
  return d ? `${n} (${d}) has joined the chat` : `${n} has joined the chat`;
}

export function participantLabel(p: ChatParticipant) {
  const d = p.department?.trim();
  return d ? `${p.name} (${d})` : p.name;
}

export function forwardMemoryKey(token: string) {
  return `otgf:forward:${token}`;
}

export function rememberForwardParticipant(
  token: string,
  participant: ChatParticipant,
) {
  try {
    localStorage.setItem(forwardMemoryKey(token), JSON.stringify(participant));
  } catch {
    // ignore
  }
}

export function recallForwardParticipant(token: string): ChatParticipant | null {
  try {
    const raw = localStorage.getItem(forwardMemoryKey(token));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<ChatParticipant>;
    if (typeof parsed.id !== "string" || typeof parsed.name !== "string") {
      return null;
    }
    return {
      id: parsed.id,
      name: parsed.name.trim(),
      joinedAt:
        typeof parsed.joinedAt === "string"
          ? parsed.joinedAt
          : new Date().toISOString(),
      ...(typeof parsed.department === "string" && parsed.department.trim()
        ? { department: parsed.department.trim() }
        : {}),
    };
  } catch {
    return null;
  }
}
