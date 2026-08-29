import type { Business, BusinessSpace, ChatParticipant, Client, Message, Trade } from "./types";
import type { ReactionActor } from "./messageSocial";
import {
  createChatId,
  forgetChat,
  recallChat,
  recallChatEmail,
  rememberChat,
} from "./chatMemory";
import {
  formatMessageTime,
  formatResponseWindows,
  nextGuestName,
  normalizeFloorSettings,
  normalizeSpace,
  slugify,
  messageTimeStamp,
} from "./spaceNormalize";
import { isLatencyEnabled, notePayloadSize } from "./chatLatency";
import type { SpaceOp } from "./spaceOps";
import { applySpaceOpToSpace, isStaffOnlySpaceOp } from "./spaceOps";
import { withoutAutoAnswerDraft } from "./autoAnswer";
import type { SpaceLiveEvent } from "./spaceEvents";

export {
  formatMessageTime,
  formatResponseWindows,
  nextGuestName,
  normalizeFloorSettings,
  normalizeSpace,
  slugify,
  messageTimeStamp,
};

export { applySpaceOpToSpace };
export type { SpaceOp };

const FALLBACK_POLL_MS = 3_000;

/** Bump so subscribers refetch the full space immediately (e.g. after local send). */
const forceRefreshListeners = new Set<(slug: string) => void>();

export function requestSpaceRefresh(slug: string) {
  for (const fn of forceRefreshListeners) fn(slug);
}

async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const body = init?.body;
  if (typeof body === "string" && isLatencyEnabled()) {
    notePayloadSize("put", new Blob([body]).size);
  }
  const res = await fetch(url, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
    cache: "no-store",
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(text || `Request failed (${res.status})`);
  }
  const text = await res.text();
  if (isLatencyEnabled()) {
    notePayloadSize("get", new Blob([text]).size);
  }
  return (text ? JSON.parse(text) : {}) as T;
}

export async function getSpace(
  slug: string,
  chatId?: string,
  options?: { threadOnly?: boolean },
): Promise<BusinessSpace | null> {
  const params = new URLSearchParams();
  if (chatId) params.set("chatId", chatId);
  if (options?.threadOnly && chatId) params.set("threadOnly", "1");
  const query = params.toString() ? `?${params}` : "";
  const res = await fetch(
    `/api/spaces/${encodeURIComponent(slug)}${query}`,
    { cache: "no-store" },
  );
  if (res.status === 404) return null;
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    let message = "";
    try {
      const parsed = JSON.parse(detail) as { error?: string };
      message = parsed.error?.trim() || "";
    } catch {
      message = detail.trim();
    }
    throw new Error(
      message ||
        (res.status >= 500
          ? "Database unavailable — try again in a moment"
          : "Could not load space"),
    );
  }
  const text = await res.text();
  if (isLatencyEnabled()) {
    notePayloadSize("get", new Blob([text]).size);
  }
  return JSON.parse(text) as BusinessSpace;
}

export type PresenceMap = Record<string, string>;

export type SpaceMeta = {
  updatedAt: string;
  presence?: PresenceMap;
};

export function applyPresence(
  space: BusinessSpace,
  presence: PresenceMap | undefined,
): BusinessSpace {
  if (!presence || !space.clients.length) return space;
  let changed = false;
  const clients = space.clients.map((c) => {
    const next = presence[c.id];
    if (!next || next === c.presentAt) return c;
    changed = true;
    return { ...c, presentAt: next };
  });
  return changed ? { ...space, clients } : space;
}

export function applyIncomingMessage(
  space: BusinessSpace,
  message: Message,
  client?: Client,
): BusinessSpace {
  const hasMessage = space.messages.some((m) => m.id === message.id);
  const messages = hasMessage
    ? space.messages
    : [...space.messages, message];
  if (!client) return { ...space, messages };
  const idx = space.clients.findIndex((c) => c.id === client.id);
  const nextClient =
    idx >= 0 ? { ...space.clients[idx], ...client, id: client.id } : client;
  const clients =
    idx >= 0
      ? [nextClient, ...space.clients.filter((c) => c.id !== client.id)]
      : [nextClient, ...space.clients];
  return {
    ...space,
    messages,
    clients,
    deletedClientIds: (space.deletedClientIds ?? []).filter(
      (id) => id !== client.id,
    ),
  };
}

export async function getSpaceMeta(slug: string): Promise<SpaceMeta | null> {
  const res = await fetch(
    `/api/spaces/${encodeURIComponent(slug)}?meta=1`,
    { cache: "no-store" },
  );
  if (res.status === 404) return null;
  if (!res.ok) throw new Error("Could not load space meta");
  const text = await res.text();
  if (isLatencyEnabled()) {
    notePayloadSize("meta", new Blob([text]).size);
  }
  return JSON.parse(text) as SpaceMeta;
}

export type SpaceEntryClient = {
  id: string;
  email?: string;
  chatEndedAt?: string;
};

export type SpaceEntry = {
  slug: string;
  clients: SpaceEntryClient[];
};

/** Customer entry boot — space exists + slim client ids (no messages/settings). */
export async function getSpaceEntry(
  slug: string,
  options?: { chatId?: string },
): Promise<SpaceEntry | null> {
  const params = new URLSearchParams({ entry: "1" });
  if (options?.chatId) params.set("chatId", options.chatId);
  const res = await fetch(
    `/api/spaces/${encodeURIComponent(slug)}?${params}`,
    { cache: "no-store" },
  );
  if (res.status === 404) return null;
  if (!res.ok) throw new Error("Could not load space entry");
  return (await res.json()) as SpaceEntry;
}

/**
 * Resolve which chat URL to open for a customer device.
 * Returning visitors probe one chat row; cold visitors use a slim client list.
 */
export async function resolveCustomerChatId(slug: string): Promise<{
  spaceSlug: string;
  chatId: string;
}> {
  const existingId = recallChat(slug);

  if (existingId) {
    const probe = await getSpaceEntry(slug, { chatId: existingId });
    if (!probe) throw new Error("Space not found");
    const remembered = probe.clients.find((c) => c.id === existingId);
    if (remembered && !remembered.chatEndedAt) {
      rememberChat(probe.slug, existingId);
      return { spaceSlug: probe.slug, chatId: existingId };
    }
    forgetChat(slug, existingId);
  }

  const email = recallChatEmail(slug)?.toLowerCase();

  // Brand-new device with no email — only confirm the space exists.
  if (!email) {
    const meta = await getSpaceMeta(slug);
    if (!meta) throw new Error("Space not found");
    const spaceSlug = slugify(slug);
    const chatId = createChatId();
    rememberChat(spaceSlug, chatId);
    return { spaceSlug, chatId };
  }

  const entry = await getSpaceEntry(slug);
  if (!entry) throw new Error("Space not found");

  let chatId = createChatId();
  const byEmail = entry.clients.find(
    (c) => c.email?.trim().toLowerCase() === email && !c.chatEndedAt,
  );
  if (byEmail) chatId = byEmail.id;

  rememberChat(entry.slug, chatId);
  return { spaceSlug: entry.slug, chatId };
}

/** Tiny heartbeat — 204, no response body. SSE carries the live patch. */
export async function beatPresence(slug: string, chatId: string): Promise<void> {
  const res = await fetch(
    `/api/spaces/${encodeURIComponent(slug)}/present`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: chatId }),
      cache: "no-store",
      keepalive: true,
    },
  );
  if (!res.ok && res.status !== 204) {
    throw new Error("presence failed");
  }
}

export async function ensureSpace(
  slug: string,
  trade: Trade = "salon",
): Promise<BusinessSpace> {
  return api<BusinessSpace>(`/api/spaces/${encodeURIComponent(slug)}`, {
    method: "POST",
    body: JSON.stringify({ trade }),
  });
}

/** Floor boot — ensure space + inbox + most recent thread in one request. */
export async function bootFloor(
  slug: string,
  trade: Trade = "salon",
): Promise<BusinessSpace> {
  return api<BusinessSpace>(`/api/spaces/${encodeURIComponent(slug)}`, {
    method: "POST",
    body: JSON.stringify({ trade, floorBoot: true }),
  });
}

export async function saveSpace(space: BusinessSpace): Promise<BusinessSpace> {
  return api<BusinessSpace>(
    `/api/spaces/${encodeURIComponent(space.business.slug)}`,
    {
      method: "PUT",
      body: JSON.stringify(space),
    },
  );
}

export async function patchSpace(
  slug: string,
  updater: (space: BusinessSpace) => BusinessSpace,
): Promise<BusinessSpace> {
  const current = await ensureSpace(slug);
  const next = updater(current);
  // Server merges with latest DB row so concurrent writers keep all messages.
  const saved = await saveSpace(next);
  requestSpaceRefresh(slug);
  return saved;
}

export type AppendMessageResult = {
  message: Message;
  client: Client;
  updatedAt: string;
};

export async function sendSpaceEmail(
  slug: string,
  input: { kind: "chat_link"; chatId: string; email: string; origin?: string },
): Promise<{ ok: true; id?: string }> {
  const res = await fetch(`/api/spaces/${encodeURIComponent(slug)}/email`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    cache: "no-store",
    body: JSON.stringify(input),
  });
  const data = (await res.json().catch(() => ({}))) as { error?: string; id?: string };
  if (!res.ok) {
    throw new Error(data.error || "Could not send email.");
  }
  return { ok: true, id: data.id };
}

export async function applySpaceOp(slug: string, op: SpaceOp): Promise<void> {
  await api<{ ok: boolean }>(`/api/spaces/${encodeURIComponent(slug)}/ops`, {
    method: "POST",
    body: JSON.stringify(op),
  });
}

export async function createForwardLink(
  slug: string,
  chatId: string,
): Promise<{ token: string; expiresAt: string; path: string; url: string }> {
  const result = await api<{
    token: string;
    expiresAt: string;
    path: string;
  }>(`/api/spaces/${encodeURIComponent(slug)}/forward`, {
    method: "POST",
    body: JSON.stringify({ chatId }),
  });
  const origin =
    typeof window !== "undefined" ? window.location.origin : "";
  return { ...result, url: `${origin}${result.path}` };
}

export type ForwardInviteMeta = {
  slug: string;
  chatId: string;
  businessName: string;
  customerName: string;
  expiresAt: string;
};

export async function getForwardInvite(
  slug: string,
  token: string,
): Promise<ForwardInviteMeta | null> {
  const res = await fetch(
    `/api/spaces/${encodeURIComponent(slug)}/forward/${encodeURIComponent(token)}`,
    { cache: "no-store" },
  );
  if (res.status === 404) return null;
  if (!res.ok) throw new Error("Could not open forward link");
  return (await res.json()) as ForwardInviteMeta;
}

export async function joinForwardChat(
  slug: string,
  token: string,
  input: { name: string; department?: string; participantId?: string },
): Promise<{
  slug: string;
  chatId: string;
  participant: ChatParticipant;
  client: Client;
}> {
  return api(`/api/spaces/${encodeURIComponent(slug)}/forward/${encodeURIComponent(token)}`, {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export async function toggleReaction(
  slug: string,
  input: { messageId: string; emoji: string; actor: ReactionActor },
): Promise<{ messageId: string; reactions: Message["reactions"] }> {
  const result = await api<{
    messageId: string;
    reactions: Message["reactions"];
  }>(`/api/spaces/${encodeURIComponent(slug)}/reactions`, {
    method: "POST",
    body: JSON.stringify(input),
  });
  return result;
}

/** Small-body chat write — avoids PUT of the full space document. */
export async function appendMessage(
  slug: string,
  input: {
    message: Message;
    client: Client;
    upsertClient?: boolean;
    clearDeleted?: boolean;
    bumpClient?: boolean;
  },
): Promise<AppendMessageResult> {
  return api<AppendMessageResult>(
    `/api/spaces/${encodeURIComponent(slug)}/messages`,
    {
      method: "POST",
      body: JSON.stringify(input),
    },
  );
}

export function applyIncomingClientOnly(
  space: BusinessSpace,
  message: Message,
  client?: Client,
): BusinessSpace {
  if (!client) return space;
  const idx = space.clients.findIndex((c) => c.id === client.id);
  const nextClient =
    idx >= 0 ? { ...space.clients[idx], ...client, id: client.id } : client;
  const clients =
    idx >= 0
      ? [nextClient, ...space.clients.filter((c) => c.id !== client.id)]
      : [nextClient, ...space.clients];
  return {
    ...space,
    clients,
    deletedClientIds: (space.deletedClientIds ?? []).filter(
      (id) => id !== client.id,
    ),
  };
}

/**
 * Live sync via SSE. Full GET only when content updatedAt changes.
 * Pass getChatId so refreshes load messages for one thread, not every chat.
 * Pass initialSpace to skip the duplicate first full GET after boot.
 */
export function subscribeSpace(
  slug: string,
  onChange: (space: BusinessSpace | null) => void,
  options?: {
    getChatId?: () => string | undefined;
    initialSpace?: BusinessSpace | null;
    threadOnly?: boolean;
    /** Floor: keep other threads' messages in memory so caches can be patched. */
    retainOtherThreadMessages?: boolean;
  },
): () => void {
  let cancelled = false;
  let lastUpdatedAt: string | null = null;
  let lastPresence = "";
  let lastSpace: BusinessSpace | null = options?.initialSpace ?? null;
  let inflight = false;
  let pendingRefresh = false;
  let skipNextContentRefresh = false;
  let fallbackPoll: number | undefined;
  let source: EventSource | null = null;

  function applyPresenceOnly(meta: SpaceMeta) {
    const nextPresence = JSON.stringify(meta.presence ?? {});
    if (nextPresence !== lastPresence && lastSpace) {
      lastPresence = nextPresence;
      lastSpace = applyPresence(lastSpace, meta.presence);
      if (!cancelled) onChange(lastSpace);
    } else {
      lastPresence = nextPresence;
    }
  }

  async function fullRefresh() {
    if (inflight) {
      pendingRefresh = true;
      return;
    }
    inflight = true;
    try {
      do {
        pendingRefresh = false;
        const fetchedFor = lastUpdatedAt;
        const chatId = options?.getChatId?.();
        const space = await getSpace(
          slug,
          chatId,
          options?.threadOnly ? { threadOnly: true } : undefined,
        );
        if (cancelled) return;

        // Race check only needed when we already have a watermark.
        let meta: SpaceMeta | null = null;
        if (fetchedFor) {
          try {
            meta = await getSpaceMeta(slug);
          } catch {
            // ignore
          }
          if (meta && meta.updatedAt !== fetchedFor) {
            lastUpdatedAt = meta.updatedAt;
            pendingRefresh = true;
            applyPresenceOnly(meta);
            continue;
          }
        }

        lastSpace = space;
        if (!cancelled) onChange(space);
        if (meta) {
          lastUpdatedAt = meta.updatedAt;
          applyPresenceOnly(meta);
        }
      } while (pendingRefresh && !cancelled);
    } catch {
      // ignore transient errors
    } finally {
      inflight = false;
      if (pendingRefresh && !cancelled) void fullRefresh();
    }
  }

  function applyMeta(meta: SpaceMeta, refreshContent: boolean) {
    if (refreshContent && lastUpdatedAt && meta.updatedAt !== lastUpdatedAt) {
      lastUpdatedAt = meta.updatedAt;
      if (skipNextContentRefresh) {
        skipNextContentRefresh = false;
        applyPresenceOnly(meta);
        return;
      }
      void fullRefresh();
      return;
    }
    lastUpdatedAt = meta.updatedAt;
    applyPresenceOnly(meta);
  }

  function applyLiveEvent(event: SpaceLiveEvent) {
    const activeChatId = options?.getChatId?.();
    const liveClient =
      event.type === "message" && event.client
        ? options?.threadOnly
          ? withoutAutoAnswerDraft(event.client)
          : event.client
        : undefined;
    if (event.type === "message") {
      if (!lastSpace) {
        skipNextContentRefresh = true;
        void fullRefresh();
        return;
      }
      if (!activeChatId || event.message.clientId === activeChatId) {
        lastSpace = applyIncomingMessage(
          lastSpace,
          event.message,
          liveClient,
        );
      } else if (liveClient) {
        lastSpace = options?.retainOtherThreadMessages
          ? applyIncomingMessage(lastSpace, event.message, liveClient)
          : applyIncomingClientOnly(lastSpace, event.message, liveClient);
      }
      skipNextContentRefresh = true;
      if (event.updatedAt) lastUpdatedAt = event.updatedAt;
      if (!cancelled) onChange(lastSpace);
      return;
    }
    if (event.type === "reactions") {
      if (lastSpace) {
        lastSpace = {
          ...lastSpace,
          messages: lastSpace.messages.map((m) =>
            m.id === event.messageId
              ? { ...m, reactions: event.reactions }
              : m,
          ),
        };
        if (!cancelled) onChange(lastSpace);
      }
      skipNextContentRefresh = true;
      if (event.updatedAt) lastUpdatedAt = event.updatedAt;
      return;
    }
    if (event.type === "op") {
      if (options?.threadOnly && isStaffOnlySpaceOp(event.op)) {
        return;
      }
      if (!lastSpace) {
        skipNextContentRefresh = true;
        lastUpdatedAt = event.updatedAt;
        void fullRefresh();
        return;
      }
      lastSpace = applySpaceOpToSpace(lastSpace, event.op);
      // AI draft ops must not skip the following meta refresh — that's how
      // the inbox learns a customer just wrote (customer chat uses a full save,
      // not a live message event).
      if (!isStaffOnlySpaceOp(event.op)) {
        skipNextContentRefresh = true;
      }
      lastUpdatedAt = event.updatedAt;
      if (!cancelled) onChange(lastSpace);
      if (options?.threadOnly && event.op.type === "endChat") {
        void fullRefresh();
      }
      return;
    }
    if (event.type === "presence") {
      if (!lastSpace) return;
      const map = (JSON.parse(lastPresence || "{}") || {}) as Record<
        string,
        string
      >;
      map[event.clientId] = event.presentAt;
      lastPresence = JSON.stringify(map);
      lastSpace = applyPresence(lastSpace, map);
      if (!cancelled) onChange(lastSpace);
      return;
    }
    if (event.type === "meta") {
      if (lastUpdatedAt == null) {
        // Seeded boot already has content — only adopt the watermark.
        if (lastSpace) {
          applyMeta(event, false);
          return;
        }
        lastUpdatedAt = event.updatedAt;
        void fullRefresh();
        return;
      }
      applyMeta(event, true);
    }
  }

  async function pollMeta() {
    if (cancelled) return;
    try {
      const meta = await getSpaceMeta(slug);
      if (!meta) {
        lastSpace = null;
        if (!cancelled) onChange(null);
        return;
      }
      if (lastUpdatedAt == null) {
        // Boot already loaded content — don't fetch the space again.
        if (lastSpace) {
          applyMeta(meta, false);
          return;
        }
        lastUpdatedAt = meta.updatedAt;
        await fullRefresh();
        return;
      }
      applyMeta(meta, true);
    } catch {
      // ignore transient errors
    }
  }

  function startFallbackPoll() {
    if (fallbackPoll != null || cancelled) return;
    fallbackPoll = window.setInterval(() => void pollMeta(), FALLBACK_POLL_MS);
  }

  function stopFallbackPoll() {
    if (fallbackPoll == null) return;
    window.clearInterval(fallbackPoll);
    fallbackPoll = undefined;
  }

  function connectEvents() {
    if (cancelled || typeof EventSource === "undefined") {
      startFallbackPoll();
      return;
    }
    source?.close();
    const es = new EventSource(
      `/api/spaces/${encodeURIComponent(slug)}/events`,
    );
    source = es;
    es.onopen = () => {
      stopFallbackPoll();
    };
    es.onmessage = (ev) => {
      try {
        const data = JSON.parse(ev.data) as SpaceLiveEvent;
        if (!data || typeof data !== "object" || !("type" in data)) return;
        applyLiveEvent(data);
      } catch {
        // ignore malformed frames
      }
    };
    es.onerror = () => {
      startFallbackPoll();
    };
  }

  function onFocus() {
    void pollMeta();
  }

  function onVisible() {
    if (document.visibilityState === "visible") void pollMeta();
  }

  function onForce(target: string) {
    if (target !== slug) return;
    lastUpdatedAt = null;
    void fullRefresh();
  }

  forceRefreshListeners.add(onForce);
  if (lastSpace) {
    // Boot already loaded — open SSE/meta only, skip duplicate full GET.
    void pollMeta();
  } else {
    void fullRefresh();
  }
  connectEvents();
  window.addEventListener("focus", onFocus);
  document.addEventListener("visibilitychange", onVisible);

  return () => {
    cancelled = true;
    forceRefreshListeners.delete(onForce);
    stopFallbackPoll();
    source?.close();
    source = null;
    window.removeEventListener("focus", onFocus);
    document.removeEventListener("visibilitychange", onVisible);
  };
}

export async function listBusinesses(): Promise<Business[]> {
  return api<Business[]>("/api/spaces");
}

export async function createBusiness(
  name: string,
  trade: Trade,
): Promise<BusinessSpace> {
  return api<BusinessSpace>("/api/spaces", {
    method: "POST",
    body: JSON.stringify({ name, trade }),
  });
}

const MAX_FILE_BYTES = 4 * 1024 * 1024;

let r2Enabled: boolean | null = null;

async function r2IsEnabled() {
  if (r2Enabled != null) return r2Enabled;
  try {
    const res = await fetch("/api/upload", { cache: "no-store" });
    const data = (await res.json()) as { enabled?: boolean };
    r2Enabled = Boolean(data.enabled);
  } catch {
    r2Enabled = false;
  }
  return r2Enabled;
}

async function uploadMediaBlob(
  blob: Blob,
  filename: string,
): Promise<string | null> {
  if (!(await r2IsEnabled())) return null;
  const form = new FormData();
  form.append("file", blob, filename);
  const res = await fetch("/api/upload", { method: "POST", body: form });
  if (!res.ok) {
    r2Enabled = null;
    return null;
  }
  const data = (await res.json()) as { url?: string };
  return data.url || null;
}

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error("Could not read file."));
    reader.readAsDataURL(file);
  });
}

export async function readAttachmentFile(file: File): Promise<{
  kind: "image" | "document";
  name: string;
  url: string;
}> {
  if (file.size > MAX_FILE_BYTES) {
    throw new Error("Keep files under 4MB for this prototype.");
  }

  if (file.type.startsWith("image/")) {
    const media = await readMediaFile(file);
    return { kind: "image", name: file.name || "Image", url: media.url };
  }

  const allowedType =
    file.type === "application/pdf" ||
    file.type === "application/msword" ||
    file.type ===
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ||
    file.type === "text/plain" ||
    file.type === "application/rtf" ||
    /\.(pdf|doc|docx|txt|rtf)$/i.test(file.name);

  if (!allowedType) {
    throw new Error("Use an image, PDF, Word, or text file.");
  }

  const url = await fileToDataUrl(file);
  return { kind: "document", name: file.name || "Document", url };
}

export async function readMediaFile(file: File): Promise<{
  kind: "photo" | "video";
  url: string;
}> {
  if (file.size > MAX_FILE_BYTES) {
    throw new Error("Keep files under 4MB for this prototype.");
  }
  const kind = file.type.startsWith("video/")
    ? "video"
    : file.type.startsWith("image/")
      ? "photo"
      : null;
  if (!kind) throw new Error("Use a photo or video file.");

  if (kind === "photo") {
    const blob = await compressImage(file);
    const uploaded = await uploadMediaBlob(blob, "photo.jpg");
    if (uploaded) return { kind, url: uploaded };
    return { kind, url: await blobToDataUrl(blob) };
  }

  const uploaded = await uploadMediaBlob(file, file.name || "video.mp4");
  if (uploaded) return { kind, url: uploaded };
  return { kind, url: await blobToDataUrl(file) };
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error("Could not read file."));
    reader.readAsDataURL(blob);
  });
}

function compressImage(file: File): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const objectUrl = URL.createObjectURL(file);
    img.onload = () => {
      const max = 1200;
      const scale = Math.min(1, max / Math.max(img.width, img.height));
      const canvas = document.createElement("canvas");
      canvas.width = Math.round(img.width * scale);
      canvas.height = Math.round(img.height * scale);
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        URL.revokeObjectURL(objectUrl);
        reject(new Error("Could not process image."));
        return;
      }
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      URL.revokeObjectURL(objectUrl);
      canvas.toBlob(
        (blob) => {
          if (!blob) {
            reject(new Error("Could not process image."));
            return;
          }
          resolve(blob);
        },
        "image/jpeg",
        0.82,
      );
    };
    img.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error("Could not load image."));
    };
    img.src = objectUrl;
  });
}
