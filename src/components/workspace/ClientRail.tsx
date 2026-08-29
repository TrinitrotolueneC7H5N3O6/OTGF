"use client";

import {
  useEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type MouseEvent,
} from "react";
import type { Client, FloorMember, Message } from "@/lib/types";
import { isClientLive } from "@/lib/presence";
import {
  lastClientMessage,
  messageCreatedMs,
  waitSinceLabel,
  waitSinceTitle,
} from "@/lib/messageTime";
import { ClientAvatar } from "@/components/shared/ClientAvatar";
import { IconEyeOff, IconPencil, IconTrash } from "@/components/shared/Icons";

export type InboxQuickFilter = "all" | "unanswered" | "new" | "cases";

export interface InboxQuickCounts {
  all: number;
  unanswered: number;
  new: number;
  cases: number;
}

interface ClientRailProps {
  clients: Client[];
  members: FloorMember[];
  messages: Message[];
  activeId: string;
  query: string;
  quickFilter: InboxQuickFilter;
  quickCounts: InboxQuickCounts;
  onQueryChange: (value: string) => void;
  onQuickFilterChange: (value: InboxQuickFilter) => void;
  onSelect: (client: Client) => void;
  onRename: (clientId: string, name: string) => void;
  onOwnerChange: (clientId: string, ownerMemberId: string | undefined) => void;
  onDelete: (clientId: string) => void;
}

const QUICK_FILTERS: { id: InboxQuickFilter; label: string }[] = [
  { id: "all", label: "All" },
  { id: "unanswered", label: "Unanswered" },
  { id: "new", label: "New" },
  { id: "cases", label: "Cases" },
];

function awaitingReply(clientId: string, messages: Message[], ended?: boolean) {
  if (ended) return false;
  for (let i = messages.length - 1; i >= 0; i--) {
    const message = messages[i];
    if (message.clientId === clientId) {
      return message.from === "client";
    }
  }
  return false;
}

function initials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0] ?? ""}${parts[1][0] ?? ""}`.toUpperCase();
}

export function ClientRail({
  clients,
  members,
  messages,
  activeId,
  query,
  quickFilter,
  quickCounts,
  onQueryChange,
  onQuickFilterChange,
  onSelect,
  onRename,
  onOwnerChange,
  onDelete,
}: ClientRailProps) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draftName, setDraftName] = useState("");
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 5_000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    if (editingId && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [editingId]);

  function startRename(client: Client, e?: MouseEvent) {
    e?.stopPropagation();
  e?.preventDefault();
  setEditingId(client.id);
  setDraftName(client.name ?? "");
  }

  function commitRename(clientId: string) {
    const next = draftName.trim();
    if (next) onRename(clientId, next);
    setEditingId(null);
  }

  function onNameKey(e: KeyboardEvent<HTMLInputElement>, clientId: string) {
    if (e.key === "Enter") {
      e.preventDefault();
      commitRename(clientId);
    }
    if (e.key === "Escape") {
      e.preventDefault();
      setEditingId(null);
    }
  }

  function deleteChat(client: Client, e: MouseEvent) {
    e.stopPropagation();
    e.preventDefault();
    const shouldHide = Boolean(client.caseId);
    const ok = window.confirm(
      shouldHide
        ? `Hide ${client.name} from the inbox? It will stay in ${client.caseId}.`
        : `Delete chat with ${client.name}?`,
    );
    if (ok) onDelete(client.id);
  }

  function setOwner(
    clientId: string,
    ownerMemberId: string | undefined,
    e: MouseEvent,
  ) {
    e.stopPropagation();
    e.preventDefault();
    onOwnerChange(clientId, ownerMemberId);
  }

  return (
    <div className="rail">
      <div className="rail-head">
        <div className="rail-head-row">
          <h2>Inbox</h2>
          <span className="rail-count">{clients.length}</span>
        </div>
        <div className="rail-quick-filters" aria-label="Inbox filters">
          {QUICK_FILTERS.map((filter) => (
            <button
              key={filter.id}
              type="button"
              className={quickFilter === filter.id ? "is-active" : undefined}
              onClick={() => onQuickFilterChange(filter.id)}
              aria-pressed={quickFilter === filter.id}
            >
              <span>{filter.label}</span>
              <strong>{quickCounts[filter.id]}</strong>
            </button>
          ))}
        </div>
        <button
          type="button"
          className="rail-advanced-toggle"
          onClick={() => setAdvancedOpen((open) => !open)}
          aria-expanded={advancedOpen}
        >
          Advanced filter
        </button>
        {advancedOpen || query.trim() ? (
          <label className="search">
            <span className="sr-only">Search clients</span>
            <input
              value={query ?? ""}
              onChange={(e) => onQueryChange(e.target.value)}
              placeholder="Search chats"
            />
          </label>
        ) : null}
      </div>

      {clients.length === 0 ? (
        <div className="rail-empty">
          <p>Share your link. Clients show up here.</p>
        </div>
      ) : (
        <ul className="client-list">
          {clients.map((client, index) => {
            const isActive = client.id === activeId;
            const isEditing = editingId === client.id;
            const ended = Boolean(client.chatEndedAt);
            const needsReply = awaitingReply(client.id, messages, ended);
            const owner = members.find((m) => m.id === client.ownerMemberId);
            const live = !ended && isClientLive(client, now);
            const lastMsg = lastClientMessage(client.id, messages);
            const lastMs = lastMsg ? messageCreatedMs(lastMsg) : null;
            const waitLabel =
              lastMs != null ? waitSinceLabel(lastMs, now) : "";
            const waitTitle =
              lastMsg && lastMs != null
                ? waitSinceTitle(lastMsg.from, lastMs, now)
                : undefined;
            return (
              <li key={client.id || `client-${index}`}>
                <div
                  className={`client-row ${isActive ? "is-active" : ""} ${needsReply ? "needs-attention" : ""} ${live ? "is-live" : ""}`}
                  role="button"
                  tabIndex={0}
                  aria-pressed={isActive}
                  aria-label={`Open chat with ${client.name}${live ? " (live)" : ""}`}
                  onClick={() => {
                    if (!isEditing) onSelect(client);
                  }}
                  onKeyDown={(e) => {
                    if (isEditing) return;
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      onSelect(client);
                    }
                  }}
                >
                  <ClientAvatar id={client.id} name={client.name || "Guest"} />

                  <div className="client-body">
                    <div className="client-row-top">
                      {isEditing ? (
                        <input
                          ref={inputRef}
                          className="client-name-edit"
                          value={draftName ?? ""}
                          onChange={(e) => setDraftName(e.target.value)}
                          onBlur={() => commitRename(client.id)}
                          onKeyDown={(e) => onNameKey(e, client.id)}
                          onClick={(e) => e.stopPropagation()}
                          aria-label="Client name"
                        />
                      ) : (
                        <div className="client-name-wrap">
                          <span
                            className="client-name"
                            onDoubleClick={(e) => startRename(client, e)}
                            title="Double-click to rename"
                          >
                            {client.name}
                          </span>
                          {client.autoAnswerDraft ? (
                            <span
                              className="auto-answer-badge"
                              title={
                                client.autoAnswerDraft.status === "working"
                                  ? "AI is writing a reply"
                                  : client.autoAnswerDraft.status === "failed"
                                    ? "AI draft failed"
                                    : "AI draft waiting for you"
                              }
                            >
                              AI
                            </span>
                          ) : null}
                          {live ? (
                            <span
                              className="client-live-dot"
                              aria-label="Customer is live"
                              title="Live on chat"
                            />
                          ) : null}
                          <span
                            className="client-pencil"
                            aria-label={`Rename ${client.name}`}
                            onClick={(e) => startRename(client, e)}
                            role="button"
                            tabIndex={0}
                            onKeyDown={(e) => {
                              if (e.key === "Enter" || e.key === " ") {
                                e.preventDefault();
                                e.stopPropagation();
                                startRename(client);
                              }
                            }}
                          >
                            <PencilIcon />
                          </span>
                        </div>
                      )}
                      <div className="client-end">
                        {waitLabel ? (
                          <span className="client-time" title={waitTitle}>
                            {waitLabel}
                          </span>
                        ) : null}
                        {ended ? (
                          <span className="chat-ended-label">Chat ended</span>
                        ) : needsReply ? (
                          <span
                            className="needs-reply"
                            aria-label="Awaiting reply"
                          />
                        ) : null}
                      </div>
                    </div>
                    <p className="client-preview">{client.preview || "No messages yet"}</p>
                    <div className="client-meta">
                      {members.length > 0 ? (
                        <div
                          className="client-owner-pills"
                          role="group"
                          aria-label="Chat owner"
                        >
                          {members.map((member) => (
                            <button
                              key={member.id}
                              type="button"
                              className={
                                client.ownerMemberId === member.id
                                  ? "owner-pill is-active"
                                  : "owner-pill"
                              }
                              aria-pressed={
                                client.ownerMemberId === member.id
                              }
                              title={member.name}
                              onClick={(e) => {
                                if (members.length === 1) {
                                  e.stopPropagation();
                                  e.preventDefault();
                                  return;
                                }
                                setOwner(
                                  client.id,
                                  client.ownerMemberId === member.id
                                    ? undefined
                                    : member.id,
                                  e,
                                );
                              }}
                            >
                              {initials(member.name)}
                            </button>
                          ))}
                        </div>
                      ) : null}
                      {owner ? (
                        <span className="client-owner-label">{owner.name}</span>
                      ) : null}
                      <button
                        type="button"
                        className="client-delete-btn"
                        onClick={(e) => deleteChat(client, e)}
                        aria-label={
                          client.caseId
                            ? `Hide chat with ${client.name}`
                            : `Delete chat with ${client.name}`
                        }
                        title={
                          client.caseId
                            ? "Hide"
                            : "Delete"
                        }
                      >
                        {client.caseId ? (
                          <IconEyeOff size={13} />
                        ) : (
                          <IconTrash size={13} />
                        )}
                      </button>
                    </div>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

function PencilIcon() {
  return <IconPencil size={11} />;
}
