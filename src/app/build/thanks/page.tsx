"use client";

import { useEffect, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { loadFunnelDraft, saveFunnelDraft } from "@/lib/funnel/store";

export default function ThanksStepPage() {
  const router = useRouter();
  const [message, setMessage] = useState("");
  const [timeframe, setTimeframe] = useState("");

  useEffect(() => {
    const draft = loadFunnelDraft();
    setMessage(draft.thankYou.message);
    setTimeframe(draft.thankYou.timeframe);
  }, []);

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    saveFunnelDraft((draft) => ({
      ...draft,
      thankYou: {
        message: message.trim() || "Thanks — we've got your info.",
        timeframe: timeframe.trim(),
      },
    }));
    router.push("/build/review");
  }

  return (
    <form className="funnel-step" onSubmit={onSubmit}>
      <h1 className="funnel-title">What happens after they submit?</h1>
      <p className="funnel-copy">
        Set expectations right away so they don&apos;t wonder if it worked.
      </p>

      <label className="funnel-field">
        <span>Thank-you message</span>
        <input
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          placeholder="Thanks — we've got your info."
          autoFocus
        />
      </label>

      <label className="funnel-field">
        <span>Response promise</span>
        <input
          value={timeframe}
          onChange={(e) => setTimeframe(e.target.value)}
          placeholder="We'll call you back within 1 business day."
        />
      </label>

      <div className="funnel-preview-card" aria-hidden>
        <p className="funnel-preview-eyebrow">Preview</p>
        <h2>{message || "Thanks — we've got your info."}</h2>
        <p>{timeframe || "We'll follow up soon."}</p>
      </div>

      <div className="funnel-actions">
        <button type="submit" className="funnel-continue">
          Continue
        </button>
      </div>
    </form>
  );
}
