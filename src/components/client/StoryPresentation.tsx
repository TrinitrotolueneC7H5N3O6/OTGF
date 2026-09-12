"use client";

import { useEffect, useRef, useState } from "react";
import type { GrowthData } from "@/lib/growth";
import { defaultStoryTemplate, isPhotoStory, normalizeStoryTemplate, storyCaption, storyChapters, storyDateLabel, voiceOpener, type StoryTemplate } from "@/lib/storytelling";
import { PostByline } from "./StoryByline";
import styles from "./StoriesBrowseApp.module.css";

type StoryData = Pick<GrowthData, "title" | "description" | "date"> & Partial<Pick<GrowthData, "photos" | "tags" | "chapters" | "challenge" | "process" | "outcome">>;
type PhotoStoryData = StoryData & { photos: string[]; tags: string[]; chapters: Record<string, string> };

export function GrowthStory({ data, template, publication = "" }: { data: StoryData; template?: StoryTemplate; publication?: string }) {
  const shape = normalizeStoryTemplate(template ?? defaultStoryTemplate());
  return <div className={styles.feed}><div className={styles.reader}>
    {isPhotoStory(shape) ? <PhotoPeek key={`${shape.photoStyle}-${data.title}`} story={{ ...data, photos: data.photos ?? [], tags: data.tags ?? [], chapters: storyChapters(data.chapters, data.challenge ?? "", data.process ?? "", data.outcome ?? "") }} template={shape} business={publication} /> : <WrittenStory data={data} template={shape} publication={publication} />}
  </div></div>;
}

function WrittenStory({
  data,
  template,
  publication,
}: {
  data: Pick<GrowthData, "title" | "description" | "date"> & Partial<Pick<GrowthData, "photos" | "tags" | "chapters" | "challenge" | "process" | "outcome">>;
  template?: StoryTemplate;
  publication?: string;
}) {
  const shape = normalizeStoryTemplate(template ?? defaultStoryTemplate());
  const photo = isPhotoStory(shape);
  const chapters = storyChapters(data.chapters, data.challenge ?? "", data.process ?? "", data.outcome ?? "");
  const photos = data.photos ?? [];
  const caption = storyCaption(chapters, data.description || "");
  const intro = photo ? caption : ((data.description || "").trim() || voiceOpener(shape.voice));
  const beforeAfter = shape.photoStyle === "beforeAfter" && photos.length >= 2;
  const cover = !beforeAfter && photos[0] ? photos[0] : "";
  const rest = beforeAfter ? photos.slice(2) : photos.slice(1);
  const dateLabel = shape.showDate ? storyDateLabel(data.date) : "";
  const titleIsCaption = photo && data.title && caption && (caption.startsWith(data.title) || data.title.startsWith(caption.slice(0, 24)));
  return (
    <article className={`story-post${photo ? " is-snap" : ""}`}>
      {cover ? (
        <div className="story-post-cover">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={cover} alt="" />
        </div>
      ) : null}
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
      <div className="story-post-body">
        {shape.eyebrow ? <p className="story-post-kicker">{shape.eyebrow}</p> : null}
        {!titleIsCaption ? <h1 className="story-post-title">{data.title || "Untitled"}</h1> : null}
        {intro ? <p className="story-post-dek">{intro}</p> : null}
        <p className="story-post-byline">
          {publication ? <span>{publication}</span> : null}
          {publication && dateLabel ? <span aria-hidden>·</span> : null}
          {dateLabel ? <time dateTime={data.date}>{dateLabel}</time> : null}
        </p>
        {photo ? null : shape.sections.map((section) => {
          const text = chapters[section.id]?.trim();
          if (!text) return null;
          return (
            <section key={section.id} className="story-post-section">
              <h2>{section.label}</h2>
              <p>{text}</p>
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

function PhotoPeek({ story, template, business }: { story: PhotoStoryData; template: StoryTemplate; business: string }) {
  const photos = story.photos;
  const pair = template.photoStyle === "beforeAfter" && photos.length >= 2;
  const caption = storyCaption(story.chapters, story.description);
  const [selected, setSelected] = useState(pair ? -1 : 0);
  const photoLabel = (index: number) => pair && index < 2 ? (index === 0 ? "Before" : "After") : `Photo ${index + 1}`;
  return (
    <article className={styles.photoStory}>
      <header className={styles.storyHeading}>
        <span className={styles.eyebrow}>{template.eyebrow || "From our work"}</span>
        <h1>{story.title}</h1>
        {caption ? <p className={styles.storyIntro}>{caption}</p> : null}
        <PostByline business={business} date={template.showDate ? story.date : ""} />
      </header>
      {photos.length ? (
        <section className={styles.gallery} aria-label="Story photos" data-story-gallery>
          <figure className={styles.hero}>
            {selected === -1 ? (
              <CompareSlider before={photos[0]} after={photos[1]} />
            ) : (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={photos[selected]} alt={`${story.title} — ${photoLabel(selected)}`} />
            )}
            <figcaption>
              <strong>{selected === -1 ? "Before & after" : photoLabel(selected)}</strong>
              <span>{selected === -1 ? "Drag the handle to compare" : `${selected + 1} / ${photos.length}`}</span>
            </figcaption>
          </figure>
          {photos.length > 1 ? (
            <div className={styles.thumbnails} aria-label="Choose a photo">
              {pair ? (
                <button type="button" className={styles.compareThumb} aria-pressed={selected === -1} onClick={() => setSelected(-1)}>
                  <span aria-hidden="true">↔</span><span>Compare</span>
                </button>
              ) : null}
              {photos.map((url, index) => (
                <button key={`${index}-${url.slice(0, 16)}`} type="button" aria-label={`Show ${photoLabel(index).toLowerCase()}`} aria-pressed={selected === index} onClick={() => setSelected(index)}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={url} alt="" />
                  <span>{photoLabel(index)}</span>
                </button>
              ))}
            </div>
          ) : null}
        </section>
      ) : null}
      <div className={styles.storyBody}>
        {story.tags.length ? <ul className={styles.storyTags} aria-label="Topics">{story.tags.map((tag) => <li key={tag}>{tag}</li>)}</ul> : null}
      </div>
    </article>
  );
}

function CompareSlider({ before, after }: { before: string; after: string }) {
  const frame = useRef<HTMLDivElement>(null);
  const [amount, setAmount] = useState(52);
  const [width, setWidth] = useState(0);

  useEffect(() => {
    const node = frame.current;
    if (!node) return;
    const sync = () => setWidth(node.clientWidth);
    sync();
    const observer = new ResizeObserver(sync);
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  function move(clientX: number) {
    const box = frame.current?.getBoundingClientRect();
    if (!box) return;
    setAmount(Math.min(96, Math.max(4, ((clientX - box.left) / box.width) * 100)));
  }

  return (
    <div
      ref={frame}
      className="story-compare"
      role="slider"
      aria-label="Drag to compare before and after"
      aria-valuemin={4}
      aria-valuemax={96}
      aria-valuetext={`${Math.round(amount)}% before, ${100 - Math.round(amount)}% after`}
      aria-valuenow={Math.round(amount)}
      tabIndex={0}
      onPointerDown={(event) => {
        event.currentTarget.setPointerCapture(event.pointerId);
        move(event.clientX);
      }}
      onPointerMove={(event) => {
        if (event.buttons) move(event.clientX);
      }}
      onKeyDown={(event) => {
        if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
        event.preventDefault();
        event.stopPropagation();
        if (event.key === "ArrowLeft") setAmount((value) => Math.max(4, value - 6));
        if (event.key === "ArrowRight") setAmount((value) => Math.min(96, value + 6));
        if (event.key === "Home") setAmount(4);
        if (event.key === "End") setAmount(96);
      }}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={after} alt="After" />
      <div className="story-compare-before" style={{ width: `${amount}%` }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={before} alt="Before" style={{ width }} />
      </div>
      <div className="story-compare-line" style={{ left: `${amount}%` }} />
      <span className="story-compare-label is-before">Before</span>
      <span className="story-compare-label is-after">After</span>
    </div>
  );
}
