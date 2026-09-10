"use client";

import { useCallback, useEffect, useRef, useState, type FormEvent, type RefObject } from "react";
import Link from "next/link";
import { dashHref } from "@/lib/workspaceNav";
import { newGrowthData, type GrowthData, type GrowthRecord } from "@/lib/growth";
import { readMediaFile } from "@/lib/store";
import { storyDateLabel, titleStyleHint, voiceOpener, type StoryTemplate } from "@/lib/storytelling";
import { IconX } from "@/components/shared/Icons";

export function StoryCasesPanel({
  slug,
  template,
}: {
  slug: string;
  template: StoryTemplate;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [records, setRecords] = useState<GrowthRecord[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState("");
  const [selectedId, setSelectedId] = useState("");
  const [creating, setCreating] = useState(false);
  const [notice, setNotice] = useState("");
  const [draft, setDraft] = useState<GrowthData | null>(null);
  const load = useCallback(async () => {
    try {
      const response = await fetch(`/api/spaces/${encodeURIComponent(slug)}/growth`, { cache: "no-store" });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Could not load stories.");
      setRecords(result);
      setLoaded(true);
      setError("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load stories.");
    }
  }, [slug]);
  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  const stories = records.filter((record) => record.kind === "story");
  const selected = stories.find((record) => record.id === selectedId) ?? (creating ? undefined : stories[0]);
  const writing = creating || Boolean(selected);
  const data = draft ?? (creating ? { ...newGrowthData("story"), description: voiceOpener(template.voice) } : selected?.data);

  async function save(next: GrowthData, record?: GrowthRecord) {
    const response = await fetch(`/api/spaces/${encodeURIComponent(slug)}/growth`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: record?.id, version: record?.version, kind: "story", data: next }),
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || "Could not save.");
    setRecords((all) => [result, ...all.filter((item) => item.id !== result.id)]);
    setSelectedId(result.id);
    setCreating(false);
    setDraft(null);
    setNotice(next.status === "published" ? "Published." : "Saved.");
  }

  function startNew() {
    setCreating(true);
    setSelectedId("");
    setDraft({ ...newGrowthData("story"), description: voiceOpener(template.voice) });
    setNotice("");
  }

  return (
    <div className="story-studio">
      <aside className="story-studio-rail">
        <div className="story-studio-rail-head">
          <div>
            <p className="dashboard-kicker">Stories</p>
            <h2>Posts</h2>
          </div>
          <button className="btn-solid" disabled={!loaded} onClick={startNew}>New post</button>
        </div>
        <p className="floor-settings-help">
          Write like a publication. Customers read and search these the same way.{" "}
          <Link href={dashHref(slug, "tools:storytelling")}>Template</Link>
        </p>
        {error ? <p className="editor-error" role="alert">{error} <button className="btn-ghost" onClick={() => void load()}>Retry</button></p> : null}
        <p className="growth-notice" role="status">{notice}</p>
        {!loaded && !error ? <p>Loading…</p> : null}
        {loaded && !stories.length ? (
          <p className="story-studio-empty">No posts yet. Start with a job you already finished.</p>
        ) : (
          <ul className="story-studio-list">
            {stories.map((record) => (
              <li key={record.id}>
                <button
                  type="button"
                  className={!creating && selected?.id === record.id ? "is-active" : undefined}
                  onClick={() => {
                    setSelectedId(record.id);
                    setCreating(false);
                    setDraft(null);
                    setNotice("");
                  }}
                >
                  <strong>{record.data.title || "Untitled"}</strong>
                  <span>
                    {record.data.status === "published" ? "Published" : "Draft"}
                    {record.data.date ? ` · ${storyDateLabel(record.data.date)}` : ""}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </aside>
      <div className="story-studio-page">
        {writing && data ? (
          <StoryEditor
            key={creating ? "new" : `${selected?.id}-${selected?.version}`}
            slug={slug}
            template={template}
            record={creating ? undefined : selected}
            data={data}
            fileRef={fileRef}
            onChange={setDraft}
            onSave={(next) => save(next, creating ? undefined : selected)}
            onCancel={creating ? () => { setCreating(false); setDraft(null); } : undefined}
          />
        ) : (
          <div className="story-studio-blank">
            <h2>Write the next post</h2>
            <p>Open a draft from the left, or start a new one. You write in the same layout customers read.</p>
            <button className="btn-solid" disabled={!loaded} onClick={startNew}>New post</button>
          </div>
        )}
      </div>
    </div>
  );
}

function StoryEditor({
  slug,
  template,
  record,
  data,
  fileRef,
  onChange,
  onSave,
  onCancel,
}: {
  slug: string;
  template: StoryTemplate;
  record?: GrowthRecord;
  data: GrowthData;
  fileRef: RefObject<HTMLInputElement | null>;
  onChange: (data: GrowthData) => void;
  onSave: (data: GrowthData) => Promise<void>;
  onCancel?: () => void;
}) {
  const [saving, setSaving] = useState(false);
  const [busyPhoto, setBusyPhoto] = useState(false);
  const [error, setError] = useState("");
  function patch(next: Partial<GrowthData>) {
    onChange({ ...data, ...next });
  }
  async function submit(event: FormEvent, status: GrowthData["status"]) {
    event.preventDefault();
    setSaving(true);
    setError("");
    try {
      await onSave({ ...data, status });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save.");
    } finally {
      setSaving(false);
    }
  }
  async function addPhotos(files: FileList | null) {
    if (!files?.length) return;
    const remaining = 6 - data.photos.length;
    if (remaining <= 0) return;
    setBusyPhoto(true);
    setError("");
    try {
      const added: string[] = [];
      for (const file of Array.from(files).slice(0, remaining)) {
        const media = await readMediaFile(file, { imageMaxSize: 1200, imageQuality: 0.78 });
        if (media.kind !== "photo") throw new Error("Use photos for stories.");
        added.push(media.url);
      }
      patch({ photos: [...data.photos, ...added] });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not add photos.");
    } finally {
      setBusyPhoto(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }
  const cover = data.photos[0];
  return (
    <form className="story-doc" onSubmit={(event) => void submit(event, data.status === "published" ? "published" : "draft")}>
      <div className="story-doc-bar">
        <span className={`story-doc-state is-${data.status === "published" ? "live" : "draft"}`}>
          {data.status === "published" ? "Published" : "Draft"}
        </span>
        <div className="story-doc-actions">
          {onCancel ? <button className="btn-ghost" type="button" onClick={onCancel}>Cancel</button> : null}
          <button className="btn-ghost" type="submit" disabled={saving}>{saving ? "Saving…" : "Save"}</button>
          <button className="btn-solid" type="button" disabled={saving} onClick={(event) => void submit(event, "published")}>Publish</button>
          {data.status === "published" ? (
            <button className="btn-ghost" type="button" disabled={saving} onClick={(event) => void submit(event, "draft")}>Unpublish</button>
          ) : null}
        </div>
      </div>
      <div className="story-doc-canvas">
        <input ref={fileRef} type="file" accept="image/*" multiple className="sr-only" id="story-photos" onChange={(e) => void addPhotos(e.target.files)} />
        {cover ? (
          <div className="story-doc-cover">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={cover} alt="" />
            <button type="button" className="btn-ghost" onClick={() => patch({ photos: data.photos.slice(1) })}>
              <IconX /> Remove cover
            </button>
          </div>
        ) : (
          <label htmlFor="story-photos" className="story-doc-cover is-empty">
            {busyPhoto ? "Adding photo…" : "Add a cover photo"}
          </label>
        )}
        <p className="story-post-kicker">{template.eyebrow}</p>
        <textarea
          className="story-doc-title"
          required
          rows={2}
          maxLength={200}
          placeholder="Title"
          value={data.title}
          onChange={(e) => patch({ title: e.target.value })}
        />
        <p className="floor-settings-help">{titleStyleHint(template.titleStyle)}</p>
        <textarea
          className="story-doc-dek"
          rows={2}
          maxLength={3000}
          placeholder="Subtitle"
          value={data.description}
          onChange={(e) => patch({ description: e.target.value })}
        />
        <div className="story-doc-meta">
          {template.showDate ? (
            <label>
              <span>Date</span>
              <input type="date" value={data.date} onChange={(e) => patch({ date: e.target.value })} />
            </label>
          ) : null}
          <label>
            <span>Search keywords</span>
            <input
              value={data.tags.join(", ")}
              placeholder="ac, leak, kitchen"
              onChange={(e) => patch({
                tags: e.target.value.split(",").map((tag) => tag.trim()).filter(Boolean).slice(0, 8),
              })}
            />
          </label>
        </div>
        {template.sections.map((section) => (
          <section key={section.id} className="story-doc-section">
            <h2>{section.label}{section.required ? "" : " (optional)"}</h2>
            <textarea
              rows={7}
              maxLength={12000}
              placeholder={section.prompt || "Write this part…"}
              value={data.chapters[section.id] ?? ""}
              onChange={(e) => patch({ chapters: { ...data.chapters, [section.id]: e.target.value } })}
            />
          </section>
        ))}
        {data.photos.length > 1 ? (
          <div className="story-photo-grid">
            {data.photos.slice(1).map((url, index) => (
              <div key={`${index}-${url.slice(0, 24)}`} className="story-photo-slot">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={url} alt={template.photoStyle === "beforeAfter" && index < 1 ? "After" : `Photo ${index + 2}`} />
                {template.photoStyle === "beforeAfter" && index === 0 ? <span>After</span> : null}
                <button type="button" className="btn-ghost icon-btn" aria-label="Remove photo" onClick={() => patch({ photos: data.photos.filter((_, i) => i !== index + 1) })}>
                  <IconX />
                </button>
              </div>
            ))}
          </div>
        ) : null}
        {data.photos.length < 6 ? (
          <label htmlFor="story-photos" className="story-doc-add-photo">
            {busyPhoto ? "Adding…" : template.photoStyle === "beforeAfter" && data.photos.length === 1 ? "Add the after photo" : "Add more photos"}
          </label>
        ) : null}
        {record?.data.status === "published" ? (
          <p className="story-doc-share">
            Live at <a href={`/${slug}/story/${record.id}`} target="_blank" rel="noreferrer">{`/${slug}/story/${record.id}`}</a>
            {" · "}
            <a href={`/${slug}/stories`} target="_blank" rel="noreferrer">Publication page</a>
          </p>
        ) : null}
        {error ? <p className="editor-error" role="alert">{error}</p> : null}
      </div>
    </form>
  );
}
