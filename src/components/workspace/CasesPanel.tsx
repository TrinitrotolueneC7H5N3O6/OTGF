"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type {
  Client,
  CollectedContact,
  CustomerCase,
  CustomerCaseIdentifier,
  CustomerCaseStatus,
} from "@/lib/types";

interface CasesPanelProps {
  slug: string;
  cases: CustomerCase[];
  clients: Client[];
  contacts?: CollectedContact[];
  section?: "cases" | "contacts";
  onCreateCase: (customerCase: CustomerCase) => void;
  onUpdateStatus: (caseId: string, status: CustomerCaseStatus) => void;
  onUpdateNotes: (caseId: string, notes: string) => void;
  onUpdateIdentifiers: (
    caseId: string,
    identifiers: CustomerCaseIdentifier[],
  ) => void;
  onAssignChat: (clientId: string, caseId: string | null) => void;
  onHideChat: (clientId: string, hidden: boolean) => void;
}

const CASE_STATUSES: { value: CustomerCaseStatus; label: string }[] = [
  { value: "open", label: "Open" },
  { value: "in_progress", label: "In progress" },
  { value: "resolved", label: "Resolved" },
];

function newCaseId() {
  const suffix = Math.random().toString(36).slice(2, 7).toUpperCase();
  return `CASE-${suffix}`;
}

function statusLabel(value: CustomerCaseStatus) {
  return CASE_STATUSES.find((status) => status.value === value)?.label ?? "Open";
}

function csvCell(value: string) {
  return `"${value.replace(/"/g, '""')}"`;
}

function downloadBlob(filename: string, type: string, content: BlobPart) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

function pdfEscape(value: string) {
  return value.replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");
}

function buildContactsPdf(lines: string[]) {
  const content = [
    "BT",
    "/F1 16 Tf",
    "50 760 Td",
    "(Collected Contacts) Tj",
    "/F1 10 Tf",
    ...lines.flatMap((line) => ["0 -18 Td", `(${pdfEscape(line)}) Tj`]),
    "ET",
  ].join("\n");
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    `<< /Length ${content.length} >>\nstream\n${content}\nendstream`,
  ];
  let pdf = "%PDF-1.4\n";
  const offsets = [0];
  for (const [index, object] of objects.entries()) {
    offsets.push(pdf.length);
    pdf += `${index + 1} 0 obj\n${object}\nendobj\n`;
  }
  const xref = pdf.length;
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (let index = 1; index < offsets.length; index++) {
    pdf += `${offsets[index].toString().padStart(10, "0")} 00000 n \n`;
  }
  pdf += `trailer << /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return pdf;
}

export function CasesPanel({
  cases,
  clients,
  contacts = [],
  section = "cases",
  onCreateCase,
}: CasesPanelProps) {
  const [caseId, setCaseId] = useState(newCaseId);
  const [notes, setNotes] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [lookupQuery, setLookupQuery] = useState("");
  const [lookupCaseId, setLookupCaseId] = useState("");
  const [lookupOpen, setLookupOpen] = useState(false);
  const lookupRef = useRef<HTMLDivElement>(null);

  const caseCounts = useMemo(
    () => ({
      total: cases.length,
      open: cases.filter((item) => item.status === "open").length,
      inProgress: cases.filter((item) => item.status === "in_progress").length,
      resolved: cases.filter((item) => item.status === "resolved").length,
    }),
    [cases],
  );
  const lookupMatches = useMemo(() => {
    const query = lookupQuery.trim().toLowerCase();
    const sorted = [...cases].sort((a, b) => a.id.localeCompare(b.id));
    if (!query) return sorted;
    return sorted.filter(
      (item) =>
        item.id.toLowerCase().includes(query) ||
        item.notes.toLowerCase().includes(query),
    );
  }, [cases, lookupQuery]);
  const lookupCase = cases.find((item) => item.id === lookupCaseId);

  useEffect(() => {
    function onPointerDown(event: PointerEvent) {
      if (!lookupRef.current?.contains(event.target as Node)) {
        setLookupOpen(false);
      }
    }
    window.addEventListener("pointerdown", onPointerDown);
    return () => window.removeEventListener("pointerdown", onPointerDown);
  }, []);

  const collectedContacts = useMemo(
    () => {
      const byId = new Map<string, CollectedContact>();
      for (const contact of contacts) {
        byId.set(contact.id, contact);
      }
      for (const client of clients) {
        const contact = client.contactInfo;
        const intake = client.staffOutIntake;
        const captured = contact ?? intake;
        if (!captured) continue;
        const source = contact?.source ?? "staff_out";
        const id = `${source}:${client.id}`;
        if (byId.has(id)) continue;
        byId.set(id, {
          id,
          chatId: client.id,
          chatName: client.name,
          name: contact?.name ?? intake?.name ?? "",
          email: contact?.email ?? intake?.email ?? "",
          phone: contact?.phone ?? intake?.phone ?? "",
          source,
          ...(client.caseId ? { caseId: client.caseId } : {}),
          collectedAt: contact?.collectedAt ?? intake?.collectedAt ?? "",
        });
      }
      return Array.from(byId.values()).sort(
        (a, b) => Date.parse(b.collectedAt) - Date.parse(a.collectedAt),
      );
    },
    [clients, contacts],
  );

  function exportContactsCsv() {
    const header = [
      "Name",
      "Email",
      "Phone",
      "Chat",
      "Case ID",
      "Collected At",
    ];
    const rows = collectedContacts.map((contact) => [
      contact.name,
      contact.email ?? "",
      contact.phone ?? "",
      contact.chatName,
      contact.caseId ?? "",
      contact.collectedAt,
    ]);
    downloadBlob(
      "collected-contacts.csv",
      "text/csv;charset=utf-8",
      [header, ...rows].map((row) => row.map(csvCell).join(",")).join("\n"),
    );
  }

  function exportContactsPdf() {
    const lines = collectedContacts.length
      ? collectedContacts.flatMap((contact) => [
          `${contact.name || "No name"}${contact.caseId ? ` · ${contact.caseId}` : ""}`,
          `Email: ${contact.email || "-"} · Phone: ${contact.phone || "-"} · Chat: ${contact.chatName}`,
          `Collected: ${contact.collectedAt || "-"}`,
          "",
        ])
      : ["No collected contacts yet."];
    downloadBlob(
      "collected-contacts.pdf",
      "application/pdf",
      buildContactsPdf(lines.slice(0, 36)),
    );
  }

  function createCase() {
    const id = caseId.trim().slice(0, 48).toUpperCase();
    if (!id) {
      setError("Enter a case id.");
      return;
    }
    if (cases.some((item) => item.id.toLowerCase() === id.toLowerCase())) {
      setError("That case id already exists.");
      return;
    }
    onCreateCase({
      id,
      status: "open",
      notes: notes.trim().slice(0, 4000),
      identifiers: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
    setCaseId(newCaseId());
    setNotes("");
    setError(null);
  }

  function chooseLookupCase(id: string) {
    setLookupCaseId(id);
    setLookupQuery(id);
    setLookupOpen(false);
  }

  const contactsSection = (
    <section className="dashboard-card collected-contacts-card">
      <div className="case-section-head">
        <div>
          <h3>Collected contacts</h3>
          <p>Name plus email and/or phone submitted from chat end screens.</p>
        </div>
        <span>{collectedContacts.length}</span>
      </div>
      <div className="collected-contacts-actions">
        <button
          type="button"
          className="btn-ghost cases-action"
          onClick={exportContactsCsv}
          disabled={collectedContacts.length === 0}
        >
          Export CSV
        </button>
        <button
          type="button"
          className="btn-ghost cases-action"
          onClick={exportContactsPdf}
          disabled={collectedContacts.length === 0}
        >
          Export PDF
        </button>
      </div>
      {collectedContacts.length === 0 ? (
        <p className="dashboard-empty">No contacts collected yet.</p>
      ) : (
        <div className="collected-contacts-table">
          <div className="collected-contacts-row is-head">
            <span>Name</span>
            <span>Email</span>
            <span>Phone</span>
          </div>
          {collectedContacts.map((contact) => (
            <div key={contact.chatId} className="collected-contacts-row">
              <strong>{contact.name}</strong>
              <span>{contact.email || "-"}</span>
              <span>{contact.phone || "-"}</span>
            </div>
          ))}
        </div>
      )}
    </section>
  );

  if (section === "contacts") {
    return (
      <div className="dashboard-panel-body cases-panel">
        <header className="cases-page-head">
          <div>
            <p className="dashboard-kicker">Cases</p>
            <h2 className="dashboard-panel-title">Collected contacts</h2>
            <p className="floor-settings-help">
              Export names, emails, and phone numbers collected after chats end.
            </p>
          </div>
        </header>
        {contactsSection}
      </div>
    );
  }

  return (
    <div className="dashboard-panel-body cases-panel">
      <header className="cases-page-head">
        <div>
          <p className="dashboard-kicker">Dashboard</p>
          <h2 className="dashboard-panel-title">Cases</h2>
          <p className="floor-settings-help">
            Group related customer chats under a case id, keep notes, and hide
            assigned chats from the live inbox without deleting their history.
          </p>
        </div>
      </header>

      <div className="cases-layout">
        <section className="cases-summary" aria-label="Case summary">
          <div className="dashboard-stat is-open-chats">
            <span className="dashboard-stat-label">Total</span>
            <strong>{caseCounts.total}</strong>
          </div>
          <div className="dashboard-stat is-unread">
            <span className="dashboard-stat-label">Open</span>
            <strong>{caseCounts.open}</strong>
          </div>
          <div className="dashboard-stat is-customers-online">
            <span className="dashboard-stat-label">In progress</span>
            <strong>{caseCounts.inProgress}</strong>
          </div>
          <div className="dashboard-stat is-status">
            <span className="dashboard-stat-label">Resolved</span>
            <strong>{caseCounts.resolved}</strong>
          </div>
        </section>

        <section className="dashboard-card cases-lookup">
        <header className="dashboard-card-head">
          <h2>Find a case</h2>
          <p>Search or pick a case to read its notes.</p>
        </header>
        <div className="cases-lookup-body">
          <div className="cases-lookup-search" ref={lookupRef}>
            <label className="floor-settings-note">
              <span>Search cases</span>
              <input
                value={lookupQuery}
                onChange={(event) => {
                  setLookupQuery(event.target.value);
                  setLookupOpen(true);
                }}
                onFocus={() => setLookupOpen(true)}
                placeholder={
                  cases.length === 0 ? "No cases yet" : "Search or pick a case…"
                }
                disabled={cases.length === 0}
                aria-expanded={lookupOpen}
                aria-controls="cases-lookup-results"
                autoComplete="off"
              />
            </label>
            {lookupOpen && cases.length > 0 ? (
              <ul
                className="cases-lookup-results"
                id="cases-lookup-results"
                role="listbox"
              >
                {lookupMatches.length === 0 ? (
                  <li className="is-empty">No matching cases</li>
                ) : (
                  lookupMatches.map((item) => (
                    <li key={item.id}>
                      <button
                        type="button"
                        role="option"
                        aria-selected={item.id === lookupCaseId}
                        className={item.id === lookupCaseId ? "is-selected" : ""}
                        onClick={() => chooseLookupCase(item.id)}
                      >
                        <strong>{item.id}</strong>
                        <span>{statusLabel(item.status)}</span>
                      </button>
                    </li>
                  ))
                )}
              </ul>
            ) : null}
          </div>
          {lookupCase ? (
            <div className="cases-lookup-notes">
              <p className="cases-lookup-notes-kicker">
                {lookupCase.id} · {statusLabel(lookupCase.status)}
              </p>
              <p className="cases-lookup-notes-body">
                {lookupCase.notes.trim() || "No notes on this case."}
              </p>
            </div>
          ) : (
            <div className="cases-lookup-notes is-empty">
              <p className="dashboard-empty">
                Select a case to read its notes.
              </p>
            </div>
          )}
        </div>
      </section>

        <section className="dashboard-card cases-create">
        <header className="dashboard-card-head cases-create-head">
          <div>
            <h2>Create case</h2>
            <p>Start with a case id and optional internal notes.</p>
          </div>
          <button type="button" className="btn-solid cases-action" onClick={createCase}>
            Create case
          </button>
        </header>
        <div className="cases-create-grid">
          <label className="floor-settings-note">
            <span>Case id</span>
            <input
              value={caseId}
              onChange={(event) => setCaseId(event.target.value)}
              placeholder="CASE-1234"
            />
          </label>
          <label className="floor-settings-note">
            <span>Notes</span>
            <textarea
              rows={3}
              value={notes}
              onChange={(event) => setNotes(event.target.value.slice(0, 4000))}
              placeholder="Add context, follow-up plan, or internal notes..."
            />
          </label>
        </div>
        {error ? <p className="settings-error">{error}</p> : null}
      </section>
      </div>
    </div>
  );
}
