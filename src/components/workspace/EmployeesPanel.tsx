"use client";

import { useMemo, useState, type FormEvent } from "react";
import type { FloorMember } from "@/lib/types";
import { IconTrash } from "@/components/shared/Icons";

interface EmployeesPanelProps {
  members: FloorMember[];
  onChangeMembers: (members: FloorMember[]) => void;
}

function newMemberId() {
  return `mem-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
}

export function EmployeesPanel({
  members,
  onChangeMembers,
}: EmployeesPanelProps) {
  const [query, setQuery] = useState("");
  const [draft, setDraft] = useState("");
  const [error, setError] = useState<string | null>(null);

  const matches = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const sorted = [...members].sort((a, b) =>
      (a.name || "").localeCompare(b.name || "", undefined, {
        sensitivity: "base",
      }),
    );
    if (!needle) return sorted;
    return sorted.filter((member) =>
      (member.name || "").toLowerCase().includes(needle),
    );
  }, [members, query]);

  function addMember(e?: FormEvent) {
    e?.preventDefault();
    const name = draft.trim();
    if (!name) {
      setError("Add a name.");
      return;
    }
    const existing = members.find(
      (member) => member.name.trim().toLowerCase() === name.toLowerCase(),
    );
    if (existing) {
      setError("That employee is already on the list.");
      setQuery(existing.name);
      setDraft("");
      return;
    }
    onChangeMembers([...members, { id: newMemberId(), name }]);
    setDraft("");
    setError(null);
  }

  function updateMemberName(id: string, name: string) {
    onChangeMembers(
      members.map((member) => (member.id === id ? { ...member, name } : member)),
    );
  }

  function removeMember(id: string) {
    onChangeMembers(members.filter((member) => member.id !== id));
  }

  return (
    <div className="dashboard-panel-body employees-panel">
      <h2 className="dashboard-panel-title">Employees</h2>
      <p className="floor-settings-help">
        People who can own chats on the floor. Search the list, add someone new,
        or remove anyone who should no longer appear.
      </p>

      <label className="employees-search">
        <span className="sr-only">Search employees</span>
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search employees…"
          autoComplete="off"
        />
      </label>

      <form className="employees-add" onSubmit={addMember}>
        <label className="employees-add-field">
          <span className="sr-only">New employee name</span>
          <input
            value={draft}
            onChange={(e) => {
              setDraft(e.target.value);
              if (error) setError(null);
            }}
            placeholder="Add an employee…"
            autoComplete="off"
          />
        </label>
        <button type="submit" className="btn-solid">
          Add
        </button>
      </form>
      {error ? (
        <p className="employees-error" role="alert">
          {error}
        </p>
      ) : null}

      {members.length === 0 ? (
        <p className="dashboard-empty">No employees yet. Add the first person.</p>
      ) : matches.length === 0 ? (
        <p className="dashboard-empty">No employees match “{query.trim()}”.</p>
      ) : (
        <ul className="floor-member-list employees-list">
          {matches.map((member) => (
            <li key={member.id} className="floor-member-item">
              <input
                className="floor-member-name"
                value={member.name ?? ""}
                onChange={(e) => updateMemberName(member.id, e.target.value)}
                aria-label="Employee name"
              />
              <button
                type="button"
                className="floor-banner-remove icon-btn"
                onClick={() => removeMember(member.id)}
                aria-label={`Remove ${member.name || "employee"}`}
                title="Remove"
              >
                <IconTrash size={13} />
              </button>
            </li>
          ))}
        </ul>
      )}
      {members.length > 0 ? (
        <p className="employees-count">
          {query.trim()
            ? `${matches.length} of ${members.length}`
            : `${members.length} ${members.length === 1 ? "employee" : "employees"}`}
        </p>
      ) : null}
    </div>
  );
}
