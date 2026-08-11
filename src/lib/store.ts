import type { Business, BusinessSpace, Client, Message, Trade } from "./types";
import type { ReactionActor } from "./messageSocial";
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
import { applySpaceOpToSpace } from "./spaceOps";
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

export async function getSpace(slug: string): Promise<BusinessSpace | null> {
  const res = await fetch(`/api/spaces/${encodeURIComponent(slug)}`, {
    cache: "no-store",
  });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error("Could not load space");
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

/** Tiny heartbeat — does not rewrite Space.data or bump content updatedAt. */
export async function beatPresence(slug: string, chatId: string): Promise<void> {
  await api<{ presentAt?: string }>(
    `/api/spaces/${encodeURIComponent(slug)}/present`,
    {
      method: "POST",
      body: JSON.stringify({ chatId }),
    },
  );
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

export async function applySpaceOp(slug: string, op: SpaceOp): Promise<void> {
  await api<{ ok: boolean }>(`/api/spaces/${encodeURIComponent(slug)}/ops`, {
    method: "POST",
    body: JSON.stringify(op),
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

/**
 * Live sync via SSE. Full GET only when content updatedAt changes.
 * Falls back to 3s meta polls if the event stream drops.
 */
export function subscribeSpace(
  slug: string,
  onChange: (space: BusinessSpace | null) => void,
): () => void {
  let cancelled = false;
  let lastUpdatedAt: string | null = null;
  let lastPresence = "";
  let lastSpace: BusinessSpace | null = null;
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
        const space = await getSpace(slug);
        if (cancelled) return;

        let meta: SpaceMeta | null = null;
        try {
          meta = await getSpaceMeta(slug);
        } catch {
          // ignore
        }

        // Row changed while this GET was in flight — don't paint stale JSON
        // (that snap-back is what turns Live off a second later).
        if (meta && fetchedFor && meta.updatedAt !== fetchedFor) {
          lastUpdatedAt = meta.updatedAt;
          pendingRefresh = true;
          applyPresenceOnly(meta);
          continue;
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
    if (event.type === "message") {
      if (!lastSpace) {
        skipNextContentRefresh = true;
        void fullRefresh();
        return;
      }
      lastSpace = applyIncomingMessage(lastSpace, event.message, event.client);
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
    if (event.type === "meta") {
      if (lastUpdatedAt == null) {
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
  void fullRefresh();
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
    const url = await compressImage(file);
    return { kind, url };
  }

  const url = await fileToDataUrl(file);
  return { kind, url };
}

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error("Could not read file."));
    reader.readAsDataURL(file);
  });
}

function compressImage(file: File): Promise<string> {
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
      resolve(canvas.toDataURL("image/jpeg", 0.82));
    };
    img.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error("Could not load image."));
    };
    img.src = objectUrl;
  });
}
