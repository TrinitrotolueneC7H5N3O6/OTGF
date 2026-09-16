"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
  loadFunnelDraft,
  publishFunnelDraft,
  snapshotPublishedFunnel,
} from "@/lib/funnel/store";
import { emptyLeadFunnelDraft, type LeadGenFunnelDraft } from "@/lib/funnel/types";

export default function ReviewStepPage() {
  const [draft, setDraft] = useState<LeadGenFunnelDraft>(emptyLeadFunnelDraft());
  const [origin, setOrigin] = useState("");
  const [copied, setCopied] = useState(false);
  const [publishing, setPublishing] = useState(false);

  useEffect(() => {
    setDraft(loadFunnelDraft());
    setOrigin(window.location.origin);
  }, []);

  const isReady =
    draft.business.name.trim().length > 0 && draft.offer.headline.trim().length > 0;

  const publicUrl = useMemo(
    () => (draft.slug ? `${origin}/f/${draft.slug}` : ""),
    [draft.slug, origin],
  );

  function onPublish() {
    setPublishing(true);
    const published = publishFunnelDraft();
    snapshotPublishedFunnel(published);
    setDraft(published);
    setPublishing(false);
  }

  async function copyUrl() {
    if (!publicUrl) return;
    await navigator.clipboard.writeText(publicUrl);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1600);
  }

  return (
    <div className="funnel-step">
      <h1 className="funnel-title">Everything look right?</h1>
      <p className="funnel-copy">
        Take a last look, then publish to get a shareable link.
      </p>

      <div className="funnel-review-list">
        <ReviewRow
          label="Business"
          value={
            draft.business.name
              ? `${draft.business.name}${draft.business.industry ? ` · ${draft.business.industry}` : ""}`
              : "Not set"
          }
          editHref="/build/business"
        />
        <ReviewRow
          label="Offer"
          value={draft.offer.headline || "Not set"}
          detail={draft.offer.subheading}
          editHref="/build/offer"
        />
        <ReviewRow
          label="Qualifying questions"
          value={
            draft.questions.length
              ? `${draft.questions.length} question${draft.questions.length === 1 ? "" : "s"}`
              : "None — contact info only"
          }
          detail={draft.questions.map((q) => q.label).join(" · ")}
          editHref="/build/questions"
        />
        <ReviewRow
          label="Contact info collected"
          value={
            Object.entries(draft.contactFields)
              .filter(([, on]) => on)
              .map(([key]) => key[0].toUpperCase() + key.slice(1))
              .join(", ") || "None"
          }
          editHref="/build/contact"
        />
        <ReviewRow
          label="After they submit"
          value={draft.thankYou.message}
          detail={draft.thankYou.timeframe}
          editHref="/build/thanks"
        />
      </div>

      {!isReady ? (
        <p className="funnel-hint funnel-hint-warn">
          Add a business name and headline before publishing.
        </p>
      ) : null}

      {draft.publishedAt ? (
        <div className="funnel-publish-card is-live">
          <p className="funnel-preview-eyebrow">Published</p>
          <div className="funnel-url-bar">
            <code>{publicUrl}</code>
            <button type="button" onClick={() => void copyUrl()}>
              {copied ? "Copied" : "Copy"}
            </button>
          </div>
          <div className="funnel-actions funnel-actions-row">
            <Link href={`/f/${draft.slug}`} className="btn-solid" target="_blank">
              Preview live page
            </Link>
            <Link href="/build/leads" className="btn-ghost">
              See leads
            </Link>
          </div>
        </div>
      ) : (
        <div className="funnel-actions">
          <button
            type="button"
            className="funnel-continue"
            disabled={!isReady || publishing}
            onClick={onPublish}
          >
            {publishing ? "Publishing…" : "Publish funnel"}
          </button>
        </div>
      )}
    </div>
  );
}

function ReviewRow({
  label,
  value,
  detail,
  editHref,
}: {
  label: string;
  value: string;
  detail?: string;
  editHref: string;
}) {
  return (
    <div className="funnel-review-row">
      <div className="funnel-review-text">
        <p className="funnel-review-label">{label}</p>
        <p className="funnel-review-value">{value}</p>
        {detail ? <p className="funnel-review-detail">{detail}</p> : null}
      </div>
      <Link href={editHref} className="funnel-review-edit">
        Edit
      </Link>
    </div>
  );
}
