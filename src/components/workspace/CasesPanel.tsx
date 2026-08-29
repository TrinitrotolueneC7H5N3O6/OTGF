"use client";

import { useMemo, useState } from "react";
import { getSpace } from "@/lib/store";
import type {
  Client,
  CollectedContact,
  CustomerCase,
  CustomerCaseIdentifier,
  CustomerCaseStatus,
  Message,
} from "@/lib/types";
import { IconX } from "@/components/shared/Icons";
import { MessageBodyText } from "@/components/shared/MessageBodyText";
import { MessageMedia } from "@/components/shared/MessageMedia";
import { MessageReplyQuote } from "@/components/shared/MessageReplyQuote";
import { ReceiptCard } from "@/components/shared/ReceiptCard";

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

function newIdentifier(): CustomerCaseIdentifier {
  const suffix = Math.random().toString(36).slice(2, 9);
  return { id: `case-ref-${Date.now()}-${suffix}`, label: "", value: "" };
}

function identifierLabel(identifier: CustomerCaseIdentifier) {
  return `${identifier.label}: ${identifier.value}`;
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
  slug,
  cases,
  clients,
  contacts = [],
  section = "cases",
  onCreateCase,
  onUpdateStatus,
  onUpdateNotes,
  onUpdateIdentifiers,
  onAssignChat,
  onHideChat,
}: CasesPanelProps) {
  const [caseId, setCaseId] = useState(newCaseId);
  const [notes, setNotes] = useState("");
  const [assignDraft, setAssignDraft] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [viewingClient, setViewingClient] = useState<Client | null>(null);
  const [threadMessages, setThreadMessages] = useState<Message[]>([]);
  const [threadLoading, setThreadLoading] = useState(false);
  const [threadError, setThreadError] = useState<string | null>(null);

  const activeClients = useMemo(
    () => clients.filter((client) => client.preview.trim()),
    [clients],
  );
  const caseCounts = useMemo(
    () => ({
      total: cases.length,
      open: cases.filter((item) => item.status === "open").length,
      inProgress: cases.filter((item) => item.status === "in_progress").length,
      resolved: cases.filter((item) => item.status === "resolved").length,
    }),
    [cases],
  );
  const assignedIds = useMemo(
    () => new Set(activeClients.filter((client) => client.caseId).map((client) => client.id)),
    [activeClients],
  );
  const unassignedClients = activeClients.filter((client) => !assignedIds.has(client.id));
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

  async function viewConversation(client: Client) {
    setViewingClient(client);
    setThreadMessages([]);
    setThreadError(null);
    setThreadLoading(true);
    try {
      const thread = await getSpace(slug, client.id, { threadOnly: true });
      setThreadMessages(
        (thread?.messages ?? []).filter((message) => message.clientId === client.id),
      );
    } catch (err) {
      console.warn("Could not load case chat:", err);
      setThreadError("Could not load this conversation.");
    } finally {
      setThreadLoading(false);
    }
  }

  function updateIdentifier(
    customerCase: CustomerCase,
    identifierId: string,
    patch: Partial<CustomerCaseIdentifier>,
  ) {
    onUpdateIdentifiers(
      customerCase.id,
      customerCase.identifiers.map((identifier) =>
        identifier.id === identifierId
          ? { ...identifier, ...patch }
          : identifier,
      ),
    );
  }

  function removeIdentifier(customerCase: CustomerCase, identifierId: string) {
    onUpdateIdentifiers(
      customerCase.id,
      customerCase.identifiers.filter((identifier) => identifier.id !== identifierId),
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

      <section className="cases-summary" aria-label="Case summary">
        <div>
          <span>Total</span>
          <strong>{caseCounts.total}</strong>
        </div>
        <div>
          <span>Open</span>
          <strong>{caseCounts.open}</strong>
        </div>
        <div>
          <span>In progress</span>
          <strong>{caseCounts.inProgress}</strong>
        </div>
        <div>
          <span>Resolved</span>
          <strong>{caseCounts.resolved}</strong>
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

      {cases.length === 0 ? (
        <p className="dashboard-empty">No cases yet.</p>
      ) : (
        <div className="cases-list">
          {cases.map((customerCase) => {
            const assigned = activeClients.filter(
              (client) => client.caseId === customerCase.id,
            );
            const draft = assignDraft[customerCase.id] ?? "";
            return (
              <section key={customerCase.id} className="dashboard-card case-card">
                <header className="case-card-head">
                  <div className="case-card-title">
                    <div>
                      <p>Case</p>
                      <h2>{customerCase.id}</h2>
                    </div>
                    <span className={`case-status-pill is-${customerCase.status}`}>
                      {statusLabel(customerCase.status)}
                    </span>
                  </div>
                  <div className="case-card-meta">
                    <p>
                      {assigned.length} assigned chat
                      {assigned.length === 1 ? "" : "s"}
                    </p>
                    <p>
                      {customerCase.identifiers.length} linked identifier
                      {customerCase.identifiers.length === 1 ? "" : "s"}
                    </p>
                  </div>
                </header>

                <div className="case-controls">
                  <label className="case-status-field">
                    <span>Status</span>
                    <select
                      value={customerCase.status}
                      onChange={(event) =>
                        onUpdateStatus(
                          customerCase.id,
                          event.target.value as CustomerCaseStatus,
                        )
                      }
                      aria-label={`Status for ${customerCase.id}`}
                    >
                      {CASE_STATUSES.map((status) => (
                        <option key={status.value} value={status.value}>
                          {status.label}
                        </option>
                      ))}
                    </select>
                  </label>
                  <div className="case-assign-control">
                    <label>
                      <span>Assign chat</span>
                      <select
                        value={draft}
                        onChange={(event) =>
                          setAssignDraft((current) => ({
                            ...current,
                            [customerCase.id]: event.target.value,
                          }))
                        }
                        aria-label={`Assign chat to ${customerCase.id}`}
                      >
                        <option value="">Choose an unassigned chat...</option>
                        {unassignedClients.map((client) => (
                          <option key={client.id} value={client.id}>
                            {client.name} - {client.preview || "No messages yet"}
                          </option>
                        ))}
                      </select>
                    </label>
                    <button
                      type="button"
                      className="btn-ghost cases-action"
                      disabled={!draft}
                      onClick={() => {
                        if (!draft) return;
                        onAssignChat(draft, customerCase.id);
                        setAssignDraft((current) => ({ ...current, [customerCase.id]: "" }));
                      }}
                    >
                      Assign
                    </button>
                  </div>
                </div>

                <div className="case-detail-grid">
                  <label className="floor-settings-note case-notes-card">
                    <span>Case notes</span>
                    <textarea
                      rows={7}
                      value={customerCase.notes}
                      onChange={(event) =>
                        onUpdateNotes(customerCase.id, event.target.value)
                      }
                      placeholder="Notes for this case..."
                    />
                  </label>

                  <section className="case-identifiers">
                    <div className="case-identifiers-head">
                      <div>
                        <h3>Linked identifiers</h3>
                        <p>Tracking IDs, order numbers, client IDs, or other records.</p>
                      </div>
                      <button
                        type="button"
                        className="btn-ghost cases-action"
                        onClick={() =>
                          onUpdateIdentifiers(customerCase.id, [
                            ...customerCase.identifiers,
                            newIdentifier(),
                          ])
                        }
                      >
                        Add
                      </button>
                    </div>
                  {customerCase.identifiers.length === 0 ? (
                    <p className="case-identifiers-empty">
                      No linked identifiers yet.
                    </p>
                  ) : (
                    <div className="case-identifier-list">
                      {customerCase.identifiers.map((identifier) => (
                        <div key={identifier.id} className="case-identifier-row">
                          <label>
                            <span>Type</span>
                            <input
                              value={identifier.label}
                              onChange={(event) =>
                                updateIdentifier(customerCase, identifier.id, {
                                  label: event.target.value.slice(0, 80),
                                })
                              }
                              placeholder="Tracking ID"
                            />
                          </label>
                          <label>
                            <span>ID / number</span>
                            <input
                              value={identifier.value}
                              onChange={(event) =>
                                updateIdentifier(customerCase, identifier.id, {
                                  value: event.target.value.slice(0, 160),
                                })
                              }
                              placeholder="TRK-1234"
                            />
                          </label>
                          <label>
                            <span>Link</span>
                            <input
                              value={identifier.url ?? ""}
                              onChange={(event) =>
                                updateIdentifier(customerCase, identifier.id, {
                                  url: event.target.value.slice(0, 500),
                                })
                              }
                              placeholder="https://..."
                            />
                          </label>
                          <button
                            type="button"
                            className="btn-ghost cases-action"
                            onClick={() =>
                              removeIdentifier(customerCase, identifier.id)
                            }
                          >
                            Remove
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                  {customerCase.identifiers.some(
                    (identifier) => identifier.label && identifier.value,
                  ) ? (
                    <div className="case-identifier-links">
                      {customerCase.identifiers
                        .filter((identifier) => identifier.label && identifier.value)
                        .map((identifier) =>
                          identifier.url ? (
                            <a
                              key={identifier.id}
                              href={identifier.url}
                              target="_blank"
                              rel="noreferrer"
                            >
                              {identifierLabel(identifier)}
                            </a>
                          ) : (
                            <span key={identifier.id}>
                              {identifierLabel(identifier)}
                            </span>
                          ),
                        )}
                    </div>
                  ) : null}
                  </section>
                </div>

                <section className="case-chats">
                  <div className="case-section-head">
                    <h3>Assigned chats</h3>
                    <span>{assigned.length}</span>
                  </div>
                  {assigned.length === 0 ? (
                    <p className="dashboard-empty">No chats assigned yet.</p>
                  ) : (
                    <ul className="case-chat-list">
                      {assigned.map((client) => (
                        <li key={client.id}>
                          <div className="case-chat-main">
                            <strong>{client.name}</strong>
                            <span>{client.preview || "No messages yet"}</span>
                          </div>
                          <div className="case-chat-actions">
                            {client.hiddenFromInbox ? (
                              <span className="case-hidden-label">Hidden</span>
                            ) : null}
                            <button
                              type="button"
                              className="btn-ghost cases-action"
                              onClick={() => viewConversation(client)}
                            >
                              View
                            </button>
                            <button
                              type="button"
                              className="btn-ghost cases-action"
                              onClick={() => onHideChat(client.id, !client.hiddenFromInbox)}
                            >
                              {client.hiddenFromInbox ? "Unhide" : "Hide"}
                            </button>
                            <button
                              type="button"
                              className="btn-ghost cases-action"
                              onClick={() => onAssignChat(client.id, null)}
                            >
                              Unassign
                            </button>
                          </div>
                        </li>
                      ))}
                    </ul>
                  )}
                </section>
              </section>
            );
          })}
        </div>
      )}

      {viewingClient ? (
        <div
          className="case-chat-drawer-backdrop"
          role="presentation"
          onClick={() => setViewingClient(null)}
        >
          <aside
            className="case-chat-drawer"
            role="dialog"
            aria-modal="true"
            aria-label={`Conversation with ${viewingClient.name}`}
            onClick={(event) => event.stopPropagation()}
          >
            <header className="case-chat-drawer-head">
              <div>
                <p>Case chat</p>
                <h2>{viewingClient.name}</h2>
                <span>{viewingClient.caseId}</span>
              </div>
              <button
                type="button"
                className="icon-btn"
                onClick={() => setViewingClient(null)}
                aria-label="Close conversation"
                title="Close"
              >
                <IconX size={16} />
              </button>
            </header>

            <div className="case-chat-drawer-stream" role="log">
              {threadLoading ? (
                <p className="dashboard-empty">Loading conversation...</p>
              ) : threadError ? (
                <p className="settings-error">{threadError}</p>
              ) : threadMessages.length === 0 ? (
                <p className="dashboard-empty">No messages in this chat yet.</p>
              ) : (
                threadMessages.map((message) => {
                  if (message.kind === "system") {
                    return (
                      <div key={message.id} className="case-chat-system">
                        <span>{message.body}</span>
                        <time>{message.at}</time>
                      </div>
                    );
                  }
                  const mine = message.from === "business";
                  const mediaOnly =
                    (message.kind === "image" || message.kind === "video") &&
                    !message.body?.trim();
                  return (
                    <div
                      key={message.id}
                      className={`msg-wrap ${mine ? "is-mine" : "is-theirs"}`}
                    >
                      <article
                        className={`bubble bubble-${message.from} bubble-${message.kind}${mediaOnly ? " is-media-only" : ""}`}
                      >
                        {message.fromName && mine ? (
                          <span className="bubble-speaker">{message.fromName}</span>
                        ) : null}
                        {message.replyTo ? (
                          <MessageReplyQuote reply={message.replyTo} />
                        ) : null}
                        {message.kind === "receipt" && message.receipt ? (
                          <ReceiptCard
                            receipt={message.receipt}
                            linkUrl={message.linkUrl}
                          />
                        ) : (
                          <>
                            <MessageMedia message={message} />
                            {message.body ? (
                              <MessageBodyText text={message.body} />
                            ) : null}
                          </>
                        )}
                        <time>{message.at}</time>
                      </article>
                    </div>
                  );
                })
              )}
            </div>
          </aside>
        </div>
      ) : null}
    </div>
  );
}
