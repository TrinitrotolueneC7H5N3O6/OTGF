"use client";

import { useEffect, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { loadFunnelDraft, saveFunnelDraft } from "@/lib/funnel/store";

export default function BusinessStepPage() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [industry, setIndustry] = useState("");

  useEffect(() => {
    const draft = loadFunnelDraft();
    setName(draft.business.name);
    setIndustry(draft.business.industry);
  }, []);

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    saveFunnelDraft((draft) => ({
      ...draft,
      business: { name: name.trim(), industry: industry.trim() },
    }));
    router.push("/build/offer");
  }

  return (
    <form className="funnel-step" onSubmit={onSubmit}>
      <h1 className="funnel-title">Tell us about your business.</h1>
      <p className="funnel-copy">
        Just enough to make your funnel feel like it&apos;s actually yours.
      </p>

      <label className="funnel-field">
        <span>Business name</span>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g. River Street Plumbing"
          autoFocus
          required
        />
      </label>

      <label className="funnel-field">
        <span>What kind of business is it?</span>
        <input
          value={industry}
          onChange={(e) => setIndustry(e.target.value)}
          placeholder="e.g. Plumbing, Landscaping, Salon"
          required
        />
      </label>

      <div className="funnel-actions">
        <button type="submit" className="funnel-continue">
          Continue
        </button>
      </div>
    </form>
  );
}
