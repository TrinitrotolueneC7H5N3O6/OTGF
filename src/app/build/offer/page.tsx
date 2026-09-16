"use client";

import { useEffect, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { loadFunnelDraft, saveFunnelDraft } from "@/lib/funnel/store";

export default function OfferStepPage() {
  const router = useRouter();
  const [headline, setHeadline] = useState("");
  const [subheading, setSubheading] = useState("");
  const [ctaLabel, setCtaLabel] = useState("");

  useEffect(() => {
    const draft = loadFunnelDraft();
    setHeadline(draft.offer.headline);
    setSubheading(draft.offer.subheading);
    setCtaLabel(draft.offer.ctaLabel);
  }, []);

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    saveFunnelDraft((draft) => ({
      ...draft,
      offer: {
        headline: headline.trim(),
        subheading: subheading.trim(),
        ctaLabel: ctaLabel.trim() || "Get my free quote",
      },
    }));
    router.push("/build/questions");
  }

  return (
    <form className="funnel-step" onSubmit={onSubmit}>
      <h1 className="funnel-title">What&apos;s the pitch?</h1>
      <p className="funnel-copy">
        This is the first thing a visitor reads. Keep it short and specific.
      </p>

      <label className="funnel-field">
        <span>Headline</span>
        <input
          value={headline}
          onChange={(e) => setHeadline(e.target.value)}
          placeholder="e.g. Free same-day plumbing estimates"
          autoFocus
          required
        />
      </label>

      <label className="funnel-field">
        <span>Subheading</span>
        <input
          value={subheading}
          onChange={(e) => setSubheading(e.target.value)}
          placeholder="e.g. Licensed, local, and usually there within the hour."
        />
      </label>

      <label className="funnel-field">
        <span>Button text</span>
        <input
          value={ctaLabel}
          onChange={(e) => setCtaLabel(e.target.value)}
          placeholder="Get my free quote"
        />
      </label>

      <div className="funnel-preview-card" aria-hidden>
        <p className="funnel-preview-eyebrow">Preview</p>
        <h2>{headline || "Your headline goes here"}</h2>
        <p>{subheading || "A one-line reason to keep reading."}</p>
        <span className="funnel-preview-cta">
          {ctaLabel || "Get my free quote"}
        </span>
      </div>

      <div className="funnel-actions">
        <button type="submit" className="funnel-continue">
          Continue
        </button>
      </div>
    </form>
  );
}
