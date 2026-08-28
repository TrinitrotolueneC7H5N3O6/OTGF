import type {
  Artifact,
  BusinessSpace,
  ChatBanner,
  ChatParticipant,
  Client,
  ComposerShortcut,
  CustomerCase,
  CustomerCaseIdentifier,
  CustomerCaseStatus,
  DepartmentAttachment,
  DepartmentContent,
  FloorMember,
  FloorSettings,
  ChatEndScreenBehavior,
  ChatEndScreenKind,
  LibraryCategory,
  LibraryItem,
  Message,
  PaymentMethodKind,
  PreChatLink,
  PreChatLinkKind,
  PreChatPage,
  ProfileLink,
  ReceiptPayment,
  ReceiptPayload,
  ReceiptProduct,
  ResponseWindow,
  Weekday,
} from "./types";
import {
  normalizeAutoAnswerDraft,
  withoutAutoAnswerDraft,
} from "./autoAnswer";
import { defaultCategories, ensureInboxCategory, legacyDefaultArtifactIds } from "./data";
import { newerPresentAt } from "./presence";
import { clampArtifactMeta } from "./artifactMeta";
import {
  defaultChatIntroMessages,
  normalizeChatIntroMessages,
} from "./chatIntroMessages";
import {
  allSolutionIds,
  normalizeEnabledSolutions,
  normalizeSetupIndustry,
} from "./setupSolutions";
import { normalizeOfferings } from "./offerings";
import { normalizeKnowledgeNotes } from "./knowledge";

const WEEKDAYS: Weekday[] = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"];

const PAYMENT_KINDS: PaymentMethodKind[] = [
  "url",
  "in_person",
  "zelle",
  "venmo",
  "cashapp",
  "other",
];

export function paymentKindLabel(kind: PaymentMethodKind) {
  const map: Record<PaymentMethodKind, string> = {
    url: "Payment link",
    in_person: "In person",
    zelle: "Zelle",
    venmo: "Venmo",
    cashapp: "Cash App",
    other: "Other",
  };
  return map[kind];
}

/** How a receipt’s product listing is framed, driven by payment kind. */
export type ReceiptListingStyle = "link" | "handle" | "in_person";

export function receiptListingStyle(
  kind: PaymentMethodKind,
): ReceiptListingStyle {
  if (kind === "url") return "link";
  if (kind === "in_person") return "in_person";
  return "handle";
}

export function receiptListingStyleLabel(style: ReceiptListingStyle) {
  const map: Record<ReceiptListingStyle, string> = {
    link: "Pay-link listing",
    handle: "Simple transfer",
    in_person: "In-person ticket",
  };
  return map[style];
}

export function receiptListingStyleHint(style: ReceiptListingStyle) {
  const map: Record<ReceiptListingStyle, string> = {
    link: "Each product gets its own pay link — no shared URL on the payment method.",
    handle: "Product shows name + amount, then your Zelle / Venmo / handle.",
    in_person: "Product reads like a ticket — pay at the shop.",
  };
  return map[style];
}

export function defaultFloorSettings(): FloorSettings {
  return {
    live: false,
    windows: [
      {
        days: ["mon", "tue", "wed", "thu", "fri"],
        start: "10:00",
        end: "18:00",
      },
    ],
    responseNote: "",
    awayMessage:
      "We're not available right now. Leave your email and we'll reply to your question.",
    banners: [],
    brandBannerUrl: undefined,
    logoUrl: undefined,
    intro: "",
    profileLinks: [],
    chatIntroMessages: defaultChatIntroMessages(),
    chatEndImages: [],
    endScreenBehavior: defaultChatEndScreenBehavior(),
    notifyEmails: [],
    assistBehavior: "",
    autoAnswer: false,
    shortcuts: [],
    departmentMessages: Array.from({ length: 20 }, () => ""),
    departments: Array.from({ length: 20 }, () => ({ message: "", attachments: [] })),
    preChat: defaultPreChat(),
    setupIndustry: "custom",
    enabledSolutions: allSolutionIds(),
  };
}

export function defaultChatEndScreenBehavior(): ChatEndScreenBehavior {
  return {
    kind: "record_contact",
    title: "Before you go",
    body:
      "Want a copy of this conversation or future updates? Leave your name, email, or phone number.",
    collectLabel: "Contact info",
    collectPlaceholder: "Name, email, or phone",
    submitLabel: "Send",
    offerCode: "THANKYOU10",
    ctaLabel: "Book a follow-up",
    ctaUrl: "",
  };
}

function normalizeChatEndScreenKind(raw: unknown): ChatEndScreenKind {
  if (
    raw === "record_contact" ||
    raw === "offer" ||
    raw === "book_follow_up" ||
    raw === "review" ||
    raw === "none"
  ) {
    return raw;
  }
  return "record_contact";
}

export function normalizeChatEndScreenBehavior(
  raw: unknown,
): ChatEndScreenBehavior {
  const defaults = defaultChatEndScreenBehavior();
  if (!raw || typeof raw !== "object") return defaults;
  const row = raw as Partial<ChatEndScreenBehavior>;
  return {
    kind: normalizeChatEndScreenKind(row.kind),
    title:
      typeof row.title === "string" && row.title.trim()
        ? row.title.trim().slice(0, 80)
        : defaults.title,
    body:
      typeof row.body === "string" && row.body.trim()
        ? row.body.trim().slice(0, 500)
        : defaults.body,
    collectLabel:
      typeof row.collectLabel === "string" && row.collectLabel.trim()
        ? row.collectLabel.trim().slice(0, 50)
        : defaults.collectLabel,
    collectPlaceholder:
      typeof row.collectPlaceholder === "string" && row.collectPlaceholder.trim()
        ? row.collectPlaceholder.trim().slice(0, 80)
        : defaults.collectPlaceholder,
    submitLabel:
      typeof row.submitLabel === "string" && row.submitLabel.trim()
        ? row.submitLabel.trim().slice(0, 40)
        : defaults.submitLabel,
    offerCode:
      typeof row.offerCode === "string"
        ? row.offerCode.trim().slice(0, 40)
        : defaults.offerCode,
    ctaLabel:
      typeof row.ctaLabel === "string" && row.ctaLabel.trim()
        ? row.ctaLabel.trim().slice(0, 60)
        : defaults.ctaLabel,
    ctaUrl:
      typeof row.ctaUrl === "string" ? row.ctaUrl.trim().slice(0, 500) : "",
  };
}

function normalizeProfileLinks(raw: unknown): ProfileLink[] {
  if (!Array.isArray(raw)) return [];
  const out: ProfileLink[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const row = item as Partial<ProfileLink>;
    const label = typeof row.label === "string" ? row.label.trim() : "";
    let url = typeof row.url === "string" ? row.url.trim() : "";
    if (!label || !url) continue;
    if (!/^https?:\/\//i.test(url)) url = `https://${url}`;
    const id =
      typeof row.id === "string" && row.id.trim()
        ? row.id.trim()
        : `pl-${out.length}`;
    out.push({ id, label: label.slice(0, 40), url: url.slice(0, 500) });
    if (out.length >= 8) break;
  }
  return out;
}

function normalizeWeekdays(days: unknown): Weekday[] {
  if (!Array.isArray(days)) return ["mon", "tue", "wed", "thu", "fri"];
  const next = days.filter((d): d is Weekday =>
    WEEKDAYS.includes(d as Weekday),
  );
  return next.length ? next : ["mon", "tue", "wed", "thu", "fri"];
}

function normalizeWindows(windows: unknown): ResponseWindow[] {
  if (!Array.isArray(windows) || windows.length === 0) {
    return defaultFloorSettings().windows;
  }
  return windows.map((w) => {
    const row = w as Partial<ResponseWindow>;
    return {
      days: normalizeWeekdays(row.days),
      start: typeof row.start === "string" && row.start ? row.start : "10:00",
      end: typeof row.end === "string" && row.end ? row.end : "18:00",
    };
  });
}

const BANNER_TONES: ChatBanner["tone"][] = [
  "flash",
  "promo",
  "sale",
  "urgent",
  "ink",
  "custom",
];

function normalizeBannerTone(tone: unknown): ChatBanner["tone"] {
  if (typeof tone === "string" && BANNER_TONES.includes(tone as ChatBanner["tone"])) {
    return tone as ChatBanner["tone"];
  }
  return "promo";
}

function normalizeBanners(banners: unknown): ChatBanner[] {
  if (!Array.isArray(banners)) return [];
  const next: ChatBanner[] = [];
  for (const [index, b] of banners.entries()) {
    const row = b as Partial<ChatBanner>;
    const text = typeof row.text === "string" ? row.text.trim() : "";
    if (!text) continue;
    const label =
      typeof row.label === "string" ? row.label.trim().slice(0, 24) : "";
    const tone = normalizeBannerTone(row.tone);
    next.push({
      id: row.id || `bn-${index}-${Date.now().toString(36)}`,
      text,
      enabled: row.enabled !== false,
      tone,
      ...(label ? { label } : {}),
      size: row.size === "md" ? "md" : "lg",
      ...(tone === "custom" && typeof row.bg === "string" && row.bg
        ? { bg: row.bg }
        : {}),
      ...(tone === "custom" && typeof row.color === "string" && row.color
        ? { color: row.color }
        : {}),
    });
  }
  return next;
}

function normalizeNotifyEmails(emails: unknown): string[] {
  if (!Array.isArray(emails)) return [];
  const seen = new Set<string>();
  const next: string[] = [];
  for (const raw of emails) {
    if (typeof raw !== "string") continue;
    const email = raw.trim().toLowerCase();
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) continue;
    if (seen.has(email)) continue;
    seen.add(email);
    next.push(email);
  }
  return next;
}

function normalizeShortcuts(shortcuts: unknown): ComposerShortcut[] {
  if (!Array.isArray(shortcuts)) return [];
  const next: ComposerShortcut[] = [];
  const seen = new Set<string>();
  let hoursAdded = false;

  for (const [index, raw] of shortcuts.entries()) {
    if (!raw || typeof raw !== "object") continue;
    const row = raw as Partial<ComposerShortcut> & {
      artifactId?: string;
      text?: string;
      label?: string;
    };
    const id =
      typeof row.id === "string" && row.id.trim()
        ? row.id.trim()
        : `sc-${index}-${Date.now().toString(36)}`;
    if (seen.has(id)) continue;

    if (row.kind === "hours") {
      if (hoursAdded) continue;
      hoursAdded = true;
      seen.add(id);
      next.push({ id, kind: "hours" });
      continue;
    }

    if (row.kind === "artifact") {
      const artifactId =
        typeof row.artifactId === "string" ? row.artifactId.trim() : "";
      if (!artifactId) continue;
      const label =
        typeof row.label === "string" ? row.label.trim().slice(0, 40) : "";
      seen.add(id);
      next.push({
        id,
        kind: "artifact",
        artifactId,
        ...(label ? { label } : {}),
      });
      continue;
    }

    if (row.kind === "text") {
      const text = typeof row.text === "string" ? row.text.trim() : "";
      if (!text) continue;
      const label =
        typeof row.label === "string" && row.label.trim()
          ? row.label.trim().slice(0, 40)
          : text.slice(0, 22) + (text.length > 22 ? "…" : "");
      seen.add(id);
      next.push({ id, kind: "text", label, text: text.slice(0, 2000) });
    }
  }

  return next.slice(0, 16);
}

const MAX_CHAT_END_IMAGES = 6;

function normalizeChatEndImages(images: unknown): string[] {
  if (!Array.isArray(images)) return [];
  const next: string[] = [];
  for (const raw of images) {
    if (typeof raw !== "string") continue;
    const url = raw.trim();
    if (!url) continue;
    next.push(url);
    if (next.length >= MAX_CHAT_END_IMAGES) break;
  }
  return next;
}

export const DEPARTMENT_COUNT = 20;
export const MAX_DEPARTMENT_ATTACHMENTS = 8;

function emptyDepartment(): DepartmentContent {
  return { label: "", message: "", attachments: [] };
}

export const DEFAULT_CALL_PHONE = "+1(669)-240-8911";

export function defaultPreChat(): PreChatPage {
  return {
    headline: "",
    bio: "",
    links: [
      {
        id: "pre-call",
        kind: "call",
        label: "Call Us",
        enabled: true,
        href: DEFAULT_CALL_PHONE,
      },
      { id: "pre-live-chat", kind: "chat", label: "Live Chat", enabled: true },
      {
        id: "pre-consult",
        kind: "url",
        label: "Book Consultation",
        enabled: true,
        href: "",
      },
      {
        id: "pre-promo",
        kind: "url",
        label: "Daily Promotions",
        enabled: true,
        href: "",
      },
    ],
  };
}

const PRE_CHAT_KINDS: PreChatLinkKind[] = ["chat", "call", "url", "email"];

function normalizePreChatLink(raw: unknown, index: number): PreChatLink | null {
  if (!raw || typeof raw !== "object") return null;
  const row = raw as Partial<PreChatLink>;
  const kind = PRE_CHAT_KINDS.includes(row.kind as PreChatLinkKind)
    ? (row.kind as PreChatLinkKind)
    : "url";
  const label =
    typeof row.label === "string" && row.label.trim()
      ? row.label.trim().slice(0, 80)
      : kind === "chat"
        ? "Live Chat"
        : kind === "call"
          ? "Call Us"
          : kind === "email"
            ? "Email"
            : "Link";
  return {
    id:
      typeof row.id === "string" && row.id.trim()
        ? row.id.trim()
        : `pre-${index}-${kind}`,
    kind,
    label:
      kind === "call" && label === "Call"
        ? "Call Us"
        : label === "Live chat"
          ? "Live Chat"
          : label === "Book consultation"
            ? "Book Consultation"
            : label,
    enabled: row.enabled !== false,
    href:
      kind === "call" &&
      !(typeof row.href === "string" && row.href.trim())
        ? DEFAULT_CALL_PHONE
        : typeof row.href === "string"
          ? row.href.trim().slice(0, 500)
          : "",
  };
}

const DEFAULT_PROMO_LINK: PreChatLink = {
  id: "pre-promo",
  kind: "url",
  label: "Daily Promotions",
  enabled: true,
  href: "",
};

function isDepartmentsLink(link: PreChatLink) {
  return (
    link.id === "pre-departments" ||
    /^forward message by department$/i.test(link.label)
  );
}

function withDefaultPreChatLinks(links: PreChatLink[]): PreChatLink[] {
  const next = links.filter((link) => !isDepartmentsLink(link));
  if (!next.some((link) => link.id === "pre-promo") && next.length < 12) {
    next.push(DEFAULT_PROMO_LINK);
  }
  return next;
}

export function normalizePreChat(raw: unknown): PreChatPage {
  const defaults = defaultPreChat();
  if (!raw || typeof raw !== "object") return defaults;
  const row = raw as Partial<PreChatPage>;
  const links: PreChatLink[] = [];
  if (Array.isArray(row.links)) {
    for (const [index, item] of row.links.entries()) {
      const link = normalizePreChatLink(item, index);
      if (link) links.push(link);
      if (links.length >= 12) break;
    }
  }
  const ordered = [...links];
  const ids = ordered.map((link) => link.id).join(",");
  const headline =
    typeof row.headline === "string" ? row.headline.trim().slice(0, 80) : "";
  const bio = typeof row.bio === "string" ? row.bio.trim().slice(0, 280) : "";
  if (ids === "pre-live-chat,pre-call,pre-consult") {
    const byId = new Map(ordered.map((link) => [link.id, link]));
    return {
      headline,
      bio,
      links: withDefaultPreChatLinks(
        ["pre-call", "pre-live-chat", "pre-consult"].map((id) => byId.get(id)!),
      ),
    };
  }

  return {
    headline,
    bio,
    links: withDefaultPreChatLinks(ordered.length ? ordered : defaults.links),
  };
}

export function normalizeDepartmentMessages(raw: unknown): string[] {
  const next = Array.from({ length: DEPARTMENT_COUNT }, () => "");
  if (!Array.isArray(raw)) return next;
  for (let i = 0; i < DEPARTMENT_COUNT; i++) {
    const value = raw[i];
    if (typeof value === "string") next[i] = value.slice(0, 2000);
  }
  return next;
}

function normalizeDepartmentAttachment(raw: unknown): DepartmentAttachment | null {
  if (!raw || typeof raw !== "object") return null;
  const row = raw as Partial<DepartmentAttachment>;
  if (row.kind !== "image" && row.kind !== "document") return null;
  if (typeof row.url !== "string" || !row.url.trim()) return null;
  return {
    id:
      typeof row.id === "string" && row.id.trim()
        ? row.id.trim()
        : `att-${Math.random().toString(36).slice(2, 9)}`,
    kind: row.kind,
    name:
      typeof row.name === "string" && row.name.trim()
        ? row.name.trim().slice(0, 180)
        : row.kind === "image"
          ? "Image"
          : "Document",
    url: row.url.trim(),
  };
}

export function normalizeDepartments(
  departments: unknown,
  legacyMessages?: unknown,
): DepartmentContent[] {
  const next = Array.from({ length: DEPARTMENT_COUNT }, emptyDepartment);
  if (Array.isArray(departments)) {
    for (let i = 0; i < DEPARTMENT_COUNT; i++) {
      const row = departments[i];
      if (typeof row === "string") {
        next[i] = { message: row.slice(0, 2000), attachments: [] };
        continue;
      }
      if (!row || typeof row !== "object") continue;
      const content = row as Partial<DepartmentContent>;
      const attachments: DepartmentAttachment[] = [];
      if (Array.isArray(content.attachments)) {
        for (const item of content.attachments) {
          const attachment = normalizeDepartmentAttachment(item);
          if (attachment) attachments.push(attachment);
          if (attachments.length >= MAX_DEPARTMENT_ATTACHMENTS) break;
        }
      }
      next[i] = {
        label:
          typeof content.label === "string"
            ? content.label.trim().slice(0, 80)
            : "",
        message:
          typeof content.message === "string"
            ? content.message.slice(0, 2000)
            : "",
        attachments,
      };
    }
    return next;
  }

  const legacy = normalizeDepartmentMessages(legacyMessages);
  return legacy.map((message) => ({ label: "", message, attachments: [] }));
}

export function departmentHasContent(department?: DepartmentContent | null) {
  if (!department) return false;
  return Boolean(department.message.trim() || department.attachments.length);
}

export function normalizeFloorSettings(
  settings?: Partial<FloorSettings> | null,
): FloorSettings {
  const defaults = defaultFloorSettings();
  if (!settings) return defaults;
  return {
    live: Boolean(settings.live),
    windows: normalizeWindows(settings.windows),
    responseNote:
      typeof settings.responseNote === "string" ? settings.responseNote : "",
    awayMessage:
      typeof settings.awayMessage === "string" && settings.awayMessage.trim()
        ? settings.awayMessage.trim()
        : defaults.awayMessage,
    banners: normalizeBanners(settings.banners),
    brandBannerUrl:
      typeof settings.brandBannerUrl === "string" &&
      settings.brandBannerUrl.trim()
        ? settings.brandBannerUrl.trim()
        : undefined,
    logoUrl:
      typeof settings.logoUrl === "string" && settings.logoUrl.trim()
        ? settings.logoUrl.trim()
        : undefined,
    intro:
      typeof settings.intro === "string"
        ? settings.intro.trim().slice(0, 500)
        : "",
    profileLinks: normalizeProfileLinks(settings.profileLinks),
    chatIntroMessages: normalizeChatIntroMessages(settings.chatIntroMessages),
    endScreenBehavior: normalizeChatEndScreenBehavior(
      settings.endScreenBehavior,
    ),
    notifyEmails: normalizeNotifyEmails(settings.notifyEmails),
    assistBehavior:
      typeof settings.assistBehavior === "string"
        ? settings.assistBehavior.trim().slice(0, 4000)
        : "",
    autoAnswer: Boolean(settings.autoAnswer),
    shortcuts: normalizeShortcuts(settings.shortcuts),
    chatEndImages: normalizeChatEndImages(settings.chatEndImages),
    departmentMessages: normalizeDepartmentMessages(settings.departmentMessages),
    departments: normalizeDepartments(
      settings.departments,
      settings.departmentMessages,
    ),
    preChat: normalizePreChat(settings.preChat),
    setupIndustry: normalizeSetupIndustry(settings.setupIndustry),
    enabledSolutions: normalizeEnabledSolutions(
      settings.enabledSolutions,
      normalizeSetupIndustry(settings.setupIndustry),
    ),
  };
}

const DAY_LABELS: Record<Weekday, string> = {
  mon: "Mon",
  tue: "Tue",
  wed: "Wed",
  thu: "Thu",
  fri: "Fri",
  sat: "Sat",
  sun: "Sun",
};

function formatClock(hhmm: string) {
  const [hRaw, mRaw] = hhmm.split(":");
  const h = Number(hRaw);
  const m = Number(mRaw);
  if (Number.isNaN(h) || Number.isNaN(m)) return hhmm;
  const d = new Date();
  d.setHours(h, m, 0, 0);
  return d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

/** Human label for response windows, e.g. "Mon–Fri 10:00 AM–6:00 PM" */
export function formatResponseWindows(windows: ResponseWindow[]): string {
  if (!windows.length) return "";
  return windows
    .map((w) => {
      const days = w.days.map((d) => DAY_LABELS[d]);
      let dayLabel = days.join(", ");
      if (
        w.days.length === 5 &&
        ["mon", "tue", "wed", "thu", "fri"].every((d) =>
          w.days.includes(d as Weekday),
        )
      ) {
        dayLabel = "Mon–Fri";
      } else if (w.days.length === 7) {
        dayLabel = "Every day";
      } else if (
        w.days.length === 2 &&
        w.days.includes("sat") &&
        w.days.includes("sun")
      ) {
        dayLabel = "Sat–Sun";
      }
      return `${dayLabel} ${formatClock(w.start)}–${formatClock(w.end)}`;
    })
    .join(" · ");
}

const LEGACY_CATEGORY_MAP: Record<string, string> = {
  styles: "cat-styles",
  dishes: "cat-dishes",
  menus: "cat-menus",
  "before-after": "cat-before-after",
  space: "cat-space",
};

export function slugify(name: string): string {
  const base = name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
  return base || "shop";
}

/** Turn a URL slug into a display name: "northside-cuts" → "Northside Cuts" */
export function titleFromSlug(slug: string): string {
  const words = slug
    .split("-")
    .map((w) => w.trim())
    .filter(Boolean);
  if (!words.length) return "My shop";
  return words
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(" ");
}

function migrateLibrary(library: LibraryItem[]): {
  categories: LibraryCategory[];
  artifacts: Artifact[];
} {
  const categories = defaultCategories.map((c) => ({ ...c }));
  const artifacts: Artifact[] = library.map((item) => ({
    id: item.id.startsWith("a") ? item.id : `a-${item.id}`,
    categoryId: LEGACY_CATEGORY_MAP[item.category] ?? "cat-styles",
    kind: "photo" as const,
    title: item.title,
    url: item.imageUrl,
    caption: item.caption,
    ...(item.caption?.trim()
      ? { meta: clampArtifactMeta(item.caption) }
      : {}),
    uses: item.uses,
  }));
  return { categories, artifacts };
}

function normalizeArtifact(raw: Artifact): Artifact {
  const meta = clampArtifactMeta(raw.meta);
  const kind =
    raw.kind === "video" ||
    raw.kind === "url" ||
    raw.kind === "text" ||
    raw.kind === "collection"
      ? raw.kind
      : "photo";
  const urls = Array.isArray(raw.urls)
    ? raw.urls
        .filter((u): u is string => typeof u === "string" && Boolean(u.trim()))
        .map((u) => u.trim())
        .slice(0, 24)
    : undefined;
  const cover =
    typeof raw.url === "string" && raw.url
      ? raw.url
      : urls?.[0] ?? "";

  return {
    id: raw.id,
    categoryId: raw.categoryId,
    kind,
    title: typeof raw.title === "string" ? raw.title.trim().slice(0, 80) : "",
    url: cover,
    uses: typeof raw.uses === "number" ? raw.uses : 0,
    ...(kind === "collection" && urls && urls.length
      ? { urls: urls[0] === cover ? urls : [cover, ...urls.filter((u) => u !== cover)] }
      : {}),
    ...(typeof raw.body === "string" && raw.body ? { body: raw.body } : {}),
    ...(typeof raw.caption === "string" && raw.caption
      ? { caption: raw.caption }
      : {}),
    ...(meta ? { meta } : {}),
  };
}

function normalizeParticipants(raw: unknown): ChatParticipant[] {
  if (!Array.isArray(raw)) return [];
  const out: ChatParticipant[] = [];
  for (const item of raw) {
    const row = item as Partial<ChatParticipant>;
    const id = typeof row.id === "string" ? row.id.trim() : "";
    const name = typeof row.name === "string" ? row.name.trim().slice(0, 48) : "";
    if (!id || !name) continue;
    const department =
      typeof row.department === "string"
        ? row.department.trim().slice(0, 48)
        : "";
    out.push({
      id,
      name,
      joinedAt:
        typeof row.joinedAt === "string" && row.joinedAt.trim()
          ? row.joinedAt
          : new Date().toISOString(),
      ...(department ? { department } : {}),
    });
  }
  return out;
}

export function normalizeSpace(raw: BusinessSpace): BusinessSpace {
  let space: BusinessSpace;
  if (raw.categories?.length && raw.artifacts) {
    const { library: _legacy, ...rest } = raw;
    space = rest;
  } else if (raw.library?.length) {
    const { categories, artifacts } = migrateLibrary(raw.library);
    const { library: _legacy, ...rest } = raw;
    space = { ...rest, categories, artifacts };
  } else {
    space = {
      ...raw,
      categories: raw.categories?.length
        ? raw.categories
        : defaultCategories.map((c) => ({ ...c })),
      artifacts: raw.artifacts ?? [],
    };
  }

  const members = normalizeMembers(space.members);
  const memberIds = new Set(members.map((m) => m.id));
  const soleOwnerId = members.length === 1 ? members[0].id : undefined;

  const withIds = (space.clients ?? []).map((c, index) => {
    const owner =
      c.ownerMemberId && memberIds.has(c.ownerMemberId)
        ? c.ownerMemberId
        : soleOwnerId;
    const participants = normalizeParticipants(c.participants);
    const base: Client = {
      ...c,
      id: c.id || `c-repaired-${index}-${Date.now().toString(36)}`,
      status: normalizeClientStatus(c.status ?? "unknown"),
      name: (c.name || "").trim() || "Guest",
      channel: c.channel || "web",
      preview: c.preview || "",
      unread: c.unread ?? 0,
      trade: c.trade || space.business.trade,
      lastActive: c.lastActive || "Just now",
      ownerMemberId: owner,
      ...(typeof c.email === "string" && c.email.trim()
        ? { email: c.email.trim() }
        : {}),
      ...(typeof c.presentAt === "string" && c.presentAt.trim()
        ? { presentAt: c.presentAt.trim() }
        : {}),
      ...(typeof c.chatEndedAt === "string" && c.chatEndedAt.trim()
        ? { chatEndedAt: c.chatEndedAt.trim() }
        : {}),
      ...(participants.length ? { participants } : {}),
      ...(typeof c.forwardToken === "string" && c.forwardToken.trim()
        ? { forwardToken: c.forwardToken.trim() }
        : {}),
      ...(typeof c.forwardExpiresAt === "string" && c.forwardExpiresAt.trim()
        ? { forwardExpiresAt: c.forwardExpiresAt.trim() }
        : {}),
      ...(c.autoAnswerOff ? { autoAnswerOff: true } : {}),
      ...(typeof c.caseId === "string" && c.caseId.trim()
        ? { caseId: c.caseId.trim().slice(0, 48) }
        : {}),
      ...(c.hiddenFromInbox ? { hiddenFromInbox: true } : {}),
    };
    const draft = normalizeAutoAnswerDraft(c.autoAnswerDraft);
    return draft
      ? { ...withoutAutoAnswerDraft(base), autoAnswerDraft: draft }
      : withoutAutoAnswerDraft(base);
  });

  const cleaned = ensureInboxCategory(space.categories ?? []);
  const artifacts = (space.artifacts ?? [])
    .filter((a) => !legacyDefaultArtifactIds.has(a.id))
    .map(normalizeArtifact);

  return {
    ...space,
    members,
    settings: normalizeFloorSettings(space.settings),
    receiptPayments: normalizeReceiptPayments(space.receiptPayments),
    receiptProducts: normalizeReceiptProducts(space.receiptProducts),
    offerings: normalizeOfferings(space.offerings),
    knowledgeNotes: normalizeKnowledgeNotes(space.knowledgeNotes),
    cases: normalizeCustomerCases(space.cases),
    categories: cleaned.categories,
    artifacts,
    messages: (space.messages ?? []).map(normalizeMessage),
    clients: migrateGuestNames(withIds).filter(
      (c) => !(space.deletedClientIds ?? []).includes(c.id),
    ),
    deletedClientIds: Array.isArray(space.deletedClientIds)
      ? [...new Set(space.deletedClientIds.filter(Boolean))]
      : [],
  };
}

function normalizePaymentKind(kind: unknown): PaymentMethodKind {
  if (
    typeof kind === "string" &&
    (PAYMENT_KINDS as readonly string[]).includes(kind)
  ) {
    return kind as PaymentMethodKind;
  }
  return "other";
}

function normalizeReceiptPayments(raw: unknown): ReceiptPayment[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((row, index) => {
      const item = row as Partial<ReceiptPayment>;
      const label =
        typeof item.label === "string" ? item.label.trim().slice(0, 48) : "";
      const detail =
        typeof item.detail === "string" ? item.detail.trim().slice(0, 240) : "";
      if (!label && !detail) return null;
      const kind = normalizePaymentKind(item.kind);
      return {
        id: item.id || `pay-${index}-${Date.now().toString(36)}`,
        kind,
        label: label || paymentKindLabel(kind),
        detail,
      };
    })
    .filter((p): p is ReceiptPayment => Boolean(p));
}

function normalizeReceiptProducts(raw: unknown): ReceiptProduct[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((row, index) => {
      const item = row as Partial<ReceiptProduct>;
      const title =
        typeof item.title === "string" ? item.title.trim().slice(0, 80) : "";
      if (!title) return null;
      const price =
        typeof item.price === "string" ? item.price.trim().slice(0, 32) : "";
      const note =
        typeof item.note === "string" ? item.note.trim().slice(0, 160) : "";
      const linkUrl =
        typeof item.linkUrl === "string" ? item.linkUrl.trim().slice(0, 400) : "";
      return {
        id: item.id || `prd-${index}-${Date.now().toString(36)}`,
        title,
        ...(price ? { price } : {}),
        ...(note ? { note } : {}),
        ...(linkUrl && /^https?:\/\//i.test(linkUrl) ? { linkUrl } : {}),
      };
    })
    .filter((p): p is ReceiptProduct => Boolean(p));
}

function normalizeReceiptPayload(raw: unknown): ReceiptPayload | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const item = raw as Partial<ReceiptPayload>;
  const productTitle =
    typeof item.productTitle === "string" ? item.productTitle.trim() : "";
  if (!productTitle) return undefined;
  const paymentLabel =
    typeof item.paymentLabel === "string" ? item.paymentLabel.trim() : "";
  const paymentDetail =
    typeof item.paymentDetail === "string" ? item.paymentDetail.trim() : "";
  const productLinkUrl =
    typeof item.productLinkUrl === "string"
      ? item.productLinkUrl.trim().slice(0, 400)
      : "";
  const kind = normalizePaymentKind(item.paymentKind);
  return {
    productTitle: productTitle.slice(0, 80),
    paymentKind: kind,
    paymentLabel: (paymentLabel || paymentKindLabel(kind)).slice(0, 48),
    paymentDetail: paymentDetail.slice(0, 240),
    ...(typeof item.productId === "string" ? { productId: item.productId } : {}),
    ...(typeof item.productPrice === "string" && item.productPrice.trim()
      ? { productPrice: item.productPrice.trim().slice(0, 32) }
      : {}),
    ...(typeof item.productNote === "string" && item.productNote.trim()
      ? { productNote: item.productNote.trim().slice(0, 160) }
      : {}),
    ...(productLinkUrl && /^https?:\/\//i.test(productLinkUrl)
      ? { productLinkUrl }
      : {}),
    ...(typeof item.paymentId === "string" ? { paymentId: item.paymentId } : {}),
  };
}

function normalizeMessage(message: Message): Message {
  const receipt = normalizeReceiptPayload(message.receipt);
  const replyTo = normalizeReplyTo(message.replyTo);
  const reactions = normalizeReactions(message.reactions);

  const base: Message = {
    ...message,
    ...(replyTo ? { replyTo } : { replyTo: undefined }),
    ...(reactions.length ? { reactions } : { reactions: undefined }),
  };

  if (message.kind === "receipt" || receipt) {
    const fromMessage =
      typeof message.linkUrl === "string" && message.linkUrl.trim()
        ? message.linkUrl.trim()
        : undefined;
    const fromProduct =
      receipt?.productLinkUrl && /^https?:\/\//i.test(receipt.productLinkUrl)
        ? receipt.productLinkUrl
        : undefined;
    const fromPayment =
      receipt?.paymentKind === "url" &&
      /^https?:\/\//i.test(receipt.paymentDetail)
        ? receipt.paymentDetail
        : undefined;
    const linkUrl = fromMessage || fromProduct || fromPayment;
    return {
      ...base,
      kind: "receipt",
      ...(receipt ? { receipt } : {}),
      ...(linkUrl ? { linkUrl } : {}),
    };
  }
  return base;
}

function normalizeReplyTo(raw: unknown): Message["replyTo"] | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const row = raw as Partial<NonNullable<Message["replyTo"]>>;
  const id = typeof row.id === "string" ? row.id.trim() : "";
  const preview = typeof row.preview === "string" ? row.preview.trim() : "";
  if (!id || !preview) return undefined;
  const from = row.from === "business" ? "business" : "client";
  return {
    id,
    from,
    preview: preview.slice(0, 120),
    ...(typeof row.fromName === "string" && row.fromName.trim()
      ? { fromName: row.fromName.trim().slice(0, 48) }
      : {}),
    ...(typeof row.kind === "string" ? { kind: row.kind as Message["kind"] } : {}),
  };
}

function normalizeReactions(raw: unknown): NonNullable<Message["reactions"]> {
  if (!Array.isArray(raw)) return [];
  const out: NonNullable<Message["reactions"]> = [];
  for (const item of raw) {
    const row = item as Partial<NonNullable<Message["reactions"]>[number]>;
    const emoji = typeof row.emoji === "string" ? row.emoji.trim() : "";
    if (!emoji) continue;
    const from: "business" | "client" =
      row.from === "business" ? "business" : "client";
    out.push({
      emoji: emoji.slice(0, 8),
      from,
      ...(typeof row.fromMemberId === "string" && row.fromMemberId
        ? { fromMemberId: row.fromMemberId }
        : {}),
      ...(typeof row.fromName === "string" && row.fromName.trim()
        ? { fromName: row.fromName.trim().slice(0, 48) }
        : {}),
    });
    if (out.length >= 40) break;
  }
  return out;
}

function normalizeMembers(members: unknown): FloorMember[] {
  if (!Array.isArray(members)) return [];
  return members
    .map((m, index) => {
      const row = m as Partial<FloorMember>;
      const name = typeof row.name === "string" ? row.name.trim() : "";
      if (!name) return null;
      return {
        id: row.id || `mem-${index}-${Date.now().toString(36)}`,
        name,
      };
    })
    .filter((m): m is FloorMember => Boolean(m));
}

function normalizeClientStatus(status: string): Client["status"] {
  if (status === "client") return "client";
  if (status === "known") return "client";
  return "unknown";
}

export function normalizeCustomerCases(raw: unknown): CustomerCase[] {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<string>();
  return raw
    .map((item) => {
      const row = item as Partial<CustomerCase>;
      const id = typeof row.id === "string" ? row.id.trim().slice(0, 48) : "";
      if (!id || seen.has(id)) return null;
      seen.add(id);
      return {
        id,
        status: normalizeCustomerCaseStatus(row.status),
        notes:
          typeof row.notes === "string" ? row.notes.trim().slice(0, 4000) : "",
        identifiers: normalizeCustomerCaseIdentifiers(row.identifiers),
        ...(typeof row.createdAt === "string" && row.createdAt.trim()
          ? { createdAt: row.createdAt.trim() }
          : {}),
        ...(typeof row.updatedAt === "string" && row.updatedAt.trim()
          ? { updatedAt: row.updatedAt.trim() }
          : {}),
      };
    })
    .filter((item): item is CustomerCase => Boolean(item));
}

export function normalizeCustomerCaseStatus(
  raw: unknown,
): CustomerCaseStatus {
  if (raw === "in_progress" || raw === "resolved") return raw;
  return "open";
}

export function normalizeCustomerCaseIdentifiers(
  raw: unknown,
): CustomerCaseIdentifier[] {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<string>();
  return raw
    .map((item) => {
      const row = item as Partial<CustomerCaseIdentifier>;
      const fallbackId =
        typeof row.label === "string" || typeof row.value === "string"
          ? `${row.label ?? ""}:${row.value ?? ""}`
          : "";
      const id =
        typeof row.id === "string" && row.id.trim()
          ? row.id.trim().slice(0, 64)
          : fallbackId.trim().slice(0, 64);
      const label =
        typeof row.label === "string" ? row.label.trim().slice(0, 80) : "";
      const value =
        typeof row.value === "string" ? row.value.trim().slice(0, 160) : "";
      const url =
        typeof row.url === "string" ? row.url.trim().slice(0, 500) : "";
      if (!id || !label || !value || seen.has(id)) return null;
      seen.add(id);
      return {
        id,
        label,
        value,
        ...(url ? { url } : {}),
      };
    })
    .filter((item): item is CustomerCaseIdentifier => Boolean(item))
    .slice(0, 20);
}

const GUEST_CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

function guestCodeFromSeed(seed: string) {
  let hash = 2166136261;
  for (let i = 0; i < seed.length; i++) {
    hash ^= seed.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }

  let code = "";
  let value = hash >>> 0;
  for (let i = 0; i < 4; i++) {
    code += GUEST_CODE_ALPHABET[value % GUEST_CODE_ALPHABET.length];
    value = Math.floor(value / GUEST_CODE_ALPHABET.length);
  }
  return code;
}

function isGeneratedGuestName(name: string) {
  return /^Guest\s+[A-Z0-9]{4}$/i.test(name.trim());
}

function isLegacyGuestName(name: string) {
  return /^Guest(?:\s+\d+)?$/i.test(name.trim());
}

function dedupeGuestCode(seed: string, used: Set<string>) {
  let attempt = 0;
  let code = guestCodeFromSeed(seed);
  while (used.has(code)) {
    attempt += 1;
    code = guestCodeFromSeed(`${seed}:${attempt}`);
  }
  used.add(code);
  return code;
}

function migrateGuestNames(clients: Client[]): Client[] {
  const used = new Set<string>();
  for (const c of clients) {
    const match = /^Guest\s+([A-Z0-9]{4})$/i.exec(c.name.trim());
    if (match) used.add(match[1].toUpperCase());
  }

  return clients.map((c, index) => {
    const name = c.name.trim();
    if (!isLegacyGuestName(name) || isGeneratedGuestName(name)) return c;
    const code = dedupeGuestCode(c.id || `${name}:${index}`, used);
    return { ...c, name: `Guest ${code}` };
  });
}

/** Guest ABC4, Guest 7KQ2, … using a collision-safe random code. */
export function nextGuestName(clients: Client[]): string {
  const used = new Set<string>();
  for (const c of clients) {
    const match = /^Guest\s+([A-Z0-9]{4})$/i.exec(c.name.trim());
    if (match) used.add(match[1].toUpperCase());
  }

  const code = dedupeGuestCode(
    `${Date.now()}:${Math.random().toString(36).slice(2)}`,
    used,
  );
  return `Guest ${code}`;
}

export function formatMessageTime() {
  return new Date().toLocaleString([], {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

/** Display time + ISO createdAt for wait timers. */
export function messageTimeStamp() {
  return {
    at: formatMessageTime(),
    createdAt: new Date().toISOString(),
  };
}
