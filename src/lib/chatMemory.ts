const CHAT_KEY_PREFIX = "otgf:chat:";
const CHAT_EMAIL_PREFIX = "otgf:chat-email:";
const CHAT_HISTORY_PREFIX = "otgf:chat-history:";

export type RememberedChat = {
  id: string;
  createdAt: number;
  lastOpenedAt: number;
};

export function chatMemoryKey(slug: string) {
  return `${CHAT_KEY_PREFIX}${slug}`;
}

function chatEmailKey(slug: string) {
  return `${CHAT_EMAIL_PREFIX}${slug}`;
}

function chatHistoryKey(slug: string) {
  return `${CHAT_HISTORY_PREFIX}${slug}`;
}

export function recallChatHistory(slug: string): RememberedChat[] {
  try {
    const parsed = JSON.parse(
      localStorage.getItem(chatHistoryKey(slug)) || "[]",
    ) as unknown;
    if (!Array.isArray(parsed)) return [];

    return parsed
      .filter(
        (chat): chat is RememberedChat =>
          Boolean(chat) &&
          typeof chat === "object" &&
          typeof (chat as RememberedChat).id === "string" &&
          typeof (chat as RememberedChat).createdAt === "number" &&
          typeof (chat as RememberedChat).lastOpenedAt === "number",
      );
  } catch {
    return [];
  }
}

/** Remembers this device's chat for a business (survives browser restart). */
export function rememberChat(slug: string, chatId: string) {
  try {
    const now = Date.now();
    const history = recallChatHistory(slug);
    const existing = history.find((chat) => chat.id === chatId);
    const nextHistory = [
      {
        id: chatId,
        createdAt: existing?.createdAt ?? now,
        lastOpenedAt: now,
      },
      ...history.filter((chat) => chat.id !== chatId),
    ];

    localStorage.setItem(chatMemoryKey(slug), chatId);
    localStorage.setItem(chatHistoryKey(slug), JSON.stringify(nextHistory));
    sessionStorage.setItem(chatMemoryKey(slug), chatId);
  } catch {
    // ignore quota / private mode
  }
}

export function recallChat(slug: string): string | null {
  try {
    return (
      localStorage.getItem(chatMemoryKey(slug)) ||
      sessionStorage.getItem(chatMemoryKey(slug))
    );
  } catch {
    return null;
  }
}

/** Tab-scoped only — new tabs / windows get a fresh chat from the entry link. */
export function recallChatSession(slug: string): string | null {
  try {
    return sessionStorage.getItem(chatMemoryKey(slug));
  } catch {
    return null;
  }
}

export function rememberChatEmail(slug: string, email: string) {
  const clean = email.trim().toLowerCase();
  if (!clean) return;
  try {
    localStorage.setItem(chatEmailKey(slug), clean);
  } catch {
    // ignore
  }
}

export function recallChatEmail(slug: string): string | null {
  try {
    return localStorage.getItem(chatEmailKey(slug));
  } catch {
    return null;
  }
}

export function forgetChat(slug: string, chatId?: string) {
  try {
    const current = recallChat(slug);
    if (!chatId || current === chatId) {
      localStorage.removeItem(chatMemoryKey(slug));
      sessionStorage.removeItem(chatMemoryKey(slug));
    }
  } catch {
    // ignore
  }
}

export function createChatId() {
  return `c-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}
