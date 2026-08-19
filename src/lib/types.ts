export type ClientStatus = "unknown" | "client";

export type MessageKind =
  | "text"
  | "image"
  | "video"
  | "link"
  | "item"
  | "receipt"
  | "system"
  | "specialties";

export type Trade = "salon" | "hair" | "food";

export type ArtifactKind = "photo" | "video" | "url" | "text" | "collection";

export type PaymentMethodKind =
  | "url"
  | "in_person"
  | "zelle"
  | "venmo"
  | "cashapp"
  | "other";

export interface Business {
  id: string;
  name: string;
  slug: string;
  trade: Trade;
  createdAt: string;
}

export interface FloorMember {
  id: string;
  name: string;
}

export interface Client {
  id: string;
  name: string;
  status: ClientStatus;
  channel: "sms" | "ig" | "walk-in" | "web";
  preview: string;
  unread: number;
  trade: Trade;
  lastActive: string;
  note?: string;
  /** Floor member responsible for this chat */
  ownerMemberId?: string;
  /** Email left when team is away — for follow-up replies */
  email?: string;
  /** ISO time of last customer-tab presence heartbeat */
  presentAt?: string;
  /** ISO time when the floor ended this chat */
  chatEndedAt?: string;
  /** People who joined this thread via a forward link */
  participants?: ChatParticipant[];
  /** Active forward-invite token for this chat */
  forwardToken?: string;
  forwardExpiresAt?: string;
}

export interface ChatParticipant {
  id: string;
  name: string;
  department?: string;
  joinedAt: string;
}

export interface ReceiptPayload {
  productId?: string;
  productTitle: string;
  productPrice?: string;
  productNote?: string;
  /** Per-product checkout URL when paymentKind is url */
  productLinkUrl?: string;
  paymentId?: string;
  paymentKind: PaymentMethodKind;
  paymentLabel: string;
  paymentDetail: string;
}

export interface MessageReplyRef {
  id: string;
  from: "business" | "client";
  fromName?: string;
  /** Short preview of the message being replied to */
  preview: string;
  kind?: MessageKind;
}

export interface MessageReaction {
  emoji: string;
  from: "business" | "client";
  /** Floor member who reacted (business side) */
  fromMemberId?: string;
  fromName?: string;
}

export interface Message {
  id: string;
  clientId: string;
  from: "business" | "client";
  kind: MessageKind;
  body: string;
  imageUrl?: string;
  /** Gallery images when sending a collection (imageUrl is cover) */
  imageUrls?: string[];
  videoUrl?: string;
  linkUrl?: string;
  artifactId?: string;
  /** Official service/product acceptance + payment ask */
  receipt?: ReceiptPayload;
  /** Snapshot of the message this replies to */
  replyTo?: MessageReplyRef;
  reactions?: MessageReaction[];
  at: string;
  /** ISO timestamp when the message was created (for wait timers) */
  createdAt?: string;
  /** Floor member who sent this (business messages) */
  fromMemberId?: string;
  /** Display name snapshot for customer trust */
  fromName?: string;
}

export interface LibraryCategory {
  id: string;
  name: string;
}

export interface Artifact {
  id: string;
  categoryId: string;
  kind: ArtifactKind;
  /** Personal label shown on the floor (employee-facing) */
  title: string;
  /** Short AI/search note — keep brief for Assist token cost */
  meta?: string;
  /** Image/video/link src — https, data:, or blob:; cover for collections */
  url: string;
  /** Extra image urls for kind=collection (url is the cover / first) */
  urls?: string[];
  /** Text body for kind=text; optional caption otherwise */
  body?: string;
  caption?: string;
  uses: number;
}

/** How the store collects payment for a receipt */
export interface ReceiptPayment {
  id: string;
  kind: PaymentMethodKind;
  label: string;
  /** URL, handle, or short instruction */
  detail: string;
}

/** Product or service that can be attached to a receipt */
export interface ReceiptProduct {
  id: string;
  title: string;
  price?: string;
  note?: string;
  /** Checkout / pay URL for this product (when using payment-link style) */
  linkUrl?: string;
}

/** @deprecated legacy shape — migrated in store.normalizeSpace */
export interface LibraryItem {
  id: string;
  title: string;
  category: string;
  trade: Trade | "shared";
  imageUrl: string;
  caption: string;
  uses: number;
}

export type Weekday = "mon" | "tue" | "wed" | "thu" | "fri" | "sat" | "sun";

export interface ResponseWindow {
  days: Weekday[];
  /** HH:MM 24h */
  start: string;
  /** HH:MM 24h */
  end: string;
}

export type BannerTone =
  | "flash"
  | "promo"
  | "sale"
  | "urgent"
  | "ink"
  | "custom";

export type BannerSize = "md" | "lg";

export interface ChatBanner {
  id: string;
  text: string;
  enabled: boolean;
  /** Visual theme — marketing shoutouts default loud */
  tone: BannerTone;
  /** Optional eyebrow e.g. DEAL, TODAY, SHOUTOUT */
  label?: string;
  size: BannerSize;
  /** Used when tone is custom */
  bg?: string;
  color?: string;
}

/** Public profile link (YouTube-style) shown on customer chat */
export interface ProfileLink {
  id: string;
  label: string;
  url: string;
}

export interface FloorSettings {
  /** Business is currently available for live replies */
  live: boolean;
  /** Hours when customers usually get a response */
  windows: ResponseWindow[];
  /** Optional note under the hours */
  responseNote: string;
  /**
   * Shown on customer chat when not live — ask them to leave email, etc.
   */
  awayMessage: string;
  /** Shown at the top of customer chats when enabled */
  banners: ChatBanner[];
  /** Full-bleed photo at the top of customer chat (fades out at bottom) */
  brandBannerUrl?: string;
  /** Circular logo beside the business name on customer chat */
  logoUrl?: string;
  /** Short intro under the business name on customer chat */
  intro: string;
  /** Optional links under the intro (Instagram, booking, etc.) */
  profileLinks: ProfileLink[];
  /**
   * Up to 6 marketing photos shown at the end of customer chat
   * after the floor ends the conversation.
   */
  chatEndImages?: string[];
  /** Emails that receive floor notifications */
  notifyEmails: string[];
  /** Custom instructions for AI Assist tone / behavior */
  assistBehavior?: string;
  /**
   * Composer shortcut bar — pin common artifacts / phrases for one-tap send.
   * Tool chips (Assist / Artifacts / Receipt) stay fixed in the UI.
   */
  shortcuts: ComposerShortcut[];
  /** Attached customer-chat messages for Departments 1–20 */
  departmentMessages?: string[];
  /** Rich department content (message + files) for Departments 1–20 */
  departments?: DepartmentContent[];
  /** Linktree-style page shown at /{slug} before live chat */
  preChat?: PreChatPage;
}
export interface DepartmentAttachment {
  id: string;
  kind: "image" | "document";
  name: string;
  url: string;
}

export interface DepartmentContent {
  message: string;
  attachments: DepartmentAttachment[];
}

export type PreChatLinkKind = "chat" | "call" | "url" | "email";

export interface PreChatLink {
  id: string;
  kind: PreChatLinkKind;
  label: string;
  enabled: boolean;
  /** Phone, URL, or email depending on kind */
  href?: string;
}

export interface PreChatPage {
  headline: string;
  bio: string;
  links: PreChatLink[];
}

/** One-tap chips above the floor composer */
export type ComposerShortcut =
  | {
      id: string;
      kind: "artifact";
      artifactId: string;
      /** Optional override label; defaults to artifact title */
      label?: string;
    }
  | {
      id: string;
      kind: "text";
      label: string;
      text: string;
    }
  | {
      id: string;
      kind: "hours";
    };

export interface BusinessSpace {
  business: Business;
  clients: Client[];
  messages: Message[];
  categories: LibraryCategory[];
  artifacts: Artifact[];
  settings: FloorSettings;
  /** Staff / employees who can own chats */
  members: FloorMember[];
  /** Ways customers can pay when a receipt is sent */
  receiptPayments: ReceiptPayment[];
  /** Products / services attachable to receipts */
  receiptProducts: ReceiptProduct[];
  /** Clients removed on the floor — kept so merges don't resurrect them */
  deletedClientIds?: string[];
  /** legacy — removed after normalize */
  library?: LibraryItem[];
}
