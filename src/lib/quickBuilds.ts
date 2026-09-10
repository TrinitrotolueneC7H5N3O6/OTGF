import type {
  PreChatLink,
  QuickBuildConfig,
  QuickBuildField,
} from "./types";

const DEFAULT_FORM_FIELDS: QuickBuildField[] = [
  { id: "name", label: "Name", type: "text", required: true },
  { id: "email", label: "Email", type: "email", required: true },
  { id: "phone", label: "Phone", type: "tel", required: false },
  { id: "details", label: "How can we help?", type: "textarea", required: true },
];

export function defaultQuickBuildConfig(
  type: QuickBuildConfig["type"],
): QuickBuildConfig {
  if (type === "form") {
    return {
      type,
      title: "Tell us what you need",
      description: "Fill this out and our team will follow up.",
      fields: DEFAULT_FORM_FIELDS.map((field) => ({ ...field })),
      shareEmbed: true,
      sharePage: true,
    };
  }
  if (type === "scheduler") {
    return {
      type,
      title: "Request a time",
      description: "Choose a time that works and our team will confirm it.",
      durationMinutes: 30,
      startTime: "09:00",
      endTime: "17:00",
      daysAhead: 30,
    };
  }
  if (type === "sms") {
    return {
      type,
      title: "Ask a question",
      description: "Ask a question and we will respond via text.",
    };
  }
  return {
    type,
    title: "Ask a question",
    description: "Ask a question and we will respond via email.",
  };
}

export function quickBuildTypeFromLink(link: PreChatLink) {
  if (link.quickBuild) return link.quickBuild.type;
  const match = /^pre-quick-(form|scheduler|sms|email)-/.exec(link.id);
  return (match?.[1] as QuickBuildConfig["type"] | undefined) ?? null;
}

export function quickBuildConfigForLink(link: PreChatLink) {
  const type = quickBuildTypeFromLink(link);
  return type ? link.quickBuild ?? defaultQuickBuildConfig(type) : null;
}

export function formLinksFrom(settings: {
  preChat?: { links: PreChatLink[] } | undefined;
}): PreChatLink[] {
  return (settings.preChat?.links ?? []).filter(
    (link) => quickBuildTypeFromLink(link) === "form",
  );
}

export function formShare(link: PreChatLink) {
  const config = quickBuildConfigForLink(link);
  if (!config || config.type !== "form") {
    return { embed: false, page: false };
  }
  return {
    embed: config.shareEmbed !== false,
    page: config.sharePage !== false,
  };
}
