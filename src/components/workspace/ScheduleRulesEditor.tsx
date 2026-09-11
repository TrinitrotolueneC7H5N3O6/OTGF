"use client";
import { useState } from "react";
import { WEEKDAYS, type HoursRange, type SchedulerConfig } from "@/lib/scheduling";

function Ranges({
  label,
  ranges,
  onChange,
}: {
  label: string;
  ranges: HoursRange[];
  onChange: (ranges: HoursRange[]) => void;
}) {
  const open = ranges.length > 0;
  return (
    <div className={`schedule-hours-row${open ? "" : " is-closed"}`}>
      <button
        type="button"
        className="schedule-hours-switch"
        role="switch"
        aria-checked={open}
        aria-label={`${label} ${open ? "available" : "unavailable"}`}
        onClick={() => onChange(open ? [] : [{ start: "09:00", end: "17:00" }])}
      >
        <span aria-hidden className={`components-switch${open ? " is-on" : ""}`} />
      </button>
      <strong>{label}</strong>
      <div className="schedule-hours-ranges">
        {open ? (
          ranges.map((range, index) => (
            <div className="schedule-hours-range" key={index}>
              <input
                type="time"
                aria-label={`${label} start ${index + 1}`}
                value={range.start}
                onChange={(e) => onChange(ranges.map((r, i) => (i === index ? { ...r, start: e.target.value } : r)))}
              />
              <span>to</span>
              <input
                type="time"
                aria-label={`${label} end ${index + 1}`}
                value={range.end}
                onChange={(e) => onChange(ranges.map((r, i) => (i === index ? { ...r, end: e.target.value } : r)))}
              />
              {ranges.length > 1 ? (
                <button type="button" className="btn-ghost" aria-label={`Remove ${label} range ${index + 1}`} onClick={() => onChange(ranges.filter((_, i) => i !== index))}>
                  Remove
                </button>
              ) : null}
              {range.start >= range.end && <span className="editor-error">End must be after start.</span>}
            </div>
          ))
        ) : (
          <span className="schedule-hours-closed">Unavailable</span>
        )}
        {open ? (
          <button type="button" className="btn-ghost schedule-hours-add" disabled={ranges.length >= 12} onClick={() => onChange([...ranges, { start: "09:00", end: "17:00" }])}>
            + Add hours
          </button>
        ) : null}
      </div>
    </div>
  );
}

export function ScheduleRulesEditor({ config, patch }: { config: SchedulerConfig; patch: (next: Partial<SchedulerConfig>) => void }) {
  const [overrideDate, setOverrideDate] = useState("");
  const overrides = Object.entries(config.dateOverrides ?? {}).sort(([a], [b]) => a.localeCompare(b));
  return (
    <>
      <section className="settings-editor-card">
        <div className="schedule-card-head">
          <h3>Weekly hours</h3>
        </div>
        <div className="schedule-hours-table">
          {WEEKDAYS.map((day, index) => (
            <Ranges
              key={day}
              label={day}
              ranges={config.weeklyHours?.[index] ?? ((config.weekdays ?? [0, 1, 2, 3, 4, 5, 6]).includes(index) ? [{ start: config.startTime, end: config.endTime }] : [])}
              onChange={(ranges) => patch({ weeklyHours: { ...config.weeklyHours, [index]: ranges } })}
            />
          ))}
        </div>
      </section>
      <section className="settings-editor-card">
        <div className="schedule-card-head">
          <h3>Date overrides</h3>
        </div>
        {overrides.length ? (
          <div className="schedule-hours-table">
            {overrides.map(([date, ranges]) => (
              <div key={date} className="schedule-override">
                <Ranges label={date} ranges={ranges} onChange={(next) => patch({ dateOverrides: { ...config.dateOverrides, [date]: next } })} />
                <button
                  type="button"
                  className="btn-ghost"
                  onClick={() => {
                    const next = { ...config.dateOverrides };
                    delete next[date];
                    patch({ dateOverrides: next });
                  }}
                >
                  Use weekly hours
                </button>
              </div>
            ))}
          </div>
        ) : (
          <p className="schedule-empty-note">No overrides yet.</p>
        )}
        <div className="schedule-override-add">
          <input type="date" aria-label="Override date" value={overrideDate} onChange={(e) => setOverrideDate(e.target.value)} />
          <button
            type="button"
            className="btn-ghost"
            disabled={!overrideDate}
            onClick={() => {
              patch({ dateOverrides: { ...config.dateOverrides, [overrideDate]: [] } });
              setOverrideDate("");
            }}
          >
            Add date
          </button>
        </div>
      </section>
      <section className="settings-editor-card">
        <div className="schedule-card-head">
          <h3>Booking rules</h3>
        </div>
        <div className="quick-build-customer-grid">
          <label className="floor-settings-note">
            <span>Start times every</span>
            <select value={config.slotIntervalMinutes ?? config.durationMinutes} onChange={(e) => patch({ slotIntervalMinutes: Number(e.target.value) })}>
              {[...new Set([5, 10, 15, 20, 30, 45, 60, 90, config.slotIntervalMinutes ?? config.durationMinutes])]
                .sort((a, b) => a - b)
                .map((n) => (
                  <option key={n} value={n}>
                    {n} minutes
                  </option>
                ))}
            </select>
          </label>
          {([["bufferBeforeMinutes", "Buffer before"], ["bufferAfterMinutes", "Buffer after"], ["dailyLimit", "Daily booking limit"]] as const).map(([key, label]) => (
            <label className="floor-settings-note" key={key}>
              <span>
                {label}
                {key === "dailyLimit" ? " (0 = unlimited)" : " (minutes)"}
              </span>
              <input
                type="number"
                min={0}
                max={key === "dailyLimit" ? 100 : 240}
                value={config[key] ?? 0}
                onChange={(e) => patch({ [key]: Math.min(key === "dailyLimit" ? 100 : 240, Math.max(0, Number(e.target.value))) })}
              />
            </label>
          ))}
        </div>
      </section>
    </>
  );
}
