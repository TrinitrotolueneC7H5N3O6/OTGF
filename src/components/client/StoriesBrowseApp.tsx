"use client";

import { useEffect, useMemo, useRef, useState, type TouchEvent } from "react";
import { GrowthStory } from "./StoryPresentation";
import { PostByline } from "./StoryByline";
import { IconArrowUpRight, IconX } from "@/components/shared/Icons";
import styles from "./StoriesBrowseApp.module.css";
import {
  defaultStoryTemplate,
  isPhotoStory,
  matchStorySearch,
  normalizeStoryTemplate,
  storyCaption,
  type StoryOutput,
  storyHaystack,
  type StoryTemplate,
} from "@/lib/storytelling";

export type BrowseStory = {
  id: string;
  title: string;
  date: string;
  tags: string[];
  excerpt: string;
  photo: string;
  photos: string[];
  description: string;
  chapters: Record<string, string>;
  challenge: string;
  process: string;
  outcome: string;
};

export function StoriesBrowseApp({
  slug,
  embedded = false,
  output = "website",
}: {
  slug: string;
  embedded?: boolean;
  output?: StoryOutput;
}) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [business, setBusiness] = useState("");
  const [template, setTemplate] = useState<StoryTemplate>(defaultStoryTemplate());
  const [stories, setStories] = useState<BrowseStory[]>([]);

  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const response = await fetch(`/api/spaces/${encodeURIComponent(slug)}/stories`, { cache: "no-store" });
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
    return () => {
      active = false;
    };
  }, [slug]);

  return <StoriesCollection slug={slug} embedded={embedded} output={output} business={business} template={template} stories={stories} loading={loading} error={error} />;
}

export function StoriesCollection({ slug, embedded = false, output = "website", business, template, stories, loading = false, error = "" }: {
  slug: string;
  embedded?: boolean;
  output?: StoryOutput;
  business: string;
  template: StoryTemplate;
  stories: BrowseStory[];
  loading?: boolean;
  error?: string;
}) {
  const [query, setQuery] = useState("");
  const [tag, setTag] = useState("");
  const [openId, setOpenId] = useState("");
  const viewerRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const swipe = useRef<{ x: number; y: number } | null>(null);
  const carouselRef = useRef<HTMLUListElement>(null);
  const carousel = output === "carousel";
  const photoHome = isPhotoStory(template);
  const tags = useMemo(() => {
    const counts = new Map<string, number>();
    for (const story of stories) {
      for (const item of story.tags) counts.set(item, (counts.get(item) ?? 0) + 1);
    }
    return [...counts].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map(([name]) => name);
  }, [stories]);

  const visible = useMemo(() => {
    return stories.filter((story) => {
      if (tag && !story.tags.includes(tag)) return false;
      if (!query.trim()) return true;
      return matchStorySearch(
        storyHaystack({
          title: story.title,
          description: story.description,
          tags: story.tags,
          chapters: story.chapters,
        }),
        query,
      );
    });
  }, [query, stories, tag]);

  const openIndex = visible.findIndex((story) => story.id === openId);
  const open = openIndex >= 0 ? visible[openIndex] : null;

  function step(delta: number) {
    if (!visible.length) return;
    const from = openIndex < 0 ? 0 : openIndex;
    setOpenId(visible[(from + delta + visible.length) % visible.length].id);
  }

  useEffect(() => {
    if (!open) return;
    const previousFocus = document.activeElement as HTMLElement | null;
    closeRef.current?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        setOpenId("");
      }
      if (event.key === "Tab") {
        const controls = viewerRef.current?.querySelectorAll<HTMLElement>('button:not([disabled]), [tabindex="0"], a[href]');
        if (controls?.length) {
          const first = controls[0];
          const last = controls[controls.length - 1];
          if (event.shiftKey && document.activeElement === first) {
            event.preventDefault();
            last.focus();
          } else if (!event.shiftKey && document.activeElement === last) {
            event.preventDefault();
            first.focus();
          }
        }
      }
      if ((event.target as HTMLElement).closest('[role="slider"], [data-story-gallery]')) return;
      if (event.key === "ArrowRight" || event.key === "ArrowLeft") {
        const delta = event.key === "ArrowRight" ? 1 : -1;
        const from = openIndex < 0 ? 0 : openIndex;
        setOpenId(visible[(from + delta + visible.length) % visible.length].id);
      }
    };
    window.addEventListener("keydown", onKey);
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = previous;
      previousFocus?.focus();
    };
  }, [open, openIndex, visible]);

  function onSwipeStart(event: TouchEvent) {
    if ((event.target as HTMLElement).closest(".story-compare, [data-story-gallery]")) return;
    const touch = event.changedTouches[0];
    swipe.current = { x: touch.clientX, y: touch.clientY };
  }

  function onSwipeEnd(event: TouchEvent) {
    const start = swipe.current;
    swipe.current = null;
    const touch = event.changedTouches[0];
    if (!start) return;
    const dx = touch.clientX - start.x;
    const dy = touch.clientY - start.y;
    if (Math.abs(dx) < 56 || Math.abs(dx) < Math.abs(dy)) return;
    step(dx < 0 ? 1 : -1);
  }

  return (
    <main className={`${styles.feed} ${carousel ? styles.carousel : styles[template.listLayout]} story-pub stories-home${photoHome ? " is-photo" : " is-writing"}${embedded ? " is-embedded" : ""}`}>
      {carousel ? <header className={styles.showcaseHeader}>
        <div><span>Our work</span><h2>Stories from {business || slug}</h2></div>
        {stories.length > 1 ? <div className={styles.showcaseControls}>
          <button type="button" aria-label="Scroll stories left" onClick={() => carouselRef.current?.scrollBy({ left: -320, behavior: "smooth" })}>←</button>
          <button type="button" aria-label="Scroll stories right" onClick={() => carouselRef.current?.scrollBy({ left: 320, behavior: "smooth" })}>→</button>
        </div> : null}
      </header> : <header className="story-pub-bar">
        {embedded ? null : <a href={`/${slug}`}>{business || slug}</a>}
        <label className="story-pub-search">
          <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true"><circle cx="10.5" cy="10.5" r="6.5" /><path d="m16 16 4.5 4.5" /></svg>
          <span className="sr-only">Search stories</span>
          <input
            value={query}
            onChange={(event) => { setQuery(event.target.value); setOpenId(""); }}
            placeholder={template.searchPrompt}
            autoComplete="off"
          />
        </label>
      </header>}
      {!carousel && tags.length > 1 ? (
        <div className="story-chip-row" role="group" aria-label="Filter stories">
          <button type="button" aria-pressed={!tag} className={!tag ? "is-on" : undefined} onClick={() => { setTag(""); setOpenId(""); }}>All</button>
          {tags.map((item) => (
            <button type="button" key={item} aria-pressed={tag === item} className={tag === item ? "is-on" : undefined} onClick={() => { setTag(item); setOpenId(""); }}>
              {item}
            </button>
          ))}
        </div>
      ) : null}
      <div className="story-home-inner">
        {loading ? (
          <ul className={photoHome ? "story-snap-grid" : "story-case-grid"} aria-hidden>
            {Array.from({ length: 6 }, (_, index) => <li key={index} className="story-skel" />)}
          </ul>
        ) : null}
        {error ? <p className="editor-error" role="alert">{error}</p> : null}
        {!loading && !visible.length ? (
          <p className="story-home-empty">{query || tag ? "Nothing in this filter." : "No stories published yet."}</p>
        ) : null}
        {visible.length && photoHome ? (
          <ul ref={carouselRef} className="story-snap-grid">
            {visible.map((story) => (
              <li key={story.id}>
                <StoryTile story={story} business={business} showDate={template.showDate} pair={template.photoStyle === "beforeAfter"} onOpen={() => setOpenId(story.id)} />
              </li>
            ))}
          </ul>
        ) : null}
        {visible.length && !photoHome ? (
          <ul ref={carouselRef} className="story-case-grid">
            {visible.map((story) => (
              <li key={story.id}>
                <button type="button" className="story-case-card" onClick={() => setOpenId(story.id)}>
                  <PostByline business={business} date={template.showDate ? story.date : ""} />
                  {story.photo ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={story.photo} alt="" />
                  ) : null}
                  <div className={styles.copy}>
                    {story.tags[0] ? <span className="story-case-tag">{story.tags[0]}</span> : null}
                    <h2>{story.title}</h2>
                    <p>{story.excerpt}</p>
                  </div>
                  <PostAction label="Read story" />
                </button>
              </li>
            ))}
          </ul>
        ) : null}
      </div>
      {open ? (
        <div
          ref={viewerRef}
          className={`${styles.reader} story-peek${photoHome ? " is-photo" : ""}`}
          role="dialog"
          aria-modal="true"
          aria-label={open.title}
          onTouchStart={onSwipeStart}
          onTouchEnd={onSwipeEnd}
        >
          <div className={styles.readerBar}>
            <button ref={closeRef} type="button" className={styles.back} onClick={() => setOpenId("")}>
              <span aria-hidden="true">←</span> All stories
            </button>
            <div className={styles.readerNav}>
              {visible.length > 1 ? (
                <>
                  <span>{openIndex + 1} of {visible.length}</span>
                  <button type="button" aria-label="Previous story" onClick={() => step(-1)}>←</button>
                  <button type="button" aria-label="Next story" onClick={() => step(1)}>→</button>
                </>
              ) : <span>Our work</span>}
              <button type="button" aria-label="Close story" onClick={() => setOpenId("")}><IconX size={18} /></button>
            </div>
          </div>
          <div key={open.id} className="story-peek-stage">
            <GrowthStory publication={business} template={template} data={open} />
          </div>
        </div>
      ) : null}
    </main>
  );
}

function StoryTile({ story, business, showDate, pair, onOpen }: { story: BrowseStory; business: string; showDate: boolean; pair: boolean; onOpen: () => void }) {
  const photos = story.photos?.length ? story.photos : story.photo ? [story.photo] : [];
  const split = pair && photos.length >= 2;
  const line = storyCaption(story.chapters, story.description) || story.title;
  return (
    <button type="button" className="story-tile" onClick={onOpen} aria-label={story.title}>
      <PostByline business={business} date={showDate ? story.date : ""} />
      <div className={`story-tile-media${split ? " is-split" : ""}`}>
        {split ? (
          <>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={photos[0]} alt="" />
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={photos[1]} alt="" />
            <em>Before</em>
            <strong>After</strong>
          </>
        ) : photos[0] ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={photos[0]} alt="" />
        ) : (
          <span className="story-snap-missing" />
        )}
      </div>
      <div className={styles.copy}>
        {story.tags[0] ? <span className="story-case-tag">{story.tags[0]}</span> : null}
        <h2>{story.title}</h2>
        {line !== story.title ? <p>{line}</p> : null}
      </div>
      <PostAction label="View story" detail={photos.length > 1 ? `${photos.length} photos` : ""} />
    </button>
  );
}


function PostAction({ label, detail }: { label: string; detail?: string }) {
  return (
    <span className={styles.action}>
      <span>{label}<IconArrowUpRight size={16} /></span>
      {detail ? <small>{detail}</small> : null}
    </span>
  );
}

