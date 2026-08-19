import type {
  Artifact,
  BusinessSpace,
  ChatBanner,
  Client,
  DepartmentAttachment,
  DepartmentContent,
  FloorMember,
  FloorSettings,
  LibraryCategory,
  LibraryItem,
  PreChatLink,
  PreChatLinkKind,
  PreChatPage,
  ResponseWindow,
  Weekday,
} from "./types";
import { defaultCategories, legacyDefaultArtifactIds } from "./data";
import { newerPresentAt } from "./presence";

const WEEKDAYS: Weekday[] = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"];

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
    chatEndImages: [],
    notifyEmails: [],
    assistBehavior: "",
    departmentMessages: Array.from({ length: 20 }, () => ""),
    departments: Array.from({ length: 20 }, emptyDepartment),
    preChat: defaultPreChat(),
  };
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

export const DEPARTMENT_COUNT = 20;
export const MAX_DEPARTMENT_ATTACHMENTS = 8;

function emptyDepartment(): DepartmentContent {
  return { message: "", attachments: [] };
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
  return legacy.map((message) => ({ message, attachments: [] }));
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
    chatEndImages: normalizeChatEndImages(settings.chatEndImages),
    notifyEmails: normalizeNotifyEmails(settings.notifyEmails),
    assistBehavior:
      typeof settings.assistBehavior === "string"
        ? settings.assistBehavior.trim().slice(0, 4000)
        : "",
    departmentMessages: normalizeDepartmentMessages(settings.departmentMessages),
    departments: normalizeDepartments(
      settings.departments,
      settings.departmentMessages,
    ),
    preChat: normalizePreChat(settings.preChat),
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
  return d
    .toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })
    .replace(/\s+(AM|PM)/i, "$1");
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
    uses: item.uses,
  }));
  return { categories, artifacts };
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
    return {
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
    };
  });

  return {
    ...space,
    members,
    settings: normalizeFloorSettings(space.settings),
    artifacts: (space.artifacts ?? []).filter(
      (a) => !legacyDefaultArtifactIds.has(a.id),
    ),
    clients: numberGuestNames(withIds).filter(
      (c) => !(space.deletedClientIds ?? []).includes(c.id),
    ),
    deletedClientIds: Array.isArray(space.deletedClientIds)
      ? [...new Set(space.deletedClientIds.filter(Boolean))]
      : [],
  };
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

function numberGuestNames(clients: Client[]): Client[] {
  let max = 0;
  for (const c of clients) {
    const match = /^Guest\s+(\d+)$/i.exec(c.name.trim());
    if (match) max = Math.max(max, Number(match[1]));
  }

  return clients.map((c) => {
    if (!/^Guest$/i.test(c.name.trim())) return c;
    max += 1;
    return { ...c, name: `Guest ${max}` };
  });
}

/** Guest 1, Guest 2, … based on existing names. */
export function nextGuestName(clients: Client[]): string {
  let max = 0;
  for (const c of clients) {
    const match = /^Guest\s+(\d+)$/i.exec(c.name.trim());
    if (match) max = Math.max(max, Number(match[1]));
  }
  const plainGuests = clients.filter((c) =>
    /^Guest$/i.test(c.name.trim()),
  ).length;
  return `Guest ${max + plainGuests + 1}`;
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
