"use client";
import { useCallback, useEffect, useState } from "react";
export type SlotsByDate = Record<string, { value: string; label: string }[]>;
export function useBookingAvailability(slug: string, eventId: string, enabled: boolean) {
  const url = `/api/spaces/${encodeURIComponent(slug)}/bookings?eventId=${encodeURIComponent(eventId)}`;
  const [state, setState] = useState<{ url: string; slots: SlotsByDate; error: string }>({ url: "", slots: {}, error: "" });
  const [version, setVersion] = useState(0);
  const refresh = useCallback(() => setVersion((v) => v + 1), []);
  useEffect(() => {
    if (!enabled) return;
    let active = true;
    const controller = new AbortController();
    const load = async () => {
      try {
        const response = await fetch(url, { cache: "no-store", signal: controller.signal });
        const body = await response.json();
        if (!response.ok) throw new Error(body.error || "Could not load availability.");
        if (active) setState({ url, slots: body.slots, error: "" });
      } catch (error) {
        if (active) setState({ url, slots: {}, error: error instanceof Error ? error.message : "Could not load availability." });
      }
    };
    void load();
    const timer = setInterval(() => void load(), 30000);
    window.addEventListener("focus", refresh);
    return () => { active = false; controller.abort(); clearInterval(timer); window.removeEventListener("focus", refresh); };
  }, [url, enabled, version, refresh]);
  return { slots: state.url === url ? state.slots : {}, error: state.url === url ? state.error : "", loading: enabled && state.url !== url, refresh };
}
