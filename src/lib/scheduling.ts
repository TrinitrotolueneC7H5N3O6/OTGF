import type { QuickBuildConfig } from "./types";

export type SchedulerConfig = Extract<QuickBuildConfig, { type: "scheduler" }>;
export const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

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

export function scheduleDates(config: SchedulerConfig, now = Date.now()) {
  const today = scheduleDate(now, config.timeZone);
  return Array.from({ length: config.daysAhead }, (_, i) => {
    const date = new Date(`${today}T12:00:00Z`);
    date.setUTCDate(date.getUTCDate() + i);
    return { value: date.toISOString().slice(0, 10), label: new Intl.DateTimeFormat("en-US", { timeZone: "UTC", weekday: "short", month: "short", day: "numeric" }).format(date), weekday: date.getUTCDay() };
  }).filter((day) => (config.weekdays ?? [0, 1, 2, 3, 4, 5, 6]).includes(day.weekday));
}

export function scheduleSlots(config: SchedulerConfig, date: string, now = Date.now()) {
  if (!date || !scheduleDates(config, now).some((day) => day.value === date)) return [];
  const minutes = (time: string) => { const [h, m] = time.split(":").map(Number); return h * 60 + m; };
  const result: { value: string; label: string }[] = [];
  if (config.durationMinutes <= 0) return result;
  for (let m = minutes(config.startTime); m + config.durationMinutes <= minutes(config.endTime); m += config.durationMinutes) {
    const value = `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
    const instant = scheduleInstant(date, value, config.timeZone);
    if (!Number.isFinite(instant) || instant < now + (config.minimumNoticeHours ?? 0) * 3600000) continue;
    result.push({ value, label: new Intl.DateTimeFormat("en-US", { timeZone: config.timeZone ?? "UTC", hour: "numeric", minute: "2-digit" }).format(instant) });
  }
  return result;
}
