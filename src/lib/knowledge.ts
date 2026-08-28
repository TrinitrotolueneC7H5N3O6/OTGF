import type { KnowledgeHorizon, KnowledgeNote } from "./types";

export function newKnowledgeId() {
  return `k-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

export function normalizeKnowledgeHorizon(raw: unknown): KnowledgeHorizon {
  return raw === "short" ? "short" : "long";
}

export function endOfLocalDayIso(day = new Date()) {
  const next = new Date(day);
  next.setHours(23, 59, 59, 999);
  return next.toISOString();
}

export function dateInputValue(iso?: string) {
  if (!iso) return "";
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return "";
  const d = new Date(t);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function isoFromDateInput(value: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.trim());
  if (!match) return undefined;
  const next = new Date(
    Number(match[1]),
    Number(match[2]) - 1,
    Number(match[3]),
    23,
    59,
    59,
    999,
  );
  if (Number.isNaN(next.getTime())) return undefined;
  return next.toISOString();
}

export function isKnowledgeExpired(note: KnowledgeNote, now = Date.now()) {
  if (note.horizon !== "short" || !note.expiresAt) return false;
  const t = Date.parse(note.expiresAt);
  return Number.isFinite(t) && t < now;
}

export function knowledgeExpiryLabel(note: KnowledgeNote) {
  if (note.horizon !== "short" || !note.expiresAt) return null;
  const t = Date.parse(note.expiresAt);
  if (!Number.isFinite(t)) return null;
  const expired = t < Date.now();
  const when = new Date(t);
  const today = new Date();
  if (when.toDateString() === today.toDateString()) {
    return expired ? "Ended today" : "Until tonight";
  }
  const label = when.toLocaleDateString([], {
    month: "short",
    day: "numeric",
  });
  return expired ? `Ended ${label}` : `Until ${label}`;
}

export function activeKnowledgeNotes(notes: KnowledgeNote[]) {
  return notes.filter((note) => !isKnowledgeExpired(note));
}

export function normalizeKnowledgeNotes(raw: unknown): KnowledgeNote[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((row, index) => {
      if (!row || typeof row !== "object") return null;
      const item = row as Partial<KnowledgeNote>;
      const trimmedTitle =
        typeof item.title === "string" ? item.title.trim().slice(0, 80) : "";
      const id =
        typeof item.id === "string" && item.id.trim() ? item.id.trim() : "";
      const title = trimmedTitle || (id ? "Untitled" : "");
      if (!title) return null;
      const body =
        typeof item.body === "string" ? item.body.trim().slice(0, 800) : "";
      const horizon = normalizeKnowledgeHorizon(item.horizon);
      const sortOrder =
        typeof item.sortOrder === "number" && Number.isFinite(item.sortOrder)
          ? item.sortOrder
          : index;
      let expiresAt: string | undefined;
      if (horizon === "short" && typeof item.expiresAt === "string") {
        const t = Date.parse(item.expiresAt);
        if (Number.isFinite(t)) expiresAt = new Date(t).toISOString();
      }
      return {
        id: id || newKnowledgeId(),
        horizon,
        title,
        body,
        ...(expiresAt ? { expiresAt } : {}),
        sortOrder,
      } satisfies KnowledgeNote;
    })
    .filter((item): item is KnowledgeNote => Boolean(item));
}

/** Compact block for a future AI prompt — skips expired short-term notes. */
export function formatKnowledgeForPrompt(notes: KnowledgeNote[]) {
  const active = activeKnowledgeNotes(notes);
  const longNotes = active.filter((note) => note.horizon === "long");
  const shortNotes = active.filter((note) => note.horizon === "short");
  const lines: string[] = [];
  if (longNotes.length) {
    lines.push("Always-true business facts:");
    for (const note of longNotes) {
      lines.push(`- ${note.title}: ${note.body || "(no details yet)"}`);
    }
  }
  if (shortNotes.length) {
    lines.push("True right now (temporary — prefer these over older assumptions):");
    for (const note of shortNotes) {
      const until = knowledgeExpiryLabel(note);
      lines.push(
        `- ${note.title}: ${note.body || "(no details yet)"}${until ? ` (${until})` : ""}`,
      );
    }
  }
  return lines.join("\n");
}
