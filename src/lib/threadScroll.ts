const SCROLL_KEY = "otgf:thread-scroll";

type ScrollMap = Record<string, number>;

function readMap(): ScrollMap {
  try {
    const raw = sessionStorage.getItem(SCROLL_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object") return {};
    return parsed as ScrollMap;
  } catch {
    return {};
  }
}

function writeMap(map: ScrollMap) {
  try {
    sessionStorage.setItem(SCROLL_KEY, JSON.stringify(map));
  } catch {
    // ignore quota / private mode
  }
}

/** Persist scrollTop for a floor thread (per space + client). */
export function saveThreadScroll(key: string, top: number) {
  const map = readMap();
  map[key] = top;
  writeMap(map);
}

export function recallThreadScroll(key: string): number | undefined {
  const value = readMap()[key];
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

export function forgetThreadScroll(key: string) {
  const map = readMap();
  if (!(key in map)) return;
  delete map[key];
  writeMap(map);
}

export function threadScrollKey(slug: string, clientId: string) {
  return `${slug}:${clientId}`;
}
