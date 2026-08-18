import type { Client } from "./types";

/** How recently the customer must have heartbeated to count as live (4 × 5s beats). */
export const CLIENT_LIVE_MS = 20_000;

export function isClientLive(
  client: Pick<Client, "presentAt"> | null | undefined,
  now = Date.now(),
) {
  if (!client?.presentAt) return false;
  const at = Date.parse(client.presentAt);
  if (!Number.isFinite(at)) return false;
  return now - at <= CLIENT_LIVE_MS;
}

export function newerPresentAt(a?: string, b?: string) {
  const ta = a ? Date.parse(a) : NaN;
  const tb = b ? Date.parse(b) : NaN;
  if (!Number.isFinite(ta) && !Number.isFinite(tb)) return undefined;
  if (!Number.isFinite(ta)) return b;
  if (!Number.isFinite(tb)) return a;
  return ta >= tb ? a : b;
}
