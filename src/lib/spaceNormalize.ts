import type {
  Artifact,
  BusinessSpace,
  ChatBanner,
  Client,
  FloorMember,
  FloorSettings,
  LibraryCategory,
  LibraryItem,
  Message,
  PaymentMethodKind,
  ReceiptPayment,
  ReceiptPayload,
  ReceiptProduct,
  ResponseWindow,
  Weekday,
} from "./types";
import { defaultCategories, ensureInboxCategory, legacyDefaultArtifactIds } from "./data";
import { newerPresentAt } from "./presence";
import { clampArtifactMeta } from "./artifactMeta";

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
    notifyEmails: [],
    assistBehavior: "",
  };
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
    notifyEmails: normalizeNotifyEmails(settings.notifyEmails),
    assistBehavior:
      typeof settings.assistBehavior === "string"
        ? settings.assistBehavior.trim().slice(0, 4000)
        : "",
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
    categories: cleaned.categories,
    artifacts,
    messages: (space.messages ?? []).map(normalizeMessage),
    clients: numberGuestNames(withIds).filter(
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
