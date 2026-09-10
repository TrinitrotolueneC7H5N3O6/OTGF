"use client";

import { useMemo, useState } from "react";
import type { FormSubmission, FormSubmissionStatus } from "@/lib/types";

interface FormsPanelProps {
  submissions: FormSubmission[];
  onUpdateStatus: (id: string, status: FormSubmissionStatus) => void;
}

type FormsFilter = "new" | "read" | "all";

const FILTERS: { id: FormsFilter; label: string }[] = [
  { id: "new", label: "New" },
  { id: "read", label: "Read" },
  { id: "all", label: "All" },
];

function contactLine(item: FormSubmission) {
  return [item.email, item.phone].filter(Boolean).join(" · ");
}

function submittedLabel(iso: string) {
  const ms = Date.parse(iso);
  if (!Number.isFinite(ms)) return iso;
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(ms));
}

export function FormsPanel({
  submissions,
  onUpdateStatus,
}: FormsPanelProps) {
  const [filter, setFilter] = useState<FormsFilter>("new");
  const counts = useMemo(
    () => ({
      new: submissions.filter((item) => item.status === "new").length,
      read: submissions.filter((item) => item.status === "read").length,
      all: submissions.length,
    }),
    [submissions],
  );
  const visible = useMemo(
    () =>
      submissions.filter((item) =>
        filter === "all" ? true : item.status === filter,
      ),
    [filter, submissions],
  );

  return (
    <div className="dashboard-panel-body schedule-panel forms-panel">
      <header className="cases-page-head">
        <div>
          <p className="dashboard-kicker">Forms</p>
          <h2 className="dashboard-panel-title">Submissions</h2>
          <p className="floor-settings-help">
            What people send from your forms.
          </p>
        </div>
      </header>

      <section className="dashboard-stats schedule-stats" aria-label="Forms overview">
        <div className="dashboard-stat">
          <span className="dashboard-stat-label">New</span>
          <strong>{counts.new}</strong>
        </div>
        <div className="dashboard-stat">
          <span className="dashboard-stat-label">Read</span>
          <strong>{counts.read}</strong>
        </div>
        <div className="dashboard-stat">
          <span className="dashboard-stat-label">All</span>
          <strong>{counts.all}</strong>
        </div>
      </section>

      <div className="insights-range schedule-filters" role="tablist" aria-label="Filter forms">
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
        <p className="dashboard-empty">No submissions in this view yet.</p>
      ) : (
        <ul className="schedule-day-list">
          {visible.map((item) => {
            const contact = contactLine(item);
            return (
              <li key={item.id} className="schedule-card">
                <div className="schedule-card-who">
                  <strong>{item.name}</strong>
                  <span>
                    {item.title}
                    {contact ? ` · ${contact}` : ""}
                    {` · ${submittedLabel(item.createdAt)}`}
                  </span>
                  {item.fields.length ? (
                    <dl className="form-submission-fields">
                      {item.fields.map((field) => (
                        <div key={`${item.id}-${field.label}`}>
                          <dt>{field.label}</dt>
                          <dd>{field.value || "—"}</dd>
                        </div>
                      ))}
                    </dl>
                  ) : null}
                </div>
                <div className="schedule-card-status">
                  <span className={`case-status-pill is-${item.status}`}>
                    {item.status === "read" ? "Read" : "New"}
                  </span>
                </div>
                <div className="schedule-card-actions">
                  {item.status === "new" ? (
                    <button
                      type="button"
                      className="btn-solid"
                      onClick={() => onUpdateStatus(item.id, "read")}
                    >
                      Mark read
                    </button>
                  ) : (
                    <button
                      type="button"
                      className="btn-ghost"
                      onClick={() => onUpdateStatus(item.id, "new")}
                    >
                      Mark new
                    </button>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
