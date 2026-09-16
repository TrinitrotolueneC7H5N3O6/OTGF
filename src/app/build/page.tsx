"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { loadFunnelDraft, saveFunnelDraft } from "@/lib/funnel/store";
import { IconCheck } from "@/components/shared/Icons";

const GOALS = [
  {
    id: "leads" as const,
    title: "Generate leads",
    copy: "Capture contact info and a few qualifying answers from interested visitors.",
    available: true,
  },
  {
    id: "appointments" as const,
    title: "Book appointments",
    copy: "Let visitors pick a service and a time slot themselves.",
    available: false,
  },
  {
    id: "products" as const,
    title: "Recommend products",
    copy: "A short quiz that points visitors to the right product.",
    available: false,
  },
];

export default function GoalStepPage() {
  const router = useRouter();
  const [selected, setSelected] = useState<"leads" | null>(null);

  useEffect(() => {
    const draft = loadFunnelDraft();
    if (draft.goal === "leads") setSelected("leads");
  }, []);

  function choose(id: "leads") {
    setSelected(id);
    saveFunnelDraft((draft) => ({ ...draft, goal: id }));
  }

  return (
    <div className="funnel-step">
      <h1 className="funnel-title">What do you want this funnel to do?</h1>
      <p className="funnel-copy">
        Pick one job to start. You can build another funnel for a different
        job later.
      </p>

      <div className="funnel-goal-list">
        {GOALS.map((goal) => (
          <button
            key={goal.id}
            type="button"
            disabled={!goal.available}
            className={`funnel-goal-card${selected === goal.id ? " is-selected" : ""}`}
            onClick={() => goal.available && choose("leads")}
          >
            <span className="funnel-goal-card-top">
              <span className="funnel-goal-card-title">{goal.title}</span>
              {goal.available ? (
                selected === goal.id ? (
                  <span className="funnel-goal-check">
                    <IconCheck size={14} />
                  </span>
                ) : null
              ) : (
                <span className="funnel-goal-soon">Soon</span>
              )}
            </span>
            <span className="funnel-goal-card-copy">{goal.copy}</span>
          </button>
        ))}
      </div>

      <div className="funnel-actions">
        <button
          type="button"
          className="funnel-continue"
          disabled={!selected}
          onClick={() => router.push("/build/business")}
        >
          Continue
        </button>
      </div>
    </div>
  );
}
