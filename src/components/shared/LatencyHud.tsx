"use client";

import { useEffect, useState } from "react";
import {
  enableLatencyHud,
  getLatencySnapshot,
  isLatencyEnabled,
  subscribeLatency,
  summarizeLatency,
} from "@/lib/chatLatency";

function fmt(n: number | null | undefined) {
  if (n == null) return "—";
  return `${n}ms`;
}

export function LatencyHud() {
  const [on, setOn] = useState(false);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    if (isLatencyEnabled()) {
      enableLatencyHud();
      setOn(true);
    }
  }, []);

  useEffect(() => {
    if (!on) return;
    return subscribeLatency(() => setTick((t) => t + 1));
  }, [on]);

  if (!on) return null;

  const summary = summarizeLatency();
  const { lastPayload } = getLatencySnapshot();
  void tick;

  return (
    <div
      className="latency-hud"
      role="status"
      aria-live="polite"
      title="Chat latency HUD — disable with localStorage otgf-latency=0"
    >
      <div className="latency-hud-title">Latency</div>
      <div>
        paint p50/p95 {fmt(summary.paint.p50)}/{fmt(summary.paint.p95)} (n=
        {summary.paint.n})
      </div>
      <div>
        ack p50/p95 {fmt(summary.ack.p50)}/{fmt(summary.ack.p95)} (n=
        {summary.ack.n})
      </div>
      <div>
        peer p50/p95 {fmt(summary.peer.p50)}/{fmt(summary.peer.p95)} (n=
        {summary.peer.n})
      </div>
      <div>
        payload get/put/meta {lastPayload.getKb ?? "—"}/
        {lastPayload.putKb ?? "—"}/{lastPayload.metaKb ?? "—"} KB
      </div>
      <button
        type="button"
        className="latency-hud-copy"
        onClick={() => {
          const text = JSON.stringify(summarizeLatency(), null, 2);
          void navigator.clipboard?.writeText(text);
          console.table({
            paint_p50: summary.paint.p50,
            paint_p95: summary.paint.p95,
            ack_p50: summary.ack.p50,
            ack_p95: summary.ack.p95,
            peer_p50: summary.peer.p50,
            peer_p95: summary.peer.p95,
          });
        }}
      >
        Copy summary
      </button>
    </div>
  );
}
