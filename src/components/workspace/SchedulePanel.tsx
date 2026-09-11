"use client";

import { useMemo, useState } from "react";
import type { ScheduleRequest, ScheduleRequestStatus } from "@/lib/types";
import { bookingStart, bookingTimeZone } from "@/lib/scheduling";
import { scheduleStartMs } from "@/lib/spaceNormalize";

interface SchedulePanelProps {
  slug: string;
  requests: ScheduleRequest[];
  onUpdateStatus: (id: string, status: ScheduleRequestStatus) => void;
}

type ScheduleFilter = "upcoming" | "requested" | "confirmed" | "declined" | "canceled" | "all";
type ScheduleView = "calendar" | "list";

const FILTERS: { id: ScheduleFilter; label: string }[] = [
  { id: "all", label: "All" },
  { id: "confirmed", label: "Confirmed" },
  { id: "upcoming", label: "Upcoming" },
  { id: "requested", label: "Requested" },
  { id: "declined", label: "Declined" },
  { id: "canceled", label: "Canceled" },
];

const WEEKDAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function pad(n: number) {
  return String(n).padStart(2, "0");
}

function localDateKey(date: Date) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function monthCells(year: number, month: number) {
  const first = new Date(year, month, 1);
  const start = new Date(year, month, 1 - first.getDay());
  const todayKey = localDateKey(new Date());
  const all = Array.from({ length: 42 }, (_, i) => {
    const date = new Date(start);
    date.setDate(start.getDate() + i);
    const key = localDateKey(date);
    return {
      key,
      day: date.getDate(),
      inMonth: date.getMonth() === month,
      isToday: key === todayKey,
    };
  });
  return all.slice(35).every((cell) => !cell.inMonth) ? all.slice(0, 35) : all;
}

function startOfToday() {
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  return now.getTime();
}

function formatTime(item: ScheduleRequest) {
  const ms = bookingStart(item);
  if (!Number.isFinite(ms)) return item.time;
  return new Intl.DateTimeFormat(undefined, {
    hour: "numeric",
    minute: "2-digit",
    timeZone: bookingTimeZone(item),
  }).format(new Date(ms));
}

function dayKey(date: string) {
  return date.trim();
}

function dayLabel(date: string, time: string) {
  const ms = scheduleStartMs(date, time);
  const day = Number.isFinite(ms) && ms ? new Date(ms) : new Date(`${date}T00:00:00`);
  if (!Number.isFinite(day.getTime())) return date;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const tomorrow = new Date(today);
  tomorrow.setDate(today.getDate() + 1);
  const stamp = new Date(day);
  stamp.setHours(0, 0, 0, 0);
  if (stamp.getTime() === today.getTime()) return "Today";
  if (stamp.getTime() === tomorrow.getTime()) return "Tomorrow";
  return new Intl.DateTimeFormat(undefined, {
    weekday: "long",
    month: "short",
    day: "numeric",
  }).format(stamp);
}

function statusLabel(status: ScheduleRequestStatus) {
  if (status === "canceled") return "Canceled";
  if (status === "confirmed") return "Confirmed";
  if (status === "declined") return "Declined";
  return "Requested";
}

function AppointmentRow({
  slug,
  item,
  onUpdateStatus,
}: {
  slug: string;
  item: ScheduleRequest;
  onUpdateStatus: (id: string, status: ScheduleRequestStatus) => void;
}) {
  const contact = [item.email, item.phone].filter(Boolean).join(" · ");
  return (
    <li className="schedule-card">
      <div className="schedule-card-who">
        <strong>{item.name}</strong>
        <span>{formatTime(item)} · {item.durationMinutes} min</span>
        {contact ? <span>{contact}</span> : null}
        {item.notes ? <p>{item.notes}</p> : null}
      </div>
      <div className="schedule-card-status">
        <span className={`case-status-pill is-${item.status}`}>
          {statusLabel(item.status)}
        </span>
      </div>
      <div className="schedule-card-actions">
        <a className="btn-ghost" href={`/${slug}/booking/${item.id}`} target="_blank" rel="noreferrer">Manage</a>
        {item.status === "requested" ? (
          <button type="button" className="btn-solid" onClick={() => onUpdateStatus(item.id, "confirmed")}>Confirm</button>
        ) : null}
        {item.status === "requested" ? (
          <button type="button" className="btn-ghost" onClick={() => onUpdateStatus(item.id, "declined")}>Decline</button>
        ) : item.status === "confirmed" ? (
          <button type="button" className="btn-ghost" onClick={() => onUpdateStatus(item.id, "canceled")}>Cancel</button>
        ) : item.status === "declined" ? (
          <button type="button" className="btn-ghost" onClick={() => onUpdateStatus(item.id, "requested")}>Restore</button>
        ) : null}
      </div>
    </li>
  );
}

export function SchedulePanel({
  slug,
  requests,
  onUpdateStatus,
}: SchedulePanelProps) {
  const [filter, setFilter] = useState<ScheduleFilter>("upcoming");
  const [view, setView] = useState<ScheduleView>("calendar");
  const now = new Date();
  const [monthCursor, setMonthCursor] = useState(() => ({ year: now.getFullYear(), month: now.getMonth() }));
  const [selectedDay, setSelectedDay] = useState(() => localDateKey(now));
  const today = startOfToday();

  const counts = useMemo(
    () => ({
      upcoming: requests.filter(
        (item) =>
          item.status !== "declined" && item.status !== "canceled" &&
          bookingStart(item) >= today,
      ).length,
      requested: requests.filter((item) => item.status === "requested").length,
      confirmed: requests.filter((item) => item.status === "confirmed").length,
      declined: requests.filter((item) => item.status === "declined").length,
      all: requests.length,
    }),
    [requests, today],
  );

  const visible = useMemo(() => {
    const filtered = requests.filter((item) => {
      if (filter === "all") return true;
      if (filter === "requested") return item.status === "requested";
      if (filter === "confirmed") return item.status === "confirmed";
      if (filter === "canceled") return item.status === "canceled";
      if (filter === "declined") return item.status === "declined";
      return (
        item.status !== "declined" && item.status !== "canceled" &&
        bookingStart(item) >= today
      );
    });
    return [...filtered].sort(
      (a, b) =>
        bookingStart(a) - bookingStart(b),
    );
  }, [filter, requests, today]);

  const groups = useMemo(() => {
    const byDay = new Map<string, ScheduleRequest[]>();
    for (const item of visible) {
      const key = dayKey(item.date);
      const list = byDay.get(key) ?? [];
      list.push(item);
      byDay.set(key, list);
    }
    return [...byDay.entries()].map(([, items]) => ({
      label: dayLabel(items[0].date, items[0].time),
      items,
    }));
  }, [visible]);

  const cells = useMemo(() => monthCells(monthCursor.year, monthCursor.month), [monthCursor]);
  const byDate = useMemo(() => {
    const map = new Map<string, ScheduleRequest[]>();
    for (const item of visible) {
      const key = dayKey(item.date);
      const list = map.get(key) ?? [];
      list.push(item);
      map.set(key, list);
    }
    return map;
  }, [visible]);
  const selectedItems = byDate.get(selectedDay) ?? [];
  const monthLabel = new Intl.DateTimeFormat(undefined, { month: "long", year: "numeric" }).format(
    new Date(monthCursor.year, monthCursor.month, 1),
  );

  function shiftMonth(delta: number) {
    setMonthCursor((current) => {
      const next = new Date(current.year, current.month + delta, 1);
      return { year: next.getFullYear(), month: next.getMonth() };
    });
  }

  return (
    <div className="dashboard-panel-body schedule-panel">
      <header className="schedule-chrome">
        <div className="schedule-chrome-title">
          <h2 className="dashboard-panel-title">Appointments</h2>
          <p>{counts.upcoming} upcoming · {counts.requested} requested · {counts.confirmed} confirmed</p>
        </div>
        {view === "calendar" ? (
          <div className="schedule-month-head">
            <button type="button" className="btn-ghost" onClick={() => shiftMonth(-1)} aria-label="Previous month">‹</button>
            <h3>{monthLabel}</h3>
            <button type="button" className="btn-ghost" onClick={() => shiftMonth(1)} aria-label="Next month">›</button>
          </div>
        ) : null}
        <div className="schedule-toolbar">
          <div className="insights-range schedule-filters" role="tablist" aria-label="Filter schedule">
            {FILTERS.map((item) => (
              <button
                key={item.id}
                type="button"
                role="tab"
                className={filter === item.id ? "is-on" : undefined}
                aria-selected={filter === item.id}
                onClick={() => setFilter(item.id)}
              >
                {item.label}
              </button>
            ))}
          </div>
          <div className="insights-range schedule-view-toggle" role="tablist" aria-label="Schedule view">
            <button type="button" role="tab" className={view === "calendar" ? "is-on" : undefined} aria-selected={view === "calendar"} onClick={() => setView("calendar")}>Calendar</button>
            <button type="button" role="tab" className={view === "list" ? "is-on" : undefined} aria-selected={view === "list"} onClick={() => setView("list")}>List</button>
          </div>
        </div>
      </header>

      {view === "calendar" ? (
        <div className="schedule-calendar-split">
          <section className="schedule-month" aria-label={monthLabel}>
            <div className="schedule-month-grid">
              {WEEKDAY_LABELS.map((label) => <span key={label} className="schedule-month-weekday">{label}</span>)}
              {cells.map((cell) => {
                const items = byDate.get(cell.key) ?? [];
                const extra = Math.max(0, items.length - 2);
                return (
                  <button
                    key={cell.key}
                    type="button"
                    className={`schedule-month-day${cell.inMonth ? "" : " is-outside"}${cell.isToday ? " is-today" : ""}${selectedDay === cell.key ? " is-selected" : ""}`}
                    onClick={() => setSelectedDay(cell.key)}
                  >
                    <span className="schedule-month-date">{cell.day}</span>
                    <span className="schedule-month-events">
                      {items.slice(0, 2).map((item) => (
                        <em key={item.id} className={`is-${item.status}`}>
                          {formatTime(item)} {item.name}
                        </em>
                      ))}
                      {extra ? <em className="is-more">+{extra} more</em> : null}
                    </span>
                  </button>
                );
              })}
            </div>
          </section>
          <aside className="schedule-day-pane" aria-label="Day details">
            <h3>{selectedItems.length ? dayLabel(selectedItems[0].date, selectedItems[0].time) : dayLabel(selectedDay, "12:00")}</h3>
            {selectedItems.length ? (
              <ul>
                {selectedItems.map((item) => (
                  <AppointmentRow key={item.id} slug={slug} item={item} onUpdateStatus={onUpdateStatus} />
                ))}
              </ul>
            ) : (
              <p className="dashboard-empty">No appointments on this day.</p>
            )}
          </aside>
        </div>
      ) : visible.length === 0 ? (
        <p className="dashboard-empty">
          {requests.length === 0
            ? "When someone books through your scheduler, the request shows up here."
            : "Nothing in this view."}
        </p>
      ) : (
        <div className="schedule-groups">
          {groups.map((group) => (
            <section key={group.label} className="schedule-day">
              <h3>{group.label}</h3>
              <ul>
                {group.items.map((item) => (
                  <AppointmentRow key={item.id} slug={slug} item={item} onUpdateStatus={onUpdateStatus} />
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
