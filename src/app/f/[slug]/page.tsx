"use client";

import { use, useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import { addLead, getPublishedFunnel } from "@/lib/funnel/store";
import type { LeadGenFunnelDraft } from "@/lib/funnel/types";

export default function PublicFunnelPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = use(params);
  const [funnel, setFunnel] = useState<LeadGenFunnelDraft | null | "loading">(
    "loading",
  );
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [zip, setZip] = useState("");
  const [submitted, setSubmitted] = useState(false);

  useEffect(() => {
    setFunnel(getPublishedFunnel(slug));
  }, [slug]);

  if (funnel === "loading") {
    return <div className="public-funnel-loading">Loading…</div>;
  }

  if (!funnel) {
    return (
      <div className="public-funnel-missing">
        <p className="brand-name">RouteCraft</p>
        <h1>This funnel isn&apos;t published (yet).</h1>
        <p>The link may be wrong, or the funnel hasn&apos;t been published in this browser.</p>
        <Link href="/build">Build a funnel</Link>
      </div>
    );
  }

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!funnel || funnel === "loading") return;
    addLead({
      slug,
      name,
      phone,
      email,
      zip,
      answers: funnel.questions.map((q) => ({
        questionId: q.id,
        question: q.label,
        answer: answers[q.id] ?? "",
      })),
    });
    setSubmitted(true);
  }

  const { business, offer, questions, contactFields, thankYou } = funnel;

  return (
    <div className="public-funnel">
      <div className="public-funnel-card">
        {submitted ? (
          <div className="public-funnel-thanks">
            <h1>{thankYou.message}</h1>
            {thankYou.timeframe ? <p>{thankYou.timeframe}</p> : null}
          </div>
        ) : (
          <>
            <p className="public-funnel-brand">{business.name}</p>
            <h1>{offer.headline}</h1>
            {offer.subheading ? <p className="public-funnel-sub">{offer.subheading}</p> : null}

            <form className="public-funnel-form" onSubmit={onSubmit}>
              {contactFields.name ? (
                <label className="funnel-field">
                  <span>Name</span>
                  <input value={name} onChange={(e) => setName(e.target.value)} required autoFocus />
                </label>
              ) : null}
              {contactFields.phone ? (
                <label className="funnel-field">
                  <span>Phone</span>
                  <input
                    type="tel"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    required
                  />
                </label>
              ) : null}
              {contactFields.email ? (
                <label className="funnel-field">
                  <span>Email</span>
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                  />
                </label>
              ) : null}
              {contactFields.zip ? (
                <label className="funnel-field">
                  <span>Zip code</span>
                  <input value={zip} onChange={(e) => setZip(e.target.value)} required />
                </label>
              ) : null}

              {questions.map((q) => (
                <label className="funnel-field" key={q.id}>
                  <span>{q.label}</span>
                  <input
                    value={answers[q.id] ?? ""}
                    onChange={(e) =>
                      setAnswers((prev) => ({ ...prev, [q.id]: e.target.value }))
                    }
                  />
                </label>
              ))}

              <button type="submit" className="funnel-continue public-funnel-submit">
                {offer.ctaLabel}
              </button>
            </form>
          </>
        )}
      </div>
    </div>
  );
}
