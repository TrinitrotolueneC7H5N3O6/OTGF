"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { scheduleDate, scheduleDates, scheduleSlots, type SchedulerConfig } from "@/lib/scheduling";

export function BookingCalendar({ config, date, time, onDate, onTime }: {
  config: SchedulerConfig;
  date: string;
  time: string;
  onDate: (date: string) => void;
  onTime: (time: string) => void;
}) {
  const pickerRef = useRef<HTMLElement>(null);
  const timesRef = useRef<HTMLDivElement>(null);
  const [now, setNow] = useState(() => Date.now());
  const [month, setMonth] = useState(() => (date || scheduleDate(now, config.timeZone)).slice(0, 7));
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 60_000);
    return () => window.clearInterval(timer);
  }, []);
  const today = scheduleDate(now, config.timeZone);
  const firstMonth = today.slice(0, 7);
  const lastDay = new Date(`${today}T12:00:00Z`);
  lastDay.setUTCDate(lastDay.getUTCDate() + config.daysAhead - 1);
  const lastMonth = lastDay.toISOString().slice(0, 7);
  const shownMonth = month < firstMonth ? firstMonth : month > lastMonth ? lastMonth : month;
  const monthDate = new Date(`${shownMonth}-01T12:00:00Z`);
  const monthLabel = new Intl.DateTimeFormat("en-US", { month: "long", year: "numeric", timeZone: "UTC" }).format(monthDate);
  const daysInMonth = new Date(Date.UTC(monthDate.getUTCFullYear(), monthDate.getUTCMonth() + 1, 0)).getUTCDate();
  const available = useMemo(() => new Map(scheduleDates(config, now)
    .filter((day) => day.value.startsWith(shownMonth))
    .map((day) => [day.value, scheduleSlots(config, day.value, now)])), [config, now, shownMonth]);
  const slots = date ? scheduleSlots(config, date, now) : [];
  const dateLabel = date ? new Intl.DateTimeFormat("en-US", { weekday: "long", month: "long", day: "numeric", timeZone: "UTC" }).format(new Date(`${date}T12:00:00Z`)) : "Choose a date";

  function moveMonth(delta: number) {
    const next = new Date(monthDate);
    next.setUTCMonth(next.getUTCMonth() + delta);
    setMonth(next.toISOString().slice(0, 7));
  }

  function selectDate(value: string) {
    onDate(value);
    if ((pickerRef.current?.clientWidth ?? 0) <= 480) {
      window.requestAnimationFrame(() => timesRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" }));
    }
  }

  return <section ref={pickerRef} className="booking-picker" aria-label="Choose a date and time">
    <h3>Select a date &amp; time</h3>
    <div className="booking-picker-layout">
      <div className="booking-month">
        <div className="booking-month-header">
          <strong aria-live="polite">{monthLabel}</strong>
          <div>
            <button type="button" aria-label="Previous month" disabled={shownMonth <= firstMonth} onClick={() => moveMonth(-1)}>‹</button>
            <button type="button" aria-label="Next month" disabled={shownMonth >= lastMonth} onClick={() => moveMonth(1)}>›</button>
          </div>
        </div>
        <div className="booking-calendar-days" role="group" aria-label={monthLabel}>
          {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((day) => <span className="booking-weekday" key={day}>{day}</span>)}
          {Array.from({ length: monthDate.getUTCDay() }, (_, i) => <span aria-hidden key={`blank-${i}`} />)}
          {Array.from({ length: daysInMonth }, (_, i) => {
            const value = `${shownMonth}-${String(i + 1).padStart(2, "0")}`;
            const open = Boolean(available.get(value)?.length);
            return <button type="button" key={value} disabled={!open} aria-pressed={date === value} aria-current={value === today ? "date" : undefined} aria-label={`${new Intl.DateTimeFormat("en-US", { month: "long", day: "numeric", year: "numeric", timeZone: "UTC" }).format(new Date(`${value}T12:00:00Z`))}${open ? "" : ", unavailable"}`} onClick={() => selectDate(value)}>{i + 1}</button>;
          })}
        </div>
        <p className="booking-timezone">Time zone: <strong>{config.timeZone ?? "UTC"}</strong></p>
        {!Array.from(available.values()).some((times) => times.length) ? <p className="booking-empty" role="status">No available times this month.{shownMonth < lastMonth ? " Try the next month." : " Please check back later."}</p> : null}
      </div>
      <div ref={timesRef} className="booking-times" aria-label="Available times">
        <h4 aria-live="polite">{dateLabel}</h4>
        {!date ? <p className="booking-empty">Select a highlighted day to see available times.</p> : !slots.length ? <p className="booking-empty" role="status">No times left on this day. Choose another date.</p> : <>
          <p className="booking-duration">{config.durationMinutes} minute meeting</p>
          <div className="booking-time-grid">{slots.map((slot) => <button type="button" key={slot.value} aria-pressed={time === slot.value} onClick={() => onTime(slot.value)}>{slot.label}</button>)}</div>
        </>}
      </div>
    </div>
  </section>;
}
