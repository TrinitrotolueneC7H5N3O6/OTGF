import type { ChatIntroMessages, FloorSettings } from "./types";

const PRESET_CONTACT_REASONS = [
  "Pricing or quote",
  "Available services",
  "Before & after photos",
  "Recovery or preparation",
  "Financing or payment",
  "Follow-up question",
  "Something else",
];

const LEGACY_CONTACT_REASONS = [
  "Book a consultation",
  ...PRESET_CONTACT_REASONS,
];

function sameReasons(a: string[], b: string[]) {
  return a.length === b.length && a.every((item, index) => item === b[index]);
}

const LEGACY_PROMO_FOLLOW_UP =
  "While your beauty is loading, have a look at your daily promotions";

function editableText(
  value: unknown,
  fallback: string,
  maxLength: number,
  options: { allowBlank?: boolean } = {},
) {
  if (typeof value !== "string") return fallback;
  const trimmed = value.trim().slice(0, maxLength);
  return trimmed || options.allowBlank ? trimmed : fallback;
}

export function defaultChatIntroMessages(): ChatIntroMessages {
  return {
    welcome:
      "Hi! Thank you for contacting us. Let us know what you are interested in, along with any inspiration pictures and current images if applicable. Looking forward to hearing from you soon!",
    promoFollowUp: "",
    extraMessages: [],
    specialtiesEnabled: true,
    specialtiesPrompt: "Are you reaching out for:",
    specialtiesLabel: "Select a reason",
    contactReasonDisplay: "dropdown",
    contactReasonOptions: [],
    reconnectEnabled: true,
    reconnectCopy: "If you get disconnected, reopen this chat with your history:",
  };
}

export function normalizeChatIntroMessages(raw: unknown): ChatIntroMessages {
  const defaults = defaultChatIntroMessages();
  if (!raw || typeof raw !== "object") return defaults;
  const row = raw as Partial<ChatIntroMessages>;
  const extraMessages = Array.isArray(row.extraMessages)
    ? row.extraMessages
        .filter((item) => item && typeof item === "object")
        .map((item, index) => {
          const message =
            item as Partial<ChatIntroMessages["extraMessages"][number]>;
          const fallbackId = `intro-extra-${index + 1}`;
          return {
            id:
              typeof message.id === "string" && message.id.trim()
                ? message.id.trim().slice(0, 80)
                : fallbackId,
            body:
              typeof message.body === "string"
                ? message.body.trim().slice(0, 500)
                : "",
          };
        })
        .slice(0, 5)
    : defaults.extraMessages;
  const contactReasonOptions = Array.isArray(row.contactReasonOptions)
    ? row.contactReasonOptions
        .filter((item) => typeof item === "string")
        .map((item) => item.trim().slice(0, 80))
        .filter(Boolean)
        .slice(0, 20)
    : defaults.contactReasonOptions;
  const reasonsMatchPreset =
    sameReasons(contactReasonOptions, PRESET_CONTACT_REASONS) ||
    sameReasons(contactReasonOptions, LEGACY_CONTACT_REASONS);
  const promoFollowUp = editableText(
    row.promoFollowUp,
    defaults.promoFollowUp,
    500,
    { allowBlank: true },
  );
  return {
    welcome: editableText(row.welcome, defaults.welcome, 2000, {
      allowBlank: true,
    }),
    promoFollowUp:
      promoFollowUp === LEGACY_PROMO_FOLLOW_UP ? "" : promoFollowUp,
    extraMessages,
    specialtiesEnabled:
      typeof row.specialtiesEnabled === "boolean"
        ? row.specialtiesEnabled
        : defaults.specialtiesEnabled,
    specialtiesPrompt: editableText(
      row.specialtiesPrompt,
      defaults.specialtiesPrompt,
      120,
      { allowBlank: true },
    ),
    specialtiesLabel: editableText(
      row.specialtiesLabel,
      defaults.specialtiesLabel,
      40,
    ),
    contactReasonDisplay:
      row.contactReasonDisplay === "list" ? "list" : "dropdown",
    contactReasonOptions: reasonsMatchPreset
      ? []
      : contactReasonOptions,
    reconnectEnabled:
      typeof row.reconnectEnabled === "boolean"
        ? row.reconnectEnabled
        : defaults.reconnectEnabled,
    reconnectCopy: editableText(row.reconnectCopy, defaults.reconnectCopy, 300, {
      allowBlank: true,
    }),
  };
}

export function resolveChatIntroMessages(
  settings?: Partial<FloorSettings> | null,
): ChatIntroMessages {
  return normalizeChatIntroMessages(settings?.chatIntroMessages);
}
