"use client";

import { useEffect, useMemo, useState } from "react";
import type { FormSubmission, FormSubmissionStatus } from "@/lib/types";

interface FormsPanelProps {
  submissions: FormSubmission[];
  onUpdateStatus: (id: string, status: FormSubmissionStatus) => void;
}

type FormsFilter = "new" | "read" | "all";

const FILTERS: { id: FormsFilter; label: string }[] = [
  { id: "all", label: "All" },
  { id: "new", label: "New" },
  { id: "read", label: "Read" },
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

function submittedFull(iso: string) {
  const ms = Date.parse(iso);
  if (!Number.isFinite(ms)) return iso;
  return new Intl.DateTimeFormat(undefined, {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(ms));
}

function fieldValue(item: FormSubmission, label: string) {
  return item.fields.find((field) => field.label === label)?.value?.trim() ?? "";
}

function previewText(value: string) {
  const compact = value.replace(/\s+/g, " ").trim();
  if (compact.length <= 48) return compact;
  return `${compact.slice(0, 47)}…`;
}

export function FormsPanel({
  submissions,
  onUpdateStatus,
}: FormsPanelProps) {
  const [filter, setFilter] = useState<FormsFilter>("all");
  const [formFilter, setFormFilter] = useState("all");
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const counts = useMemo(
    () => ({
      new: submissions.filter((item) => item.status === "new").length,
      read: submissions.filter((item) => item.status === "read").length,
      all: submissions.length,
    }),
    [submissions],
  );

  const formNames = useMemo(() => {
    const names = [...new Set(submissions.map((item) => item.title).filter(Boolean))];
    names.sort((a, b) => a.localeCompare(b));
    return names;
  }, [submissions]);

  const visible = useMemo(() => {
    const filtered = submissions.filter((item) => {
      if (filter !== "all" && item.status !== filter) return false;
      if (formFilter !== "all" && item.title !== formFilter) return false;
      return true;
    });
    return [...filtered].sort(
      (a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt),
    );
  }, [filter, formFilter, submissions]);

  const columns = useMemo(() => {
    const skip = new Set(["name", "email", "phone"]);
    const labels: string[] = [];
    for (const item of visible) {
      for (const field of item.fields) {
        const key = field.label.trim().toLowerCase();
        if (!field.label || skip.has(key) || labels.includes(field.label)) continue;
        labels.push(field.label);
      }
    }
    return labels;
  }, [visible]);

  useEffect(() => {
    if (selectedId && visible.some((item) => item.id === selectedId)) return;
    setSelectedId(visible[0]?.id ?? null);
  }, [selectedId, visible]);

  const selected = visible.find((item) => item.id === selectedId) ?? null;

  return (
    <div className="dashboard-panel-body schedule-panel forms-panel">
      <header className="schedule-chrome">
        <div className="schedule-chrome-title">
          <h2 className="dashboard-panel-title">Submissions</h2>
          <p>{counts.new} new · {counts.read} read · {counts.all} total</p>
        </div>
        <div className="schedule-toolbar">
          {formNames.length > 1 ? (
            <label className="forms-form-filter">
              <span className="sr-only">Form</span>
              <select
                value={formFilter}
                onChange={(event) => setFormFilter(event.target.value)}
              >
                <option value="all">All forms</option>
                {formNames.map((name) => (
                  <option key={name} value={name}>{name}</option>
                ))}
              </select>
            </label>
          ) : null}
          <div className="insights-range schedule-filters" role="tablist" aria-label="Filter submissions">
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
        </div>
      </header>

      {visible.length === 0 ? (
        <p className="dashboard-empty">
          {submissions.length === 0
            ? "When someone submits a form, it shows up here."
            : "Nothing in this view."}
        </p>
      ) : (
        <div className="forms-results">
          <div className="forms-table-wrap">
            <table className="forms-table">
              <thead>
                <tr>
                  <th>Submitted</th>
                  <th>Name</th>
                  {formNames.length > 1 ? <th>Form</th> : null}
                  {columns.map((label) => (
                    <th key={label}>{label}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {visible.map((item) => (
                  <tr
                    key={item.id}
                    className={`${item.status === "new" ? "is-new" : ""}${selectedId === item.id ? " is-selected" : ""}`}
                    onClick={() => setSelectedId(item.id)}
                  >
                    <td>{submittedLabel(item.createdAt)}</td>
                    <td>
                      <strong>{item.name || "—"}</strong>
                      {item.status === "new" ? <span className="forms-new-dot" aria-label="New" /> : null}
                      {item.email ? <div className="forms-table-sub">{item.email}</div> : null}
                    </td>
                    {formNames.length > 1 ? <td>{item.title}</td> : null}
                    {columns.map((label) => (
                      <td key={`${item.id}-${label}`}>{previewText(fieldValue(item, label)) || "—"}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <aside className="forms-detail" aria-label="Submission">
            {selected ? (
              <>
                <header className="forms-detail-head">
                  <div>
                    <p className="forms-detail-kicker">{selected.title || "Form"}</p>
                    <h3>{selected.name || "Untitled response"}</h3>
                    <p>{submittedFull(selected.createdAt)}</p>
                    {contactLine(selected) ? <p>{contactLine(selected)}</p> : null}
                  </div>
                  <div className="forms-detail-actions">
                    <span className={`case-status-pill is-${selected.status}`}>
                      {selected.status === "read" ? "Read" : "New"}
                    </span>
                    {selected.status === "new" ? (
                      <button type="button" className="btn-solid" onClick={() => onUpdateStatus(selected.id, "read")}>
                        Mark read
                      </button>
                    ) : (
                      <button type="button" className="btn-ghost" onClick={() => onUpdateStatus(selected.id, "new")}>
                        Mark new
                      </button>
                    )}
                  </div>
                </header>
                <dl className="forms-detail-fields">
                  {selected.fields.length ? selected.fields.map((field, index) => (
                    <div key={`${selected.id}-${field.label}-${index}`}>
                      <dt>{field.label}</dt>
                      <dd>{field.value.trim() || "—"}</dd>
                    </div>
                  )) : (
                    <p className="dashboard-empty">No answers in this submission.</p>
                  )}
                </dl>
              </>
            ) : (
              <p className="dashboard-empty">Select a row to read the answers.</p>
            )}
          </aside>
        </div>
      )}
    </div>
  );
}
