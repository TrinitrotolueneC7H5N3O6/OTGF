"use client";

import { useId, useRef, useState } from "react";
import type { KnowledgeHorizon, KnowledgeNote } from "@/lib/types";
import { IconTrash } from "@/components/shared/Icons";
import {
  dateInputValue,
  endOfLocalDayIso,
  isoFromDateInput,
  isKnowledgeExpired,
  knowledgeExpiryLabel,
  newKnowledgeId,
} from "@/lib/knowledge";
import { AutoAnswerToggle } from "./AutoAnswerReview";

interface AiSetupPanelProps {
  notes: KnowledgeNote[];
  onChangeNotes: (notes: KnowledgeNote[]) => void;
  autoAnswer: boolean;
  onToggleAutoAnswer: (on: boolean) => void;
}

type UntilChoice = "keep" | "today" | "date";

const LONG_EXAMPLES = [
  { title: "A typical price", body: "Consults start at $150. Surgery is quoted after we see you." },
  { title: "What a service includes", body: "A consult is 30–45 minutes: goals, photos, and next steps." },
  { title: "Parking / how to find us", body: "Free garage on Maple. Take the elevator to 3." },
  { title: "Cancellation policy", body: "Please give 24 hours notice or a $50 fee may apply." },
] as const;

const SHORT_EXAMPLES = [
  { title: "Wait time", body: "About 20 minutes right now." },
  { title: "How busy we are", body: "Steady this afternoon — we can still take walk-ins." },
  { title: "A sale going on", body: "20% off consults through Friday." },
] as const;

function untilFromNote(note: KnowledgeNote): UntilChoice {
  if (!note.expiresAt) return "keep";
  const endToday = Date.parse(endOfLocalDayIso());
  const exp = Date.parse(note.expiresAt);
  if (Number.isFinite(exp) && Math.abs(exp - endToday) < 60_000) return "today";
  return "date";
}

function expiresFromUntil(choice: UntilChoice, dateValue: string) {
  if (choice === "today") return endOfLocalDayIso();
  if (choice === "date") return isoFromDateInput(dateValue);
  return undefined;
}

export function AiSetupPanel({
  notes,
  onChangeNotes,
  autoAnswer,
  onToggleAutoAnswer,
}: AiSetupPanelProps) {
  const fieldId = useId();
  const titleRef = useRef<HTMLInputElement>(null);
  const [horizon, setHorizon] = useState<KnowledgeHorizon>("long");
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [until, setUntil] = useState<UntilChoice>("keep");
  const [untilDate, setUntilDate] = useState("");
  const [error, setError] = useState<string | null>(null);

  const visible = notes
    .filter((note) => note.horizon === horizon)
    .slice()
    .sort((a, b) => a.sortOrder - b.sortOrder);
  const longCount = notes.filter((note) => note.horizon === "long").length;
  const shortCount = notes.filter((note) => note.horizon === "short").length;
  const examples = horizon === "long" ? LONG_EXAMPLES : SHORT_EXAMPLES;

  function switchHorizon(next: KnowledgeHorizon) {
    setHorizon(next);
    setTitle("");
    setBody("");
    setUntil("keep");
    setUntilDate("");
    setError(null);
  }

  function useExample(example: { title: string; body: string }) {
    setTitle(example.title);
    setBody(example.body);
    setError(null);
    window.setTimeout(() => titleRef.current?.focus(), 0);
  }

  function addNote() {
    const nextTitle = title.trim();
    const nextBody = body.trim();
    if (!nextTitle) {
      setError("Give it a short name so you can find it later.");
      return;
    }
    if (!nextBody) {
      setError("Write what the AI should tell people.");
      return;
    }
    const expiresAt =
      horizon === "short" ? expiresFromUntil(until, untilDate) : undefined;
    if (horizon === "short" && until === "date" && !expiresAt) {
      setError("Pick an end date, or choose “Until I take it down.”");
      return;
    }
    const next: KnowledgeNote = {
      id: newKnowledgeId(),
      horizon,
      title: nextTitle.slice(0, 80),
      body: nextBody.slice(0, 800),
      ...(expiresAt ? { expiresAt } : {}),
      sortOrder: visible.length,
    };
    onChangeNotes([...notes, next]);
    setTitle("");
    setBody("");
    setUntil("keep");
    setUntilDate("");
    setError(null);
  }

  function patchNote(id: string, partial: Partial<KnowledgeNote>) {
    onChangeNotes(
      notes.map((note) => {
        if (note.id !== id) return note;
        const next = { ...note, ...partial };
        if ("expiresAt" in partial && !partial.expiresAt) {
          delete next.expiresAt;
        }
        return next;
      }),
    );
  }

  function removeNote(id: string) {
    const remaining = notes.filter((note) => note.id !== id);
    const reindexed = remaining.map((note, index, all) => {
      const same = all.filter((item) => item.horizon === note.horizon);
      return { ...note, sortOrder: same.findIndex((item) => item.id === note.id) };
    });
    onChangeNotes(reindexed);
  }

  const todayInput = dateInputValue(endOfLocalDayIso());

  return (
    <div className="dashboard-panel-body ai-setup">
      <h2 className="dashboard-panel-title">AI setup</h2>
      <p className="floor-settings-help">
        Write what your business knows, in everyday words. Turn on auto-answer
        when you want a draft after each customer message — you still approve
        or edit it before anything sends.
      </p>

      <AutoAnswerToggle
        on={autoAnswer}
        onToggle={onToggleAutoAnswer}
        hint="Each draft only reads that one chat. It never uses another customer’s details."
      />

      <div className="ai-setup-tabs" role="tablist" aria-label="Kind of information">
        <button
          type="button"
          role="tab"
          aria-selected={horizon === "long"}
          className={horizon === "long" ? "is-active" : undefined}
          onClick={() => switchHorizon("long")}
        >
          Always true
          <span>{longCount}</span>
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={horizon === "short"}
          className={horizon === "short" ? "is-active" : undefined}
          onClick={() => switchHorizon("short")}
        >
          Right now
          <span>{shortCount}</span>
        </button>
      </div>

      <p className="ai-setup-lead">
        {horizon === "long"
          ? "Prices, what’s included, sizes, policies — things that stay the same week to week."
          : "Wait time, how busy you are, a sale that ends soon. Take it down or set an end date when it’s over."}
      </p>

      <div className="ai-setup-examples">
        <span>Try one</span>
        {examples.map((example) => (
          <button
            key={example.title}
            type="button"
            onClick={() => useExample(example)}
          >
            {example.title}
          </button>
        ))}
      </div>

      <section className="offerings-add">
        <h3>{horizon === "long" ? "Add a lasting fact" : "Add what’s true today"}</h3>
        <label className="floor-settings-note">
          <span>Short name</span>
          <input
            ref={titleRef}
            value={title}
            onChange={(e) => setTitle(e.target.value.slice(0, 80))}
            placeholder={
              horizon === "long" ? "e.g. Rhinoplasty price" : "e.g. Wait time"
            }
            maxLength={80}
          />
        </label>
        <label className="floor-settings-note">
          <span>What should people be told?</span>
          <textarea
            rows={3}
            value={body}
            onChange={(e) => setBody(e.target.value.slice(0, 800))}
            placeholder={
              horizon === "long"
                ? "e.g. Consults start at $150. Surgery pricing is quoted after the visit."
                : "e.g. About 25 minutes right now."
            }
            maxLength={800}
          />
        </label>
        {horizon === "short" ? (
          <fieldset className="ai-setup-until">
            <legend>Keep this until</legend>
            <div className="ai-setup-until-choices">
              {(
                [
                  ["keep", "Until I take it down"],
                  ["today", "End of today"],
                  ["date", "A date I pick"],
                ] as const
              ).map(([id, label]) => (
                <button
                  key={id}
                  type="button"
                  className={until === id ? "is-active" : undefined}
                  aria-pressed={until === id}
                  onClick={() => setUntil(id)}
                >
                  {label}
                </button>
              ))}
            </div>
            {until === "date" ? (
              <label className="floor-settings-note">
                <span>End date</span>
                <input
                  type="date"
                  min={todayInput}
                  value={untilDate}
                  onChange={(e) => setUntilDate(e.target.value)}
                />
              </label>
            ) : null}
          </fieldset>
        ) : null}
        {error ? <p className="editor-error">{error}</p> : null}
        <button type="button" className="btn-solid" onClick={addNote}>
          Add
        </button>
      </section>

      {visible.length === 0 ? (
        <p className="dashboard-empty">
          Nothing here yet. Add a note, or tap an example above to start.
        </p>
      ) : (
        <ul className="offerings-list">
          {visible.map((note) => {
            const expired = isKnowledgeExpired(note);
            const expiry = knowledgeExpiryLabel(note);
            const choice = untilFromNote(note);
            return (
              <li
                key={note.id}
                className={`offerings-card${expired ? " is-expired" : ""}`}
              >
                <div className="offerings-card-head">
                  <div className="offerings-card-main">
                    {expiry ? (
                      <span
                        className={`offerings-kind-label${expired ? " is-ended" : ""}`}
                      >
                        {expired ? `${expiry} — update or remove` : expiry}
                      </span>
                    ) : horizon === "short" ? (
                      <span className="offerings-kind-label">Until you take it down</span>
                    ) : (
                      <span className="offerings-kind-label">Always true</span>
                    )}
                    <input
                      id={`${fieldId}-${note.id}-title`}
                      value={note.title}
                      onChange={(e) =>
                        patchNote(note.id, { title: e.target.value.slice(0, 80) })
                      }
                      aria-label="Short name"
                    />
                  </div>
                  <button
                    type="button"
                    className="floor-banner-remove icon-btn"
                    onClick={() => removeNote(note.id)}
                    aria-label={`Remove ${note.title}`}
                    title="Remove"
                  >
                    <IconTrash size={13} />
                  </button>
                </div>
                <textarea
                  rows={3}
                  value={note.body}
                  onChange={(e) =>
                    patchNote(note.id, { body: e.target.value.slice(0, 800) })
                  }
                  aria-label="What people should be told"
                />
                {horizon === "short" ? (
                  <div className="ai-setup-until-choices is-compact">
                    {(
                      [
                        ["keep", "Keep"],
                        ["today", "Tonight"],
                        ["date", "Date"],
                      ] as const
                    ).map(([id, label]) => (
                      <button
                        key={id}
                        type="button"
                        className={choice === id ? "is-active" : undefined}
                        aria-pressed={choice === id}
                        onClick={() => {
                          if (id === "date") {
                            patchNote(note.id, {
                              expiresAt:
                                note.expiresAt && choice === "date"
                                  ? note.expiresAt
                                  : endOfLocalDayIso(new Date(Date.now() + 86400000)),
                            });
                            return;
                          }
                          const next = expiresFromUntil(id, "");
                          patchNote(note.id, { expiresAt: next });
                        }}
                      >
                        {label}
                      </button>
                    ))}
                    {choice === "date" ? (
                      <input
                        type="date"
                        className="ai-setup-date"
                        min={todayInput}
                        value={dateInputValue(note.expiresAt)}
                        onChange={(e) =>
                          patchNote(note.id, {
                            expiresAt: isoFromDateInput(e.target.value),
                          })
                        }
                        aria-label="End date"
                      />
                    ) : null}
                  </div>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
