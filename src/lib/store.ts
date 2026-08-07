import type { Business, BusinessSpace, Trade } from "./types";
import {
  formatMessageTime,
  formatResponseWindows,
  nextGuestName,
  normalizeFloorSettings,
  normalizeSpace,
  slugify,
  messageTimeStamp,
} from "./spaceNormalize";

export {
  formatMessageTime,
  formatResponseWindows,
  nextGuestName,
  normalizeFloorSettings,
  normalizeSpace,
  slugify,
  messageTimeStamp,
};

async function api<T>(url: string, init?: RequestInit): Promise<T> {
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
  return res.json() as Promise<T>;
}

export async function getSpace(slug: string): Promise<BusinessSpace | null> {
  const res = await fetch(`/api/spaces/${encodeURIComponent(slug)}`, {
    cache: "no-store",
  });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error("Could not load space");
  return res.json() as Promise<BusinessSpace>;
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
  return saveSpace(next);
}

/** Poll the shared DB so floor + chat stay in sync across browsers. */
export function subscribeSpace(
  slug: string,
  onChange: (space: BusinessSpace | null) => void,
): () => void {
  let cancelled = false;

  async function refresh() {
    try {
      const space = await getSpace(slug);
      if (!cancelled) onChange(space);
    } catch {
      // ignore transient errors
    }
  }

  function onFocus() {
    void refresh();
  }

  function onVisible() {
    if (document.visibilityState === "visible") void refresh();
  }

  void refresh();
  const poll = window.setInterval(() => void refresh(), 800);
  window.addEventListener("focus", onFocus);
  document.addEventListener("visibilitychange", onVisible);

  return () => {
    cancelled = true;
    window.clearInterval(poll);
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
