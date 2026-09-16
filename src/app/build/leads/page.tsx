"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { loadLeads } from "@/lib/funnel/store";
import type { CapturedLead } from "@/lib/funnel/types";

function formatWhen(iso: string): string {
  try {
    return new Date(iso).toLocaleString(undefined, {
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

export default function LeadsInboxPage() {
  const [leads, setLeads] = useState<CapturedLead[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    setLeads(loadLeads());
    setLoaded(true);
  }, []);

  return (
    <div className="funnel-step funnel-leads-page">
      <h1 className="funnel-title">Leads</h1>
      <p className="funnel-copy">
        Everyone who submitted a published funnel, newest first.
      </p>

      {loaded && leads.length === 0 ? (
        <div className="funnel-leads-empty">
          <p>No leads yet.</p>
          <p className="funnel-copy">
            Publish your funnel, then share the link — submissions will show
            up here.
          </p>
          <Link href="/build/review" className="btn-solid">
            Go to publish
          </Link>
        </div>
      ) : (
        <ul className="funnel-leads-list">
          {leads.map((lead) => (
            <li key={lead.id} className="funnel-lead-row">
              <div className="funnel-lead-row-top">
                <span className="funnel-lead-name">{lead.name || "Unnamed lead"}</span>
                <span className="funnel-lead-when">{formatWhen(lead.createdAt)}</span>
              </div>
              <div className="funnel-lead-contacts">
                {lead.phone ? <span>{lead.phone}</span> : null}
                {lead.email ? <span>{lead.email}</span> : null}
                {lead.zip ? <span>ZIP {lead.zip}</span> : null}
              </div>
              {lead.answers.length ? (
                <dl className="funnel-lead-answers">
                  {lead.answers.map((a) => (
                    <div key={a.questionId}>
                      <dt>{a.question}</dt>
                      <dd>{a.answer}</dd>
                    </div>
                  ))}
                </dl>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
