const CHAT_KEY_PREFIX = "otgf:chat:";

export function chatMemoryKey(slug: string) {
  return `${CHAT_KEY_PREFIX}${slug}`;
}

/** Remembers this device's chat for a business (survives browser restart). */
export function rememberChat(slug: string, chatId: string) {
  try {
    localStorage.setItem(chatMemoryKey(slug), chatId);
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
