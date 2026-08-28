/** Optional chat latency instrumentation (?latency=1). */

const CHANNEL = "otgf-latency";
const RING = 40;

export type LatencySample = {
  id: string;
  paintMs?: number;
  ackMs?: number;
  peerMs?: number;
  at: number;
};

type PayloadSample = {
  getKb?: number;
  putKb?: number;
  metaKb?: number;
  at: number;
};

type Listener = () => void;

const samples: LatencySample[] = [];
const payloads: PayloadSample[] = [];
const listeners = new Set<Listener>();
const pendingLocal = new Map<string, number>();
const pendingPeerT0 = new Map<string, number>();
const painted = new Set<string>();
const acked = new Set<string>();
const peered = new Set<string>();

let lastPayload: PayloadSample = { at: Date.now() };
let channel: BroadcastChannel | null = null;

function notify() {
  for (const l of listeners) l();
}

function pushSample(partial: LatencySample) {
  const i = samples.findIndex((s) => s.id === partial.id);
  if (i >= 0) {
    samples[i] = { ...samples[i], ...partial };
  } else {
    samples.push(partial);
    if (samples.length > RING) samples.shift();
  }
  notify();
}

export function isLatencyEnabled(): boolean {
  if (typeof window === "undefined") return false;
  return new URLSearchParams(window.location.search).get("latency") === "1";
}

export function enableLatencyHud() {
  // Kept as an explicit hook for instrumentation setup; display is query-gated.
}

function ensureChannel() {
  if (typeof window === "undefined" || channel || !isLatencyEnabled()) return;
  try {
    channel = new BroadcastChannel(CHANNEL);
    channel.onmessage = (ev: MessageEvent) => {
      const data = ev.data as { type?: string; id?: string; t0?: number };
      if (data?.type === "send" && data.id && typeof data.t0 === "number") {
        pendingPeerT0.set(data.id, data.t0);
      }
    };
  } catch {
    channel = null;
  }
}

export function subscribeLatency(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getLatencySnapshot() {
  return {
    samples: samples.slice(),
    lastPayload: { ...lastPayload },
    payloads: payloads.slice(),
  };
}

export function percentile(values: number[], p: number): number | null {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const idx = Math.min(
    sorted.length - 1,
    Math.max(0, Math.ceil((p / 100) * sorted.length) - 1),
  );
  return sorted[idx];
}

export function markSendStart(id: string) {
  if (!isLatencyEnabled()) return;
  ensureChannel();
  const t0 = performance.now();
  pendingLocal.set(id, t0);
  painted.delete(id);
  acked.delete(id);
  pushSample({ id, at: Date.now() });
  try {
    channel?.postMessage({ type: "send", id, t0: Date.now() });
  } catch {
    // ignore
  }
}

export function markSendPaint(id: string) {
  if (!isLatencyEnabled() || painted.has(id)) return;
  const t0 = pendingLocal.get(id);
  if (t0 == null) return;
  painted.add(id);
  const paintMs = Math.round(performance.now() - t0);
  pushSample({ id, paintMs, at: Date.now() });
}

export function markSendAck(id: string) {
  if (!isLatencyEnabled() || acked.has(id)) return;
  const t0 = pendingLocal.get(id);
  if (t0 == null) return;
  acked.add(id);
  const ackMs = Math.round(performance.now() - t0);
  pushSample({ id, ackMs, at: Date.now() });
  pendingLocal.delete(id);
}

export function noteIncomingMessages(
  messages: { id: string; createdAt?: string }[],
  localSentIds: Set<string>,
) {
  if (!isLatencyEnabled()) return;
  ensureChannel();
  const now = Date.now();
  for (const m of messages) {
    if (peered.has(m.id) || localSentIds.has(m.id)) continue;
    const broadcastT0 = pendingPeerT0.get(m.id);
    let peerMs: number | null = null;
    if (broadcastT0 != null) {
      peerMs = Math.round(now - broadcastT0);
      pendingPeerT0.delete(m.id);
    } else if (m.createdAt) {
      const created = Date.parse(m.createdAt);
      if (!Number.isNaN(created) && now - created < 60_000) {
        peerMs = Math.round(now - created);
      }
    }
    if (peerMs == null || peerMs < 0) continue;
    peered.add(m.id);
    pushSample({ id: m.id, peerMs, at: now });
  }
}

export function notePayloadSize(
  kind: "get" | "put" | "meta",
  bytes: number,
) {
  if (!isLatencyEnabled()) return;
  const kb = Math.round((bytes / 1024) * 10) / 10;
  const next: PayloadSample = { ...lastPayload, at: Date.now() };
  if (kind === "get") next.getKb = kb;
  if (kind === "put") next.putKb = kb;
  if (kind === "meta") next.metaKb = kb;
  lastPayload = next;
  payloads.push(next);
  if (payloads.length > RING) payloads.shift();
  notify();
}

export function summarizeLatency() {
  const paints = samples
    .map((s) => s.paintMs)
    .filter((n): n is number => n != null);
  const acks = samples
    .map((s) => s.ackMs)
    .filter((n): n is number => n != null);
  const peers = samples
    .map((s) => s.peerMs)
    .filter((n): n is number => n != null);
  return {
    paint: { p50: percentile(paints, 50), p95: percentile(paints, 95), n: paints.length },
    ack: { p50: percentile(acks, 50), p95: percentile(acks, 95), n: acks.length },
    peer: { p50: percentile(peers, 50), p95: percentile(peers, 95), n: peers.length },
    lastPayload: { ...lastPayload },
  };
}
