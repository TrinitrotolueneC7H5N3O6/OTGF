"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import type { GrowthData } from "@/lib/growth";
import {
  defaultStoryTemplate,
  normalizeStoryTemplate,
  storyChapters,
  storyDateLabel,
  voiceOpener,
  type StoryTemplate,
} from "@/lib/storytelling";

export function GrowthStory({
  data,
  template,
  publication,
}: {
  data: Pick<GrowthData, "title" | "description" | "date"> & Partial<Pick<GrowthData, "photos" | "tags" | "chapters" | "challenge" | "process" | "outcome">>;
  template?: StoryTemplate;
  publication?: string;
}) {
  const shape = normalizeStoryTemplate(template ?? defaultStoryTemplate());
  const chapters = storyChapters(data.chapters, data.challenge ?? "", data.process ?? "", data.outcome ?? "");
  const photos = data.photos ?? [];
  const intro = (data.description || "").trim() || voiceOpener(shape.voice);
  const beforeAfter = shape.photoStyle === "beforeAfter" && photos.length >= 2;
  const cover = !beforeAfter && photos[0] ? photos[0] : "";
  const rest = beforeAfter ? photos.slice(2) : photos.slice(1);
  const dateLabel = shape.showDate ? storyDateLabel(data.date) : "";
  return (
    <article className="story-post">
      {cover ? (
        <div className="story-post-cover">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={cover} alt="" />
        </div>
      ) : null}
      <div className="story-post-body">
        {shape.eyebrow ? <p className="story-post-kicker">{shape.eyebrow}</p> : null}
        <h1 className="story-post-title">{data.title || "Untitled"}</h1>
        {intro ? <p className="story-post-dek">{intro}</p> : null}
        <p className="story-post-byline">
          {publication ? <span>{publication}</span> : null}
          {publication && dateLabel ? <span aria-hidden>·</span> : null}
          {dateLabel ? <time dateTime={data.date}>{dateLabel}</time> : null}
        </p>
        {beforeAfter ? (
          <div className="story-before-after">
            <figure>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={photos[0]} alt="Before" />
              <figcaption>Before</figcaption>
            </figure>
            <figure>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={photos[1]} alt="After" />
              <figcaption>After</figcaption>
            </figure>
          </div>
        ) : null}
        {shape.sections.map((section) => {
          const text = chapters[section.id]?.trim();
          if (!text && !section.required) return null;
          return (
            <section key={section.id} className="story-post-section">
              <h2>{section.label}</h2>
              <p>{text || "This part is still being written."}</p>
            </section>
          );
        })}
        {rest.length ? (
          <div className={`story-photo-row${rest.length === 1 ? " is-single" : ""}`}>
            {rest.map((url, index) => (
              // eslint-disable-next-line @next/next/no-img-element
              <img key={`${index}-${url.slice(0, 16)}`} src={url} alt="" />
            ))}
          </div>
        ) : null}
      </div>
    </article>
  );
}

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

export function StoriesBrowseApp({ slug }: { slug: string }) {
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [business, setBusiness] = useState("");
  const [template, setTemplate] = useState<StoryTemplate>(defaultStoryTemplate());
  const [stories, setStories] = useState<Array<{
    id: string;
    title: string;
    date: string;
    tags: string[];
    excerpt: string;
    photo: string;
  }>>([]);

  useEffect(() => {
    let active = true;
    const timer = window.setTimeout(() => {
      void (async () => {
        try {
          const response = await fetch(`/api/spaces/${encodeURIComponent(slug)}/stories?q=${encodeURIComponent(query)}`, { cache: "no-store" });
          const result = await response.json();
          if (!response.ok) throw new Error(result.error || "Could not load stories.");
          if (!active) return;
          setBusiness(result.business);
          setTemplate(normalizeStoryTemplate(result.template));
          setStories(result.stories);
          setError("");
        } catch (err) {
          if (active) setError(err instanceof Error ? err.message : "Could not load stories.");
        } finally {
          if (active) setLoading(false);
        }
      })();
    }, query ? 200 : 0);
    return () => {
      active = false;
      window.clearTimeout(timer);
    };
  }, [query, slug]);

  const featured = !query && stories[0] ? stories[0] : null;
  const rest = featured ? stories.slice(1) : stories;
  const empty = useMemo(() => !loading && !stories.length, [loading, stories.length]);

  return (
    <main className="story-pub stories-home">
      <header className="story-pub-bar">
        <a href={`/${slug}`}>{business || "Home"}</a>
        <label className="story-pub-search">
          <span className="sr-only">Search stories</span>
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={template.searchPrompt}
            autoComplete="off"
          />
        </label>
      </header>
      <div className="story-home-inner">
        <p className="story-post-kicker">{template.eyebrow}</p>
        <h1 className="story-home-name">{business || "Stories"}</h1>
        <p className="story-home-lede">Finished work, written so you can see if we&apos;ve handled something like yours.</p>
        {loading ? <p className="story-pub-status">Loading…</p> : null}
        {error ? <p className="editor-error" role="alert">{error}</p> : null}
        {empty ? (
          <p className="story-home-empty">{query ? "No stories matched that. Try a simpler word." : "No stories published yet."}</p>
        ) : null}
        {featured ? (
          <a className="story-feature" href={`/${slug}/story/${featured.id}`}>
            {featured.photo ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={featured.photo} alt="" />
            ) : null}
            <div>
              {featured.date ? <time>{storyDateLabel(featured.date)}</time> : null}
              <h2>{featured.title}</h2>
              <p>{featured.excerpt}</p>
            </div>
          </a>
        ) : null}
        {rest.length ? (
          <ul className="story-feed">
            {rest.map((story) => (
              <li key={story.id}>
                <a href={`/${slug}/story/${story.id}`}>
                  <div>
                    {story.date ? <time>{storyDateLabel(story.date)}</time> : null}
                    <h2>{story.title}</h2>
                    <p>{story.excerpt}</p>
                  </div>
                  {story.photo ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={story.photo} alt="" />
                  ) : null}
                </a>
              </li>
            ))}
          </ul>
        ) : null}
      </div>
    </main>
  );
}
