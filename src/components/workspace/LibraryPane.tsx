"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { Artifact, ArtifactKind, LibraryCategory } from "@/lib/types";
import { readMediaFile } from "@/lib/store";
import { ArtifactThumb } from "./ArtifactThumb";
import {
  IconPencil,
  IconTrash,
  IconX,
} from "@/components/shared/Icons";

const ADD_KINDS: { value: ArtifactKind; label: string }[] = [
  { value: "photo", label: "Photo" },
  { value: "video", label: "Video" },
  { value: "url", label: "URL" },
  { value: "text", label: "Text" },
];

type EditorTab = "categories" | "artifacts";

interface LibraryPaneProps {
  categories: LibraryCategory[];
  artifacts: Artifact[];
  filter: string;
  onFilterChange: (value: string) => void;
  onSend: (item: Artifact) => void;
  onChange: (next: {
    categories: LibraryCategory[];
    artifacts: Artifact[];
  }) => void;
  sentFlash: string | null;
  activeClientName?: string;
}

export function LibraryPane({
  categories,
  artifacts,
  filter,
  onFilterChange,
  onSend,
  onChange,
  sentFlash,
  activeClientName,
}: LibraryPaneProps) {
  const [editing, setEditing] = useState(false);
  const [editorTab, setEditorTab] = useState<EditorTab>("categories");
  const [editCategoryId, setEditCategoryId] = useState<string | null>(
    categories[0]?.id ?? null,
  );
  const [newCategoryName, setNewCategoryName] = useState("");
  const [artifactTitle, setArtifactTitle] = useState("");
  const [artifactValue, setArtifactValue] = useState("");
  const [addKind, setAddKind] = useState<ArtifactKind>("photo");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!editing) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        setEditing(false);
        setError(null);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [editing]);

  const visible = useMemo(() => {
    if (filter === "all") return artifacts;
    return artifacts.filter((a) => a.categoryId === filter);
  }, [artifacts, filter]);

  const editArtifacts = useMemo(() => {
    if (!editCategoryId) return [];
    return artifacts.filter((a) => a.categoryId === editCategoryId);
  }, [artifacts, editCategoryId]);

  function openEditor() {
    setEditing(true);
    setError(null);
    setEditorTab("categories");
    setEditCategoryId((current) => current ?? categories[0]?.id ?? null);
  }

  function closeEditor() {
    setEditing(false);
    setError(null);
  }

  function addCategory() {
    const name = newCategoryName.trim();
    if (!name) return;
    const id = `cat-${Date.now()}`;
    const next = [...categories, { id, name }];
    onChange({ categories: next, artifacts });
    setNewCategoryName("");
    setEditCategoryId(id);
    onFilterChange(id);
    setEditorTab("artifacts");
  }

  function renameCategory(id: string, name: string) {
    onChange({
      categories: categories.map((c) => (c.id === id ? { ...c, name } : c)),
      artifacts,
    });
  }

  function removeCategory(id: string) {
    if (categories.length <= 1) {
      setError("Keep at least one category.");
      return;
    }
    const nextCategories = categories.filter((c) => c.id !== id);
    const nextArtifacts = artifacts.filter((a) => a.categoryId !== id);
    onChange({ categories: nextCategories, artifacts: nextArtifacts });
    if (editCategoryId === id) setEditCategoryId(nextCategories[0]?.id ?? null);
    if (filter === id) onFilterChange("all");
    setError(null);
  }

  function removeArtifact(id: string) {
    onChange({
      categories,
      artifacts: artifacts.filter((a) => a.id !== id),
    });
  }

  function pushArtifact(next: Artifact) {
    onChange({ categories, artifacts: [next, ...artifacts] });
    setArtifactTitle("");
    setArtifactValue("");
    setError(null);
    if (fileRef.current) fileRef.current.value = "";
  }

  async function onFilePicked(file: File | null) {
    if (!file || !editCategoryId) return;
    setBusy(true);
    setError(null);
    try {
      const media = await readMediaFile(file);
      if (addKind === "photo" && media.kind !== "photo") {
        throw new Error("Pick an image file.");
      }
      if (addKind === "video" && media.kind !== "video") {
        throw new Error("Pick a video file.");
      }
      const title =
        artifactTitle.trim() ||
        file.name.replace(/\.[^.]+$/, "").replace(/[-_]/g, " ");
      pushArtifact({
        id: `a-${Date.now()}`,
        categoryId: editCategoryId,
        kind: media.kind,
        title,
        url: media.url,
        uses: 0,
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not add file.");
    } finally {
      setBusy(false);
    }
  }

  function addUrlOrText() {
    if (!editCategoryId) return;
    const title = artifactTitle.trim();
    const value = artifactValue.trim();

    if (addKind === "url") {
      if (!value) {
        setError("Enter a URL.");
        return;
      }
      let href = value;
      if (!/^https?:\/\//i.test(href)) href = `https://${href}`;
      try {
        // eslint-disable-next-line no-new
        new URL(href);
      } catch {
        setError("Enter a valid URL.");
        return;
      }
      pushArtifact({
        id: `a-${Date.now()}`,
        categoryId: editCategoryId,
        kind: "url",
        title: title || href,
        url: href,
        uses: 0,
      });
      return;
    }

    if (addKind === "text") {
      if (!value) {
        setError("Enter some text.");
        return;
      }
      pushArtifact({
        id: `a-${Date.now()}`,
        categoryId: editCategoryId,
        kind: "text",
        title: title || value.slice(0, 40) + (value.length > 40 ? "…" : ""),
        url: "",
        body: value,
        uses: 0,
      });
    }
  }

  const fileAccept = addKind === "video" ? "video/*" : "image/*";
  const editCategoryName =
    categories.find((c) => c.id === editCategoryId)?.name ?? "";

  return (
    <div className="library">
      <div className="library-head">
        <div className="library-head-row">
          <div className="library-head-copy">
            <h2>Artifacts</h2>
            <p>
              {activeClientName
                ? `Send to ${activeClientName}`
                : "Pick a chat to send"}
            </p>
          </div>
          <button
            type="button"
            className="library-edit-btn icon-btn"
            onClick={openEditor}
            aria-label="Edit library"
            title="Edit"
          >
            <IconPencil size={15} />
          </button>
        </div>

        <div className="library-filters" role="tablist" aria-label="Filters">
          <button
            type="button"
            role="tab"
            aria-selected={filter === "all"}
            className={filter === "all" ? "is-active" : undefined}
            onClick={() => onFilterChange("all")}
          >
            All
          </button>
          {categories.map((c) => (
            <button
              key={c.id}
              type="button"
              role="tab"
              aria-selected={filter === c.id}
              className={filter === c.id ? "is-active" : undefined}
              onClick={() => onFilterChange(c.id)}
            >
              {c.name}
            </button>
          ))}
        </div>
      </div>

      <ul className="library-grid">
        {visible.map((item) => (
          <li key={item.id}>
            <article
              className={`library-item ${sentFlash === item.id ? "is-sent" : ""}`}
            >
              <ArtifactThumb artifact={item} />
              <div className="library-body">
                <h3>{item.title}</h3>
                <span className="kind-tag">{item.kind}</span>
              </div>
              <div className="library-actions">
                <button
                  type="button"
                  className="library-send-btn"
                  onClick={() => onSend(item)}
                  disabled={!activeClientName}
                  aria-label={`Send ${item.title}`}
                  title="Add to chat"
                >
                  →
                </button>
              </div>
            </article>
          </li>
        ))}
        {visible.length === 0 ? (
          <li className="rail-empty">
            <p>Nothing here yet. Tap Edit to add artifacts.</p>
          </li>
        ) : null}
      </ul>

      {editing ? (
        <div className="library-editor-backdrop" onClick={closeEditor}>
          <div
            className="library-editor-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="library-editor-title"
            onClick={(e) => e.stopPropagation()}
          >
            <header className="library-editor-head">
              <div>
                <h2 id="library-editor-title">Edit library</h2>
                <p>Manage categories, then add artifacts to them.</p>
              </div>
              <button
                type="button"
                className="btn-ghost icon-btn"
                onClick={closeEditor}
                aria-label="Done"
                title="Done"
              >
                <IconX />
              </button>
            </header>

            <div
              className="library-editor-tabs"
              role="tablist"
              aria-label="Library editor"
            >
              <button
                type="button"
                role="tab"
                id="library-tab-categories"
                aria-selected={editorTab === "categories"}
                aria-controls="library-panel-categories"
                className={editorTab === "categories" ? "is-active" : undefined}
                onClick={() => {
                  setEditorTab("categories");
                  setError(null);
                }}
              >
                Categories
              </button>
              <button
                type="button"
                role="tab"
                id="library-tab-artifacts"
                aria-selected={editorTab === "artifacts"}
                aria-controls="library-panel-artifacts"
                className={editorTab === "artifacts" ? "is-active" : undefined}
                onClick={() => {
                  setEditorTab("artifacts");
                  setError(null);
                }}
              >
                Artifacts
              </button>
            </div>

            <div className="library-editor-body">
              {editorTab === "categories" ? (
                <section
                  className="editor-block"
                  role="tabpanel"
                  id="library-panel-categories"
                  aria-labelledby="library-tab-categories"
                >
                  <p className="editor-hint">
                    Select a category, then switch to Artifacts to add items.
                  </p>
                  <ul className="editor-cats">
                    {categories.map((c) => (
                      <li key={c.id}>
                        <button
                          type="button"
                          className={
                            editCategoryId === c.id
                              ? "cat-pick is-active"
                              : "cat-pick"
                          }
                          onClick={() => setEditCategoryId(c.id)}
                        >
                          Select
                        </button>
                        <input
                          value={c.name ?? ""}
                          onChange={(e) =>
                            renameCategory(c.id, e.target.value)
                          }
                          aria-label="Category name"
                        />
                        <button
                          type="button"
                          className="btn-text icon-btn"
                          onClick={() => removeCategory(c.id)}
                          aria-label={`Remove ${c.name}`}
                          title="Remove"
                        >
                          <IconTrash size={13} />
                        </button>
                      </li>
                    ))}
                  </ul>
                  <div className="editor-add-row">
                    <input
                      value={newCategoryName}
                      onChange={(e) => setNewCategoryName(e.target.value)}
                      placeholder="New category"
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.preventDefault();
                          addCategory();
                        }
                      }}
                    />
                    <button
                      type="button"
                      className="btn-solid-sm"
                      onClick={addCategory}
                    >
                      Add
                    </button>
                  </div>
                  {error ? <p className="editor-error">{error}</p> : null}
                  {editCategoryId ? (
                    <button
                      type="button"
                      className="library-editor-next"
                      onClick={() => setEditorTab("artifacts")}
                    >
                      Add artifacts to {editCategoryName || "category"} →
                    </button>
                  ) : null}
                </section>
              ) : (
                <section
                  className="editor-block"
                  role="tabpanel"
                  id="library-panel-artifacts"
                  aria-labelledby="library-tab-artifacts"
                >
                  <div className="editor-category-pick">
                    <span>Category</span>
                    <div
                      className="library-filters editor-category-filters"
                      role="group"
                      aria-label="Artifact category"
                    >
                      {categories.map((c) => (
                        <button
                          key={c.id}
                          type="button"
                          className={
                            editCategoryId === c.id ? "is-active" : undefined
                          }
                          onClick={() => setEditCategoryId(c.id)}
                        >
                          {c.name}
                        </button>
                      ))}
                    </div>
                  </div>

                  {!editCategoryId ? (
                    <p className="editor-hint">Select a category first.</p>
                  ) : (
                    <>
                      <div className="editor-add-artifact">
                        <div
                          className="add-kind-pills"
                          role="group"
                          aria-label="Artifact type"
                        >
                          {ADD_KINDS.map((k) => (
                            <button
                              key={k.value}
                              type="button"
                              className={
                                addKind === k.value
                                  ? "status-pill is-active"
                                  : "status-pill"
                              }
                              onClick={() => {
                                setAddKind(k.value);
                                setError(null);
                                setArtifactValue("");
                              }}
                            >
                              {k.label}
                            </button>
                          ))}
                        </div>
                        <input
                          value={artifactTitle}
                          onChange={(e) => setArtifactTitle(e.target.value)}
                          placeholder="Title (optional)"
                        />
                        {addKind === "photo" || addKind === "video" ? (
                          <>
                            <input
                              ref={fileRef}
                              type="file"
                              accept={fileAccept}
                              className="sr-only"
                              id="artifact-file"
                              onChange={(e) =>
                                onFilePicked(e.target.files?.[0] ?? null)
                              }
                            />
                            <label
                              htmlFor="artifact-file"
                              className="btn-solid-sm file-label"
                            >
                              {busy
                                ? "Adding…"
                                : addKind === "video"
                                  ? "Choose video"
                                  : "Choose photo"}
                            </label>
                          </>
                        ) : null}
                        {addKind === "url" ? (
                          <>
                            <input
                              value={artifactValue}
                              onChange={(e) => setArtifactValue(e.target.value)}
                              placeholder="https://…"
                              onKeyDown={(e) => {
                                if (e.key === "Enter") {
                                  e.preventDefault();
                                  addUrlOrText();
                                }
                              }}
                            />
                            <button
                              type="button"
                              className="btn-solid-sm"
                              onClick={addUrlOrText}
                            >
                              Add URL
                            </button>
                          </>
                        ) : null}
                        {addKind === "text" ? (
                          <>
                            <textarea
                              value={artifactValue}
                              onChange={(e) => setArtifactValue(e.target.value)}
                              placeholder="Message text…"
                              rows={3}
                            />
                            <button
                              type="button"
                              className="btn-solid-sm"
                              onClick={addUrlOrText}
                            >
                              Add text
                            </button>
                          </>
                        ) : null}
                      </div>
                      {error ? <p className="editor-error">{error}</p> : null}
                      <ul className="library-grid editor-artifacts">
                        {editArtifacts.map((item) => (
                          <li key={item.id}>
                            <article className="library-item">
                              <ArtifactThumb artifact={item} />
                              <div className="library-body">
                                <h3>{item.title}</h3>
                                <span className="kind-tag">{item.kind}</span>
                              </div>
                              <div className="library-actions">
                                <button
                                  type="button"
                                  className="btn-text icon-btn"
                                  onClick={() => removeArtifact(item.id)}
                                  aria-label={`Remove ${item.title}`}
                                  title="Remove"
                                >
                                  <IconTrash size={13} />
                                </button>
                              </div>
                            </article>
                          </li>
                        ))}
                      </ul>
                      {editArtifacts.length === 0 ? (
                        <p className="editor-hint">
                          No artifacts in this category yet.
                        </p>
                      ) : null}
                    </>
                  )}
                </section>
              )}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
