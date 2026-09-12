"use client";

import { useEffect, useState, type FormEvent } from "react";
import type { StoryTemplate } from "@/lib/storytelling";
import { GrowthStory } from "./StoryPresentation";
export { GrowthStory } from "./StoryPresentation";

interface PublicData {
  kind: string;
  slug: string;
  business: string;
  title: string;
  description: string;
  partner?: string;
  challenge?: string;
  process?: string;
  outcome?: string;
  date?: string;
  photos?: string[];
  tags?: string[];
  chapters?: Record<string, string>;
  template?: StoryTemplate;
}

export function GrowthPublicApp({slug,id,story=false}: {slug: string; id: string; story?: boolean}) {
  const [data,setData] = useState<PublicData | null>(null);
  const [error,setError] = useState("");
  const [sent,setSent] = useState(false);
  const [busy,setBusy] = useState(false);
  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const response = await fetch(`/api/growth/${encodeURIComponent(id)}`,{cache:"no-store"});
        const result = await response.json();
        if (!response.ok || result.slug !== slug || (story ? result.kind !== "story" : result.kind !== "partner")) throw new Error("This page is unavailable.");
        if (active) setData(result);
        void fetch(`/api/growth/${encodeURIComponent(id)}`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({action:"visit"})}).catch(() => undefined);
      } catch (err) {if (active) setError(err instanceof Error ? err.message : "Could not load page.");}
    })();
    return () => {active=false;};
  },[id,slug,story]);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setError("");
    const form = new FormData(event.currentTarget);
    try {
      const response = await fetch(`/api/growth/${encodeURIComponent(id)}`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({action:"lead",name:form.get("name"),email:form.get("email"),message:form.get("message")})});
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Could not send.");
      setSent(true);
    } catch (err) {setError(err instanceof Error ? err.message : "Could not send.");} finally {setBusy(false);}
  }
  if (story) {
    return (
      <main className="story-pub">
        <header className="story-pub-bar">
          <a href={`/${slug}`}>{data?.business || "Home"}</a>
          <a href={`/${slug}/stories`}>Archive</a>
        </header>
        {data ? (
          <GrowthStory
            publication={data.business}
            template={data.template}
            data={{
              ...data,
              challenge: data.challenge ?? "",
              process: data.process ?? "",
              outcome: data.outcome ?? "",
              date: data.date ?? "",
              photos: data.photos ?? [],
              tags: data.tags ?? [],
              chapters: data.chapters ?? {},
            }}
          />
        ) : !error ? <p className="story-pub-status">Loading…</p> : null}
        {error ? <p className="editor-error story-pub-status" role="alert">{error}</p> : null}
      </main>
    );
  }
  return <main className="growth-public"><div className="growth-public-card">{data ? <><a className="growth-business" href={`/${slug}`}>{data.business}</a><span className="growth-eyebrow">Referred by {data.partner}</span><h1>{data.title}</h1><p className="growth-story-intro">{data.description}</p>{sent ? <div role="status" className="growth-reward"><h2>Thank you for reaching out</h2><p>Your details have been sent to {data.business}, with {data.partner} recorded as your referrer.</p></div> : <form className="growth-editor" onSubmit={(e) => void submit(e)}><label className="floor-settings-note"><span>Your name</span><input name="name" autoComplete="name" maxLength={200} required /></label><label className="floor-settings-note"><span>Email</span><input name="email" type="email" autoComplete="email" maxLength={200} required /></label><label className="floor-settings-note"><span>How can we help?</span><textarea name="message" rows={4} maxLength={3000} /></label><p className="floor-settings-help">Your details will be shared with {data.business} so they can follow up. Your referral will be attributed to {data.partner}.</p><button className="btn-solid" disabled={busy}>{busy ? "Sending…" : "Send request"}</button></form>}</> : !error ? <p>Loading…</p> : null}{error ? <p className="editor-error" role="alert">{error}</p> : null}</div></main>;
}
