"use client";
import { useCallback, useEffect, useState } from "react";
import type { ScheduleRequest } from "@/lib/types";
import { bookingStart, type SchedulerConfig } from "@/lib/scheduling";
import { BookingCalendar } from "./BookingCalendar";
import type { SlotsByDate } from "./useBookingAvailability";

type Details = { booking: ScheduleRequest; config: SchedulerConfig | null; slots: SlotsByDate };
export function BookingManager({ slug, id }: { slug: string; id: string }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => { const timer = setInterval(() => setNow(Date.now()), 60000); return () => clearInterval(timer); }, []);
  const [details, setDetails] = useState<Details | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [mode, setMode] = useState<"view" | "cancel" | "reschedule">("view");
  const [date, setDate] = useState("");
  const [time, setTime] = useState("");
  const call = useCallback(async (action: string, extra = {}) => {
    const token = window.location.hash.slice(1);
    const response = await fetch(`/api/spaces/${encodeURIComponent(slug)}/bookings`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action, id, ...(token ? { token } : {}), ...extra }), cache: "no-store" });
    const body = await response.json();
    if (!response.ok) throw new Error(body.error || "Could not load this appointment.");
    return body;
  }, [slug, id]);
  useEffect(() => {
    let active = true;
    call("read").then((body) => { if (active) setDetails(body); }).catch((error) => { if (active) setError(error.message); });
    return () => { active = false; };
  }, [call]);
  async function startReschedule() {
    setBusy(true); setError(""); setNotice("");
    try { setDetails(await call("read")); setDate(""); setTime(""); setMode("reschedule"); }
    catch (error) { setError(error instanceof Error ? error.message : "Could not load availability."); }
    finally { setBusy(false); }
  }
  async function save(action: "cancel" | "reschedule") {
    setBusy(true); setError(""); setNotice("");
    try {
      const result = await call(action, { date, time });
      setDetails((current) => current ? { ...current, booking: result.booking } : null);
      setMode("view");
      setNotice(action === "cancel" ? "Your appointment is canceled. The time is now available for others." : result.booking.status === "confirmed" ? "Your new appointment time is confirmed." : "Your new time is reserved and awaiting approval.");
    } catch (error) {
      setError(error instanceof Error ? error.message : "Could not change this appointment.");
      if (action === "reschedule") {
        try { setDetails(await call("read")); setTime(""); } catch { /* Preserve the original error and appointment. */ }
      }
    } finally { setBusy(false); }
  }
  const booking = details?.booking;
  const active = booking && (booking.status === "confirmed" || booking.status === "requested") && bookingStart(booking) > now;
  return <main className="booking-management"><section className="settings-editor-card">
    <p className="dashboard-kicker">Manage appointment</p><h1>{booking?.title || "Your appointment"}</h1>
    {!details && !error && <p role="status">Loading appointment…</p>}
    {booking && <><p><strong>{booking.date} · {booking.time}</strong> · {booking.timeZone || "UTC"}</p><p>{booking.durationMinutes} minutes · {booking.status === "requested" ? "Awaiting approval" : booking.status === "confirmed" ? "Confirmed" : booking.status === "canceled" ? "Canceled" : "Declined"}</p><p>{booking.name}</p></>}
    {notice && <p role="status">{notice}</p>}
    {error && <p className="editor-error" role="alert">{error}</p>}
    {mode === "view" && active && <div className="forms-share-actions"><button type="button" className="btn-solid" disabled={busy || !details?.config} onClick={() => void startReschedule()}>Reschedule</button><button type="button" className="btn-ghost" disabled={busy} onClick={() => { setMode("cancel"); setNotice(""); }}>Cancel appointment</button></div>}
    {mode === "cancel" && <><p>Cancel this appointment and release the reserved time?</p><div className="forms-share-actions"><button className="btn-solid" disabled={busy} onClick={() => void save("cancel")}>{busy ? "Canceling…" : "Yes, cancel appointment"}</button><button className="btn-ghost" disabled={busy} onClick={() => setMode("view")}>Keep appointment</button></div></>}
    {mode === "reschedule" && details?.config && <><p>Your original time stays reserved until your new time is saved.</p><BookingCalendar config={details.config} slotsByDate={details.slots} date={date} time={time} onDate={(value) => { setDate(value); setTime(""); }} onTime={setTime} /><div className="forms-share-actions"><button className="btn-solid" disabled={busy || !details.slots[date]?.some((slot) => slot.value === time)} onClick={() => void save("reschedule")}>{busy ? "Saving…" : "Save new time"}</button><button className="btn-ghost" disabled={busy} onClick={() => setMode("view")}>Keep original time</button></div></>}
    {details && !details.config && active && <p>This event is no longer offered. You can still cancel your appointment.</p>}
  </section></main>;
}
