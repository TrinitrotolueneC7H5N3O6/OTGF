"use client";

import { useMemo, useState } from "react";
import type { ScheduleRequest, ScheduleRequestStatus } from "@/lib/types";
import { scheduleStartMs } from "@/lib/spaceNormalize";

interface SchedulePanelProps {
  requests: ScheduleRequest[];
  onUpdateStatus: (id: string, status: ScheduleRequestStatus) => void;
}

type ScheduleFilter = "upcoming" | "requested" | "confirmed" | "declined" | "all";

const FILTERS: { id: ScheduleFilter; label: string }[] = [
  { id: "all", label: "All" },
  { id: "confirmed", label: "Confirmed" },
  { id: "upcoming", label: "Upcoming" },
  { id: "requested", label: "Requested" },
  { id: "declined", label: "Declined" },
];

function startOfToday() {
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  return now.getTime();
}

function formatTime(date: string, time: string) {
  const ms = scheduleStartMs(date, time);
  if (!ms) return time;
  return new Intl.DateTimeFormat(undefined, {
    hour: "numeric",
    minute: "2-digit",
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
  if (status === "confirmed") return "Confirmed";
  if (status === "declined") return "Declined";
  return "Requested";
}

export function SchedulePanel({
  requests,
  onUpdateStatus,
}: SchedulePanelProps) {
  const [filter, setFilter] = useState<ScheduleFilter>("upcoming");
  const today = startOfToday();

  const counts = useMemo(
    () => ({
      upcoming: requests.filter(
        (item) =>
          item.status !== "declined" &&
          scheduleStartMs(item.date, item.time) >= today,
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
      if (filter === "declined") return item.status === "declined";
      return (
        item.status !== "declined" &&
        scheduleStartMs(item.date, item.time) >= today
      );
    });
    return [...filtered].sort(
      (a, b) =>
        scheduleStartMs(a.date, a.time) - scheduleStartMs(b.date, b.time),
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

  return (
    <div className="dashboard-panel-body schedule-panel">
      <header className="cases-page-head">
        <div>
          <p className="dashboard-kicker">Schedule</p>
          <h2 className="dashboard-panel-title">Appointments</h2>
          <p className="floor-settings-help">
            Times people pick on your scheduler show up here — not in Live Chat.
          </p>
        </div>
      </header>

      <section className="dashboard-stats schedule-stats" aria-label="Schedule overview">
        <div className="dashboard-stat">
          <span className="dashboard-stat-label">Upcoming</span>
          <strong>{counts.upcoming}</strong>
        </div>
        <div className="dashboard-stat">
          <span className="dashboard-stat-label">Requested</span>
          <strong>{counts.requested}</strong>
        </div>
        <div className="dashboard-stat">
          <span className="dashboard-stat-label">Confirmed</span>
          <strong>{counts.confirmed}</strong>
        </div>
      </section>

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

      {visible.length === 0 ? (
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
                {group.items.map((item) => {
                  const contact = [item.email, item.phone].filter(Boolean).join(" · ");
                  return (
                    <li key={item.id} className="schedule-card">
                      <div className="schedule-card-when">
                        <strong>{formatTime(item.date, item.time)}</strong>
                        <span>{item.durationMinutes} min</span>
                      </div>
                      <div className="schedule-card-who">
                        <strong>{item.name}</strong>
                        <span>{contact || "No contact details"}</span>
                        {item.notes ? <p>{item.notes}</p> : null}
                      </div>
                      <div className="schedule-card-status">
                        <span className={`case-status-pill is-${item.status}`}>
                          {statusLabel(item.status)}
                        </span>
                      </div>
                      <div className="schedule-card-actions">
                        {item.status !== "confirmed" ? (
                          <button
                            type="button"
                            className="btn-solid"
                            onClick={() => onUpdateStatus(item.id, "confirmed")}
                          >
                            Confirm
                          </button>
                        ) : null}
                        {item.status !== "declined" ? (
                          <button
                            type="button"
                            className="btn-ghost"
                            onClick={() => onUpdateStatus(item.id, "declined")}
                          >
                            Decline
                          </button>
                        ) : (
                          <button
                            type="button"
                            className="btn-ghost"
                            onClick={() => onUpdateStatus(item.id, "requested")}
                          >
                            Restore
                          </button>
                        )}
                      </div>
                    </li>
                  );
                })}
              </ul>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
