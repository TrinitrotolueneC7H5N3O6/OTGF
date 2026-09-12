"use client";

import { useRef, useState, type FormEvent, type RefObject } from "react";
import { newGrowthData, type GrowthData, type GrowthRecord } from "@/lib/growth";
import { readMediaFile } from "@/lib/store";
import { storyDateLabel, titleStyleHint, voiceOpener, isPhotoStory, storyCaption, storyTitleFromCaption, type StoryTemplate } from "@/lib/storytelling";
import { IconX } from "@/components/shared/Icons";

export function StoryCasesPanel({
  slug,
  template,
  records,
  loaded,
  error,
  onReload,
  onRecordSaved,
}: {
  slug: string;
  template: StoryTemplate;
  records: GrowthRecord[];
  loaded: boolean;
  error: string;
  onReload: () => void;
  onRecordSaved: (record: GrowthRecord) => void;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [selectedId, setSelectedId] = useState("");
  const [creating, setCreating] = useState(false);
  const [notice, setNotice] = useState("");
  const [draft, setDraft] = useState<GrowthData | null>(null);

  const stories = records.filter((record) => record.kind === "story");
  const selected = stories.find((record) => record.id === selectedId) ?? (creating ? undefined : stories[0]);
  const writing = creating || Boolean(selected);
  const data = draft ?? (creating ? { ...newGrowthData("story"), description: voiceOpener(template.voice) } : selected?.data);
  const photo = isPhotoStory(template);

  async function save(next: GrowthData, record?: GrowthRecord) {
    const response = await fetch(`/api/spaces/${encodeURIComponent(slug)}/growth`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: record?.id, version: record?.version, kind: "story", data: next }),
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || "Could not save.");
    onRecordSaved(result);
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
    <div className={`forms-manager-shell schedule-settings story-studio${photo ? " is-photo" : ""}`}>
      <div className="dashboard-panel-body forms-manager">
        <div className="schedule-settings-body">
          <aside className="schedule-settings-rail" aria-label="Stories">
            <div className="schedule-settings-rail-head">
              <div>
                <strong>Stories</strong>
                <span>
                  {!loaded ? "Loading…" : stories.length ? `${stories.length} ${stories.length === 1 ? "story" : "stories"}` : "None yet"}
                </span>
              </div>
              <button type="button" className="btn-solid" disabled={!loaded} onClick={startNew}>New</button>
            </div>
            {error ? (
              <p className="editor-error" role="alert">
                {error} <button type="button" className="btn-ghost" onClick={() => void onReload()}>Retry</button>
              </p>
            ) : null}
            {notice ? <p className="growth-notice" role="status">{notice}</p> : null}
            {loaded && !stories.length ? (
              <p className="schedule-settings-rail-empty">{photo ? "New, then add photos from a finished job." : "New, then write up a finished job."}</p>
            ) : (
              <ul className="schedule-settings-events">
                {stories.map((record) => {
                  const active = !creating && selected?.id === record.id;
                  return (
                    <li key={record.id}>
                      <button
                        type="button"
                        className={active ? "is-active" : undefined}
                        aria-current={active ? "true" : undefined}
                        onClick={() => {
                          setSelectedId(record.id);
                          setCreating(false);
                          setDraft(null);
                          setNotice("");
                        }}
                      >
                        <strong>{record.data.title || storyCaption(record.data.chapters, record.data.description).slice(0, 48) || "Untitled"}</strong>
                        <span className="schedule-settings-event-meta">
                          <em>{record.data.status === "published" ? "Published" : "Draft"}</em>
                          {record.data.date ? <em>{storyDateLabel(record.data.date)}</em> : null}
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </aside>
          <section className="schedule-settings-editor" aria-label="Edit story">
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
              <p className="schedule-settings-editor-empty">
                {loaded ? "Pick a story on the left, or start a new one." : "Loading…"}
              </p>
            )}
          </section>
        </div>
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
      const caption = storyCaption(data.chapters, data.description);
      const next = {
        ...data,
        status,
        ...(isPhotoStory(template) && !data.title.trim() && caption
          ? { title: storyTitleFromCaption(caption), description: data.description || caption, chapters: { ...data.chapters, caption } }
          : {}),
      };
      await onSave(next);
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
  const photo = isPhotoStory(template);
  const caption = data.chapters.caption ?? data.description;
  const pair = template.photoStyle === "beforeAfter";
  const extraStart = photo && pair ? 2 : 1;
  return (
    <form className={`story-doc${photo ? " is-snap" : ""}`} onSubmit={(event) => void submit(event, data.status === "published" ? "published" : "draft")}>
      <div className="schedule-settings-editor-bar story-doc-bar">
        <span className={`story-doc-state is-${data.status === "published" ? "live" : "draft"}`}>
          {data.status === "published" ? "Published" : "Draft"}
        </span>
        <div className="story-doc-actions">
          {onCancel ? <button className="btn-ghost" type="button" onClick={onCancel}>Cancel</button> : null}
          <button className="btn-ghost" type="submit" disabled={saving}>{saving ? "Saving…" : "Save"}</button>
          {data.status === "published" ? (
            <button className="btn-ghost" type="button" disabled={saving} onClick={(event) => void submit(event, "draft")}>Unpublish</button>
          ) : null}
          <button className="btn-solid" type="button" disabled={saving} onClick={(event) => void submit(event, "published")}>Publish</button>
        </div>
      </div>
      <div className="schedule-settings-editor-scroll">
        <input ref={fileRef} type="file" accept="image/*" multiple className="sr-only" id="story-photos" onChange={(e) => void addPhotos(e.target.files)} />
        <section className="settings-editor-card">
        {photo ? (
          <>
            {pair ? (
              <div className="story-snap-pair">
                {[0, 1].map((index) => {
                  const url = data.photos[index];
                  const label = index === 0 ? "Before" : "After";
                  return url ? (
                    <div className="story-snap-slot" key={`${label}-${url.slice(0, 24)}`}>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={url} alt={label} />
                      <span>{label}</span>
                      <button type="button" className="btn-ghost icon-btn" aria-label={`Remove ${label.toLowerCase()} photo`} onClick={() => patch({ photos: data.photos.filter((_, i) => i !== index) })}>
                        <IconX />
                      </button>
                    </div>
                  ) : (
                    <label key={label} htmlFor="story-photos" className="story-snap-slot is-empty">
                      {busyPhoto ? "Adding…" : label}
                    </label>
                  );
                })}
              </div>
            ) : cover ? (
              <div className="story-doc-cover">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={cover} alt="" />
                <button type="button" className="btn-ghost icon-btn" aria-label="Remove photo" onClick={() => patch({ photos: data.photos.slice(1) })}>
                  <IconX />
                </button>
              </div>
            ) : (
              <label htmlFor="story-photos" className="story-doc-cover is-empty">
                {busyPhoto ? "Adding photo…" : "Add a photo"}
              </label>
            )}
            {data.photos.length > extraStart ? (
              <div className="story-photo-grid">
                {data.photos.slice(extraStart).map((url, index) => (
                  <div key={`${index}-${url.slice(0, 24)}`} className="story-photo-slot">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={url} alt="" />
                    <button type="button" className="btn-ghost icon-btn" aria-label="Remove photo" onClick={() => patch({ photos: data.photos.filter((_, i) => i !== index + extraStart) })}>
                      <IconX />
                    </button>
                  </div>
                ))}
              </div>
            ) : null}
            {data.photos.length > 0 && data.photos.length < 6 ? (
              <button type="button" className="btn-ghost story-doc-add-btn" disabled={busyPhoto} onClick={() => fileRef.current?.click()}>
                {busyPhoto ? "Adding…" : "Add photo"}
              </button>
            ) : null}
            <label className="floor-settings-note">
              <span>Caption</span>
              <textarea
                rows={4}
                maxLength={800}
                placeholder={template.sections[0]?.prompt || "A few sentences."}
                value={caption}
                onChange={(e) => patch({
                  description: e.target.value,
                  chapters: { ...data.chapters, caption: e.target.value },
                })}
              />
            </label>
            <label className="floor-settings-note">
              <span>Title (optional)</span>
              <input
                maxLength={200}
                placeholder="Uses the first line of the caption if blank"
                value={data.title}
                onChange={(e) => patch({ title: e.target.value })}
              />
            </label>
          </>
        ) : (
          <>
            {cover ? (
              <div className="story-doc-cover">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={cover} alt="" />
                <button type="button" className="btn-ghost icon-btn" aria-label="Remove cover" onClick={() => patch({ photos: data.photos.slice(1) })}>
                  <IconX />
                </button>
              </div>
            ) : null}
            {data.photos.length > 1 ? (
              <div className="story-photo-grid">
                {data.photos.slice(1).map((url, index) => (
                  <div key={`${index}-${url.slice(0, 24)}`} className="story-photo-slot">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={url} alt="" />
                    <button type="button" className="btn-ghost icon-btn" aria-label="Remove photo" onClick={() => patch({ photos: data.photos.filter((_, i) => i !== index + 1) })}>
                      <IconX />
                    </button>
                  </div>
                ))}
              </div>
            ) : null}
            {data.photos.length < 6 ? (
              <button type="button" className="btn-ghost story-doc-add-btn" disabled={busyPhoto} onClick={() => fileRef.current?.click()}>
                {busyPhoto ? "Adding…" : cover ? "Add photo" : "Add a photo (optional)"}
              </button>
            ) : null}
            <label className="floor-settings-note">
              <span>Title</span>
              <input
                required
                maxLength={200}
                placeholder="Title"
                value={data.title}
                onChange={(e) => patch({ title: e.target.value })}
              />
            </label>
            <p className="floor-settings-help">{titleStyleHint(template.titleStyle)}</p>
            <label className="floor-settings-note">
              <span>Summary</span>
              <textarea
                rows={2}
                maxLength={3000}
                placeholder="One-line summary"
                value={data.description}
                onChange={(e) => patch({ description: e.target.value })}
              />
            </label>
            {template.sections.map((section) => (
              <label key={section.id} className="floor-settings-note">
                <span>{section.label}{section.required ? "" : " (optional)"}</span>
                <textarea
                  rows={5}
                  maxLength={4000}
                  placeholder={section.prompt || "Write this part…"}
                  value={data.chapters[section.id] ?? ""}
                  onChange={(e) => patch({ chapters: { ...data.chapters, [section.id]: e.target.value } })}
                />
              </label>
            ))}
          </>
        )}
        <div className="story-doc-meta">
          {template.showDate ? (
            <label className="floor-settings-note">
              <span>Date</span>
              <input type="date" value={data.date} onChange={(e) => patch({ date: e.target.value })} />
            </label>
          ) : null}
          <label className="floor-settings-note">
            <span>Search keywords</span>
            <input
              value={data.tags.join(", ")}
              placeholder={photo ? "leak, drain, kitchen" : "contract, dispute, closing"}
              onChange={(e) => patch({
                tags: e.target.value.split(",").map((tag) => tag.trim()).filter(Boolean).slice(0, 8),
              })}
            />
          </label>
        </div>
        {record?.data.status === "published" ? (
          <p className="story-doc-share">
            Live at <a href={`/${slug}/story/${record.id}`} target="_blank" rel="noreferrer">{`/${slug}/story/${record.id}`}</a>
            {" · "}
            <a href={`/${slug}/stories`} target="_blank" rel="noreferrer">All stories</a>
          </p>
        ) : null}
        {error ? <p className="editor-error" role="alert">{error}</p> : null}
        </section>
      </div>
    </form>
  );
}
