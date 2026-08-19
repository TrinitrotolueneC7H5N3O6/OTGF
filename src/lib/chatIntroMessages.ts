import type { ChatIntroMessages, FloorSettings } from "./types";

export function defaultChatIntroMessages(): ChatIntroMessages {
  return {
    welcome:
      "Hi! Thank you for contacting us. Let us know what you are interested in, along with any inspiration pictures and current images if applicable. Looking forward to hearing from you soon!",
    promoFollowUp:
      "While your beauty is loading, have a look at your daily promotions",
    specialtiesLabel: "Specialties",
    reconnectCopy: "If you get disconnected, reopen this chat with your history:",
  };
}

export function normalizeChatIntroMessages(raw: unknown): ChatIntroMessages {
  const defaults = defaultChatIntroMessages();
  if (!raw || typeof raw !== "object") return defaults;
  const row = raw as Partial<ChatIntroMessages>;
  return {
    welcome:
      typeof row.welcome === "string" && row.welcome.trim()
        ? row.welcome.trim().slice(0, 2000)
        : defaults.welcome,
    promoFollowUp:
      typeof row.promoFollowUp === "string" && row.promoFollowUp.trim()
        ? row.promoFollowUp.trim().slice(0, 500)
        : defaults.promoFollowUp,
    specialtiesLabel:
      typeof row.specialtiesLabel === "string" && row.specialtiesLabel.trim()
        ? row.specialtiesLabel.trim().slice(0, 40)
        : defaults.specialtiesLabel,
    reconnectCopy:
      typeof row.reconnectCopy === "string" && row.reconnectCopy.trim()
        ? row.reconnectCopy.trim().slice(0, 300)
        : defaults.reconnectCopy,
  };
}

export function resolveChatIntroMessages(
  settings?: Partial<FloorSettings> | null,
): ChatIntroMessages {
  return normalizeChatIntroMessages(settings?.chatIntroMessages);
}
