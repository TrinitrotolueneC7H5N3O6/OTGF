export type ClientStatus = "unknown" | "client";

export type MessageKind = "text" | "image" | "video" | "link" | "item" | "specialties";

export type Trade = "salon" | "hair" | "food";

export type ArtifactKind = "photo" | "video" | "url" | "text";

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
}

export interface Message {
  id: string;
  clientId: string;
  from: "business" | "client";
  kind: MessageKind;
  body: string;
  imageUrl?: string;
  videoUrl?: string;
  linkUrl?: string;
  artifactId?: string;
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
  title: string;
  /** Image/video/link src — https, data:, or blob: */
  url: string;
  /** Text body for kind=text; optional caption otherwise */
  body?: string;
  caption?: string;
  uses: number;
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
  /**
   * Up to 6 marketing photos shown at the end of customer chat
   * after the floor ends the conversation.
   */
  chatEndImages?: string[];
  /** Emails that receive floor notifications */
  notifyEmails: string[];
  /** Custom instructions for AI Assist tone / behavior */
  assistBehavior?: string;
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

export interface BusinessSpace {
  business: Business;
  clients: Client[];
  messages: Message[];
  categories: LibraryCategory[];
  artifacts: Artifact[];
  settings: FloorSettings;
  /** Staff / employees who can own chats */
  members: FloorMember[];
  /** Clients removed on the floor — kept so merges don't resurrect them */
  deletedClientIds?: string[];
  /** legacy — removed after normalize */
  library?: LibraryItem[];
}
