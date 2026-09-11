import type { QuickBuildConfig } from "./types";

export type SchedulerConfig = Extract<QuickBuildConfig, { type: "scheduler" }>;
export const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

export function scheduleChoiceOptions(config: Pick<SchedulerConfig, "choiceOptions">) {
  return Array.isArray(config.choiceOptions)
    ? config.choiceOptions.filter((item): item is string => typeof item === "string").map((item) => item.trim().slice(0, 80)).filter(Boolean).slice(0, 20)
    : [];
}

export function scheduleChoicePrompt(config: Pick<SchedulerConfig, "choicePrompt">) {
  const prompt = typeof config.choicePrompt === "string" ? config.choicePrompt.trim().slice(0, 80) : "";
  return prompt || "What is this for?";
}

export function composeBookingNotes(config: SchedulerConfig, choice: unknown, notes: unknown) {
  const extra = typeof notes === "string" ? notes.trim().slice(0, 2000) : "";
  const options = scheduleChoiceOptions(config);
  if (!options.length) return extra;
  const selected = typeof choice === "string" ? choice.trim() : "";
  if (!options.includes(selected)) return null;
  const labeled = `${scheduleChoicePrompt(config)}: ${selected}`;
  return extra ? `${labeled}\n\n${extra}`.slice(0, 2000) : labeled;
}

export function scheduleDate(now: number, timeZone = "UTC") {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(now);
  return ["year", "month", "day"].map((key) => parts.find((p) => p.type === key)!.value).join("-");
}

export function scheduleInstant(date: string, time: string, timeZone = "UTC") {
  const target = Date.parse(`${date}T${time}:00Z`);
  if (!Number.isFinite(target)) return NaN;
  let instant = target;
  const formatter = new Intl.DateTimeFormat("en-GB", { timeZone, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
  for (let i = 0; i < 3; i++) {
    const parts = formatter.formatToParts(instant);
    const get = (key: string) => parts.find((p) => p.type === key)!.value;
    const wall = Date.parse(`${get("year")}-${get("month")}-${get("day")}T${get("hour")}:${get("minute")}:00Z`);
    if (wall === target) return instant;
    instant += target - wall;
  }
  return NaN; // A skipped hour at the daylight-saving transition is unavailable.
}

export type HoursRange = { start: string; end: string };
export type BusyBooking = { id?: string; date: string; time: string; durationMinutes: number; status: string; timeZone?: string; startsAt?: string | Date | null; endsAt?: string | Date | null; bufferBeforeMinutes?: number; bufferAfterMinutes?: number; notes?: string };

export function normalizeSchedulingRules(row: Record<string, unknown>) {
  const number = (key: string, max: number, fallback = 0) => Number.isFinite(Number(row[key])) ? Math.min(max, Math.max(0, Math.round(Number(row[key])))) : fallback;
  const ranges = (raw: unknown): HoursRange[] => Array.isArray(raw) ? raw.slice(0, 12).flatMap((r) => {
    if (!r || typeof r !== "object") return [];
    const { start, end } = r;
    return typeof start === "string" && typeof end === "string" && /^([01]\d|2[0-3]):[0-5]\d$/.test(start) && /^([01]\d|2[0-3]):[0-5]\d$/.test(end) && start < end ? [{ start, end }] : [];
  }) : [];
  const map = (raw: unknown, weekly: boolean) => raw && typeof raw === "object" && !Array.isArray(raw) ? Object.fromEntries(Object.entries(raw).slice(0, weekly ? 7 : 366).filter(([key]) => weekly ? /^[0-6]$/.test(key) : /^\d{4}-\d{2}-\d{2}$/.test(key)).map(([key, value]) => [key, ranges(value)])) : undefined;
  return {
    confirmationMode: row.confirmationMode === "instant" ? "instant" as const : "approval" as const,
    weeklyHours: map(row.weeklyHours, true),
    dateOverrides: map(row.dateOverrides, false),
    bufferBeforeMinutes: number("bufferBeforeMinutes", 240),
    bufferAfterMinutes: number("bufferAfterMinutes", 240),
    slotIntervalMinutes: Math.max(5, number("slotIntervalMinutes", 120, Number(row.durationMinutes) || 30)),
    dailyLimit: number("dailyLimit", 100),
  };
}

export function hoursForDate(config: SchedulerConfig, date: string): HoursRange[] {
  const weekday = new Date(`${date}T12:00:00Z`).getUTCDay();
  if (config.dateOverrides && Object.hasOwn(config.dateOverrides, date)) return config.dateOverrides[date];
  if (config.weeklyHours && Object.hasOwn(config.weeklyHours, String(weekday))) return config.weeklyHours[String(weekday)];
  return (config.weekdays ?? [0,1,2,3,4,5,6]).includes(weekday) ? [{ start: config.startTime, end: config.endTime }] : [];
}

export function scheduleDates(config: SchedulerConfig, now = Date.now()) {
  const today = scheduleDate(now, config.timeZone);
  return Array.from({ length: config.daysAhead }, (_, i) => {
    const date = new Date(`${today}T12:00:00Z`);
    date.setUTCDate(date.getUTCDate() + i);
    return { value: date.toISOString().slice(0, 10), label: new Intl.DateTimeFormat("en-US", { timeZone: "UTC", weekday: "short", month: "short", day: "numeric" }).format(date), weekday: date.getUTCDay() };
  }).filter((day) => hoursForDate(config, day.value).some((r) => r.start < r.end));
}

export function bookingTimeZone(booking: BusyBooking) {
  return (!booking.startsAt && booking.notes?.match(/Time zone: ([^\n]+)/)?.[1]) || booking.timeZone || "UTC";
}

export function bookingStart(booking: BusyBooking) {
  if (booking.startsAt) return new Date(booking.startsAt).getTime();
  // Older requests recorded their zone in notes, before dedicated columns existed.
  const zone = bookingTimeZone(booking);
  try { return scheduleInstant(booking.date, booking.time, zone); } catch { return NaN; }
}

export function bookingConflicts(start: number, end: number, before: number, after: number, bookings: BusyBooking[]) {
  return bookings.some((b) => {
    if (b.status !== "requested" && b.status !== "confirmed") return false;
    const otherStart = bookingStart(b);
    const otherEnd = b.endsAt ? new Date(b.endsAt).getTime() : otherStart + b.durationMinutes * 60000;
    // Fail closed for a malformed active legacy booking until the owner resolves it.
    if (!Number.isFinite(otherStart) || !Number.isFinite(otherEnd)) return true;
    return start - before * 60000 < otherEnd + (b.bufferAfterMinutes ?? 0) * 60000 && end + after * 60000 > otherStart - (b.bufferBeforeMinutes ?? 0) * 60000;
  });
}

export function scheduleSlots(config: SchedulerConfig, date: string, now = Date.now(), bookings: BusyBooking[] = []) {
  if (!date || !scheduleDates(config, now).some((day) => day.value === date)) return [];
  const active = bookings.filter((b) => b.status === "requested" || b.status === "confirmed");
  if (config.dailyLimit && active.filter((b) => {
    const start = bookingStart(b);
    return Number.isFinite(start) && scheduleDate(start, config.timeZone) === date;
  }).length >= config.dailyLimit) return [];
  const minutes = (time: string) => { const [h, m] = time.split(":").map(Number); return h * 60 + m; };
  const result = new Map<string, { value: string; label: string }>();
  if (config.durationMinutes <= 0) return [];
  const interval = Math.max(5, config.slotIntervalMinutes ?? config.durationMinutes);
  for (const range of hoursForDate(config, date)) {
    for (let m = minutes(range.start); m + config.durationMinutes <= minutes(range.end); m += interval) {
      const value = `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
      const instant = scheduleInstant(date, value, config.timeZone);
      const end = instant + config.durationMinutes * 60000;
      const closing = scheduleInstant(date, range.end, config.timeZone);
      if (!Number.isFinite(instant) || !Number.isFinite(closing) || end > closing || instant < now + (config.minimumNoticeHours ?? 0) * 3600000) continue;
      if (bookingConflicts(instant, end, config.bufferBeforeMinutes ?? 0, config.bufferAfterMinutes ?? 0, active)) continue;
      result.set(value, { value, label: new Intl.DateTimeFormat("en-US", { timeZone: config.timeZone ?? "UTC", hour: "numeric", minute: "2-digit" }).format(instant) });
    }
  }
  return [...result.values()].sort((a, b) => a.value.localeCompare(b.value));
}
