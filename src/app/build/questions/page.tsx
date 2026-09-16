"use client";

import { useEffect, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { loadFunnelDraft, saveFunnelDraft } from "@/lib/funnel/store";
import {
  QUALIFYING_QUESTION_LIBRARY,
  type QualifyingQuestion,
} from "@/lib/funnel/types";
import { IconCheck } from "@/components/shared/Icons";

export default function QuestionsStepPage() {
  const router = useRouter();
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [custom, setCustom] = useState<QualifyingQuestion[]>([]);
  const [customInput, setCustomInput] = useState("");

  useEffect(() => {
    const draft = loadFunnelDraft();
    const libraryIds = new Set(QUALIFYING_QUESTION_LIBRARY.map((q) => q.id));
    setSelectedIds(
      new Set(draft.questions.filter((q) => libraryIds.has(q.id)).map((q) => q.id)),
    );
    setCustom(draft.questions.filter((q) => !libraryIds.has(q.id)));
  }, []);

  function toggle(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function addCustom() {
    const label = customInput.trim();
    if (!label) return;
    setCustom((prev) => [
      ...prev,
      { id: `custom-${Date.now()}`, label },
    ]);
    setCustomInput("");
  }

  function removeCustom(id: string) {
    setCustom((prev) => prev.filter((q) => q.id !== id));
  }

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    const questions: QualifyingQuestion[] = [
      ...QUALIFYING_QUESTION_LIBRARY.filter((q) => selectedIds.has(q.id)),
      ...custom,
    ];
    saveFunnelDraft((draft) => ({ ...draft, questions }));
    router.push("/build/contact");
  }

  const hasAny = selectedIds.size > 0 || custom.length > 0;

  return (
    <form className="funnel-step" onSubmit={onSubmit}>
      <h1 className="funnel-title">What makes a lead worth calling?</h1>
      <p className="funnel-copy">
        Pick a few questions to ask before they submit. This is what makes a
        lead <em>qualified</em> instead of just a name and a number.
      </p>

      <div className="funnel-chip-list">
        {QUALIFYING_QUESTION_LIBRARY.map((q) => {
          const active = selectedIds.has(q.id);
          return (
            <button
              key={q.id}
              type="button"
              className={`funnel-chip${active ? " is-selected" : ""}`}
              onClick={() => toggle(q.id)}
            >
              {active ? <IconCheck size={13} /> : null}
              {q.label}
            </button>
          );
        })}
        {custom.map((q) => (
          <button
            key={q.id}
            type="button"
            className="funnel-chip is-selected is-custom"
            onClick={() => removeCustom(q.id)}
            title="Remove"
          >
            <IconCheck size={13} />
            {q.label}
          </button>
        ))}
      </div>

      <label className="funnel-field funnel-field-inline">
        <span>Add your own question</span>
        <div className="funnel-inline-row">
          <input
            value={customInput}
            onChange={(e) => setCustomInput(e.target.value)}
            placeholder="e.g. Do you own or rent?"
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                addCustom();
              }
            }}
          />
          <button type="button" className="btn-ghost" onClick={addCustom}>
            Add
          </button>
        </div>
      </label>

      {!hasAny ? (
        <p className="funnel-hint">
          It&apos;s fine to skip this — you&apos;ll just collect contact info.
        </p>
      ) : null}

      <div className="funnel-actions">
        <button type="submit" className="funnel-continue">
          Continue
        </button>
      </div>
    </form>
  );
}
