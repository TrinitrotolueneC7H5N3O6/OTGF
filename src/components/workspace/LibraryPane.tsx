"use client";

import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type DragEvent,
} from "react";
import type { Artifact, LibraryCategory } from "@/lib/types";
import { ARTIFACT_META_MAX, clampArtifactMeta } from "@/lib/artifactMeta";
import { autoOrganizeLibrary } from "@/lib/data";
import { readMediaFile } from "@/lib/store";
import { ArtifactThumb } from "./ArtifactThumb";
import { IconPencil, IconStar, IconTrash, IconX } from "@/components/shared/Icons";

interface LibraryPaneProps {
  categories: LibraryCategory[];
  artifacts: Artifact[];
  filter: string;
  onFilterChange: (value: string) => void;
  onSend: (item: Artifact) => void;
  onToggleShortcut?: (item: Artifact) => void;
  shortcutIds?: string[];
  onChange: (next: {
    categories: LibraryCategory[];
    artifacts: Artifact[];
  }) => void;
  sentFlash: string | null;
  activeClientName?: string;
}

function titleFromFileName(name: string) {
  return name.replace(/\.[^.]+$/, "").replace(/[-_]/g, " ").trim().slice(0, 80);
}

function looksLikeUrl(value: string) {
  const v = value.trim();
  if (!v || /\s/.test(v)) return false;
  if (/^https?:\/\//i.test(v)) return true;
  return /^[\w.-]+\.[a-z]{2,}([/:?#].*)?$/i.test(v);
}

export function LibraryPane({
  categories,
  artifacts,
  filter,
  onFilterChange,
  onSend,
  onToggleShortcut,
  shortcutIds = [],
  onChange,
  sentFlash,
  activeClientName,
}: LibraryPaneProps) {
  const [editing, setEditing] = useState(false);
  /** "all" browse | "auto" mass dump | folder id */
  const [uploadTarget, setUploadTarget] = useState<"all" | "auto" | string>(
    "auto",
  );
  const [addKind, setAddKind] = useState<
    "files" | "collection" | "link" | "text"
  >("files");
  const [pasteValue, setPasteValue] = useState("");
  const [newFolderName, setNewFolderName] = useState("");
  const [creatingFolder, setCreatingFolder] = useState(false);
  const [existingOnly, setExistingOnly] = useState(false);
  /** Items from the latest auto-sort batch — shown under Auto-sort for instant edit */
  const [autoSessionIds, setAutoSessionIds] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [metaOpenIds, setMetaOpenIds] = useState<Set<string>>(new Set());
  const fileRef = useRef<HTMLInputElement>(null);
  const collectionRef = useRef<HTMLInputElement>(null);
  const artifactsRef = useRef(artifacts);
  artifactsRef.current = artifacts;
  const categoriesRef = useRef(categories);
  categoriesRef.current = categories;
  const uploadTargetRef = useRef(uploadTarget);
  uploadTargetRef.current = uploadTarget;
  const existingOnlyRef = useRef(existingOnly);
  existingOnlyRef.current = existingOnly;

  const pinned = useMemo(() => new Set(shortcutIds), [shortcutIds]);

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

  const countsByCategory = useMemo(() => {
    const map = new Map<string, number>();
    for (const a of artifacts) {
      map.set(a.categoryId, (map.get(a.categoryId) ?? 0) + 1);
    }
    return map;
  }, [artifacts]);

  const sortedCategories = useMemo(
    () => [...categories].sort((a, b) => a.name.localeCompare(b.name)),
    [categories],
  );

  const isFresh = artifacts.length === 0;
  const isAll = uploadTarget === "all";
  const isAuto = uploadTarget === "auto";
  const isFolder = !isAll && !isAuto;

  const editorList = useMemo(() => {
    if (isAll) return artifacts;
    if (isAuto) {
      if (!autoSessionIds.length) return [];
      const want = new Set(autoSessionIds);
      return artifacts.filter((a) => want.has(a.id));
    }
    return artifacts.filter((a) => a.categoryId === uploadTarget);
  }, [artifacts, uploadTarget, isAll, isAuto, autoSessionIds]);

  function openEditor() {
    setEditing(true);
    setError(null);
    setStatus(null);
    setPasteValue("");
    setCreatingFolder(false);
    setNewFolderName("");
    setAddKind("files");
    setAutoSessionIds([]);
    if (artifacts.length === 0) {
      setUploadTarget("auto");
    } else {
      setUploadTarget("all");
    }
  }

  function closeEditor() {
    setEditing(false);
    setError(null);
    setStatus(null);
    setDragOver(false);
  }

  function commit(
    nextCategories: LibraryCategory[],
    nextArtifacts: Artifact[],
  ) {
    artifactsRef.current = nextArtifacts;
    categoriesRef.current = nextCategories;
    onChange({ categories: nextCategories, artifacts: nextArtifacts });
  }

  function reorganize(
    nextCategories: LibraryCategory[],
    nextArtifacts: Artifact[],
    createFolders = true,
  ) {
    const organized = autoOrganizeLibrary(nextCategories, nextArtifacts, {
      createFolders,
    });
    commit(organized.categories, organized.artifacts);
    return organized;
  }

  function updateArtifact(id: string, patch: Partial<Artifact>) {
    const next = artifactsRef.current.map((a) =>
      a.id === id ? { ...a, ...patch } : a,
    );
    commit(categoriesRef.current, next);
  }

  function removeArtifact(id: string) {
    const nextArtifacts = artifactsRef.current.filter((a) => a.id !== id);
    commit(categoriesRef.current, nextArtifacts);
  }

  function addFolder() {
    const name = newFolderName.trim().slice(0, 40);
    if (!name) {
      setError("Enter a folder name.");
      return;
    }
    if (
      categoriesRef.current.some(
        (c) => c.name.trim().toLowerCase() === name.toLowerCase(),
      )
    ) {
      setError("That folder already exists.");
      return;
    }
    const id = `cat-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`;
    const next = [...categoriesRef.current, { id, name }];
    commit(next, artifactsRef.current);
    setNewFolderName("");
    setCreatingFolder(false);
    setError(null);
    setUploadTarget(id);
    setAddKind("files");
    setStatus(`“${name}” ready — add photos, a link, or text.`);
    window.setTimeout(() => setStatus(null), 2400);
  }

  function deleteFolder(id: string) {
    const name =
      categoriesRef.current.find((c) => c.id === id)?.name ?? "Folder";
    const nextCategories = categoriesRef.current.filter((c) => c.id !== id);
    const nextArtifacts = artifactsRef.current.filter(
      (a) => a.categoryId !== id,
    );
    commit(nextCategories, nextArtifacts);
    if (uploadTarget === id) {
      setUploadTarget(nextCategories[0]?.id ?? "auto");
    }
    if (filter === id) onFilterChange("all");
    setError(null);
    setStatus(`Deleted “${name}”.`);
    window.setTimeout(() => setStatus(null), 2000);
  }

  function moveArtifact(id: string, categoryId: string) {
    updateArtifact(id, { categoryId });
  }

  async function ingestCollection(list: FileList | File[] | null) {
    const files = list ? Array.from(list) : [];
    if (!files.length) return;

    const target = uploadTargetRef.current;
    if (target === "all" || target === "auto") {
      setError("Pick a folder to add a collection.");
      return;
    }
    if (!categoriesRef.current.some((c) => c.id === target)) {
      setError("Pick a folder first.");
      return;
    }

    setBusy(true);
    setError(null);
    setStatus(`Building collection from ${files.length}…`);

    const urls: string[] = [];
    const failures: string[] = [];
    for (const file of files) {
      try {
        const media = await readMediaFile(file);
        if (media.kind !== "photo") {
          failures.push(`${file.name}: photos only in a collection`);
          continue;
        }
        urls.push(media.url);
      } catch (e) {
        failures.push(
          `${file.name}: ${e instanceof Error ? e.message : "could not add"}`,
        );
      }
    }

    if (urls.length < 2) {
      setError(
        failures[0] ?? "Add at least 2 photos to make a collection.",
      );
      setStatus(null);
      if (collectionRef.current) collectionRef.current.value = "";
      setBusy(false);
      return;
    }

    const next: Artifact = {
      id: `a-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      categoryId: target,
      kind: "collection",
      title: `Collection (${urls.length})`,
      url: urls[0],
      urls,
      uses: 0,
    };
    commit(categoriesRef.current, [next, ...artifactsRef.current]);
    const folder =
      categoriesRef.current.find((c) => c.id === target)?.name ?? "folder";
    setStatus(`Added collection (${urls.length}) to “${folder}”.`);
    window.setTimeout(() => setStatus(null), 2800);
    if (collectionRef.current) collectionRef.current.value = "";
    if (failures.length) {
      setError(`Skipped ${failures.length}: ${failures[0]}`);
    }
    setBusy(false);
  }

  async function ingestFiles(list: FileList | File[] | null) {
    if (addKind === "collection" && uploadTargetRef.current !== "auto") {
      await ingestCollection(list);
      return;
    }

    const files = list ? Array.from(list) : [];
    if (!files.length) return;

    const target = uploadTargetRef.current;
    if (target === "all") {
      setError("Pick Auto-sort or a folder to add files.");
      return;
    }
    const intoFolder = target !== "auto";
    if (intoFolder && !categoriesRef.current.some((c) => c.id === target)) {
      setError("Pick a folder, or use Auto-sort.");
      return;
    }
    if (
      !intoFolder &&
      existingOnlyRef.current &&
      categoriesRef.current.length === 0
    ) {
      setError("Create a folder first, or turn off “existing folders only”.");
      return;
    }

    setBusy(true);
    setError(null);
    if (!intoFolder) setAutoSessionIds([]);
    setStatus(`Adding ${files.length}…`);

    const created: Artifact[] = [];
    const failures: string[] = [];
    let stamp = Date.now();
    const categoryId = intoFolder ? target : "__holding__";

    for (const file of files) {
      try {
        const media = await readMediaFile(file);
        created.push({
          id: `a-${stamp++}-${Math.random().toString(36).slice(2, 6)}`,
          categoryId,
          kind: media.kind,
          title: titleFromFileName(file.name) || media.kind,
          url: media.url,
          uses: 0,
        });
      } catch (e) {
        failures.push(
          `${file.name}: ${e instanceof Error ? e.message : "could not add"}`,
        );
      }
    }

    if (created.length) {
      if (intoFolder) {
        commit(categoriesRef.current, [
          ...created,
          ...artifactsRef.current,
        ]);
        setPasteValue("");
        const folder =
          categoriesRef.current.find((c) => c.id === target)?.name ??
          "folder";
        setStatus(`Added ${created.length} to “${folder}”.`);
      } else {
        const merged = [...created, ...artifactsRef.current];
        const organized = reorganize(
          categoriesRef.current,
          merged,
          !existingOnlyRef.current,
        );
        setPasteValue("");
        setAutoSessionIds(created.map((c) => c.id));
        setStatus(
          `Sorted ${created.length} — edit below.`,
        );
      }
      window.setTimeout(() => setStatus(null), 2800);
    }

    if (fileRef.current) fileRef.current.value = "";
    if (failures.length && !created.length) {
      setError(failures[0] ?? "Could not add files.");
      setStatus(null);
    } else if (failures.length) {
      setError(
        `Added ${created.length}, skipped ${failures.length}: ${failures[0]}`,
      );
    }
    setBusy(false);
  }

  function addPaste() {
    const value = pasteValue.trim();
    if (!value) {
      setError(
        addKind === "link" ? "Paste a link." : "Enter some text.",
      );
      return;
    }

    const target = uploadTargetRef.current;
    if (target === "all") {
      setError("Pick Auto-sort or a folder to add.");
      return;
    }
    const intoFolder = target !== "auto";
    if (intoFolder && !categoriesRef.current.some((c) => c.id === target)) {
      setError("Pick a folder first.");
      return;
    }
    if (
      !intoFolder &&
      existingOnlyRef.current &&
      categoriesRef.current.length === 0
    ) {
      setError("Create a folder first, or turn off “existing folders only”.");
      return;
    }

    const wantLink = addKind === "link" || (isAuto && looksLikeUrl(value));
    let next: Artifact;
    const categoryId = intoFolder ? target : "__holding__";

    if (wantLink) {
      let href = value;
      if (!/^https?:\/\//i.test(href)) href = `https://${href}`;
      try {
        // eslint-disable-next-line no-new
        new URL(href);
      } catch {
        setError("Enter a valid URL.");
        return;
      }
      let label = href;
      try {
        label = new URL(href).hostname.replace(/^www\./, "");
      } catch {
        // keep
      }
      next = {
        id: `a-${Date.now()}`,
        categoryId,
        kind: "url",
        title: label.slice(0, 80),
        url: href,
        uses: 0,
      };
    } else {
      next = {
        id: `a-${Date.now()}`,
        categoryId,
        kind: "text",
        title: value.slice(0, 40) + (value.length > 40 ? "…" : ""),
        url: "",
        body: value,
        uses: 0,
      };
    }

    setError(null);
    setPasteValue("");
    setBusy(true);
    if (!intoFolder) setAutoSessionIds([]);
    if (intoFolder) {
      commit(categoriesRef.current, [next, ...artifactsRef.current]);
      setBusy(false);
      setStatus("Added.");
      window.setTimeout(() => setStatus(null), 2000);
    } else {
      reorganize(
        categoriesRef.current,
        [next, ...artifactsRef.current],
        !existingOnlyRef.current,
      );
      setBusy(false);
      setAutoSessionIds([next.id]);
      setStatus("Sorted — edit below.");
      window.setTimeout(() => setStatus(null), 2400);
    }
  }

  function sendItem(item: Artifact) {
    if (!activeClientName) return;
    onSend(item);
  }

  function onDrop(e: DragEvent) {
    e.preventDefault();
    setDragOver(false);
    void ingestFiles(e.dataTransfer.files);
  }

  function folderName(id: string) {
    return categories.find((c) => c.id === id)?.name ?? "Unfiled";
  }

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
          {sortedCategories.map((c) => (
            <button
              key={c.id}
              type="button"
              role="tab"
              aria-selected={filter === c.id}
              className={filter === c.id ? "is-active" : undefined}
              onClick={() => onFilterChange(c.id)}
            >
              {c.name}
              {countsByCategory.get(c.id)
                ? ` · ${countsByCategory.get(c.id)}`
                : ""}
            </button>
          ))}
        </div>
      </div>

      <ul className="library-grid">
        {visible.map((item) => (
          <li key={item.id}>
            <article
              className={`library-item is-clickable ${sentFlash === item.id ? "is-sent" : ""} ${!activeClientName ? "is-disabled" : ""} ${pinned.has(item.id) ? "is-pinned" : ""}`}
              role="button"
              tabIndex={activeClientName ? 0 : -1}
              aria-label={`Add ${item.title || item.kind} to chat`}
              aria-disabled={!activeClientName}
              onClick={() => sendItem(item)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  sendItem(item);
                }
              }}
            >
              {onToggleShortcut ? (
                <button
                  type="button"
                  className={`library-pin-btn ${pinned.has(item.id) ? "is-on" : ""}`}
                  onClick={(e) => {
                    e.stopPropagation();
                    onToggleShortcut(item);
                  }}
                  aria-label={
                    pinned.has(item.id)
                      ? `Remove ${item.title || item.kind} from shortcuts`
                      : `Pin ${item.title || item.kind} to shortcuts`
                  }
                  title={
                    pinned.has(item.id)
                      ? "Remove from shortcut bar"
                      : "Pin to shortcut bar"
                  }
                >
                  <IconStar size={13} filled={pinned.has(item.id)} />
                </button>
              ) : null}
              <ArtifactThumb artifact={item} />
              <div className="library-body">
                <h3>{item.title || item.kind}</h3>
                {item.meta ? (
                  <p className="library-meta-preview">{item.meta}</p>
                ) : item.kind === "collection" ? (
                  <span className="kind-tag">
                    Collection · {item.urls?.length ?? 0}
                  </span>
                ) : (
                  <span className="kind-tag">{folderName(item.categoryId)}</span>
                )}
              </div>
            </article>
          </li>
        ))}
        {visible.length === 0 ? (
          <li className="rail-empty">
            <p>Nothing yet — open Edit and drop your files in.</p>
          </li>
        ) : null}
      </ul>

      {editing ? (
        <div className="library-editor-backdrop" onClick={closeEditor}>
          <div
            className="library-editor-modal library-editor-modal-dump"
            role="dialog"
            aria-modal="true"
            aria-labelledby="library-editor-title"
            onClick={(e) => e.stopPropagation()}
          >
            <header className="library-editor-head">
              <div>
                <h2 id="library-editor-title">Edit artifacts</h2>
                <p>
                  {isFresh
                    ? "Start with Auto-sort — dump a batch and we’ll file it."
                    : isAll
                      ? "Browsing everything. Pick Auto-sort or a folder to add more."
                      : isAuto
                        ? "Dump a mixed batch — results show here after sorting."
                        : `Adding to “${folderName(uploadTarget)}”.`}
                </p>
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

            <div className="library-editor-dump">
              <div className="library-dump-folders" aria-label="Where to add">
                <div
                  className="library-dump-filters"
                  role="tablist"
                  aria-label="Upload destination"
                >
                  <button
                    type="button"
                    role="tab"
                    className={isAll ? "is-active" : undefined}
                    onClick={() => {
                      setUploadTarget("all");
                      setError(null);
                    }}
                  >
                    All
                    <span className="library-folder-chip-count">
                      {artifacts.length}
                    </span>
                  </button>
                  <button
                    type="button"
                    role="tab"
                    className={isAuto ? "is-active" : undefined}
                    onClick={() => {
                      setUploadTarget("auto");
                      setAddKind("files");
                      setAutoSessionIds([]);
                      setError(null);
                    }}
                  >
                    Auto-sort
                  </button>
                  {sortedCategories.map((c) => (
                    <div
                      key={c.id}
                      className={`library-folder-chip${uploadTarget === c.id ? " is-active" : ""}`}
                    >
                      <button
                        type="button"
                        role="tab"
                        className="library-folder-chip-main"
                        onClick={() => {
                          setUploadTarget(c.id);
                          setAddKind("files");
                          setError(null);
                        }}
                      >
                        {c.name}
                        <span className="library-folder-chip-count">
                          {countsByCategory.get(c.id) ?? 0}
                        </span>
                      </button>
                      <button
                        type="button"
                        className="library-folder-chip-del"
                        aria-label={`Delete ${c.name}`}
                        title="Delete folder"
                        onClick={(e) => {
                          e.stopPropagation();
                          deleteFolder(c.id);
                        }}
                      >
                        <IconTrash size={12} />
                      </button>
                    </div>
                  ))}
                  {!creatingFolder ? (
                    <button
                      type="button"
                      className="library-folder-new"
                      onClick={() => {
                        setCreatingFolder(true);
                        setError(null);
                      }}
                    >
                      + New folder
                    </button>
                  ) : null}
                </div>
                {creatingFolder ? (
                  <div className="library-folder-create">
                    <input
                      value={newFolderName}
                      onChange={(e) => setNewFolderName(e.target.value)}
                      placeholder="Folder name"
                      autoFocus
                      disabled={busy}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.preventDefault();
                          addFolder();
                        }
                        if (e.key === "Escape") {
                          setCreatingFolder(false);
                          setNewFolderName("");
                        }
                      }}
                    />
                    <button
                      type="button"
                      className="btn-solid-sm"
                      disabled={busy || !newFolderName.trim()}
                      onClick={addFolder}
                    >
                      Create
                    </button>
                    <button
                      type="button"
                      className="btn-text"
                      onClick={() => {
                        setCreatingFolder(false);
                        setNewFolderName("");
                      }}
                    >
                      Cancel
                    </button>
                  </div>
                ) : null}
                {isAuto ? (
                  <label className="library-existing-only">
                    <input
                      type="checkbox"
                      checked={existingOnly}
                      disabled={busy || sortedCategories.length === 0}
                      onChange={(e) => setExistingOnly(e.target.checked)}
                    />
                    <span>
                      Only use existing folders
                      {sortedCategories.length === 0
                        ? " (add a folder first)"
                        : " — don’t create new ones"}
                    </span>
                  </label>
                ) : null}
              </div>

              {isAll ? null : (
              <div
                className={`library-dropzone library-dropzone-hero${dragOver ? " is-dragover" : ""}${busy ? " is-busy" : ""}${isFolder ? " is-folder" : ""}`}
                onDragEnter={(e) => {
                  e.preventDefault();
                  setDragOver(true);
                }}
                onDragOver={(e) => {
                  e.preventDefault();
                  setDragOver(true);
                }}
                onDragLeave={(e) => {
                  e.preventDefault();
                  if (e.currentTarget === e.target) setDragOver(false);
                }}
                onDrop={onDrop}
              >
                {isFolder ? (
                  <div
                    className="library-add-kinds"
                    role="tablist"
                    aria-label="What to add"
                  >
                    {(
                      [
                        { id: "files", label: "Photos" },
                        { id: "collection", label: "Collections" },
                        { id: "link", label: "Link" },
                        { id: "text", label: "Text" },
                      ] as const
                    ).map((k) => (
                      <button
                        key={k.id}
                        type="button"
                        role="tab"
                        className={addKind === k.id ? "is-active" : undefined}
                        onClick={() => {
                          setAddKind(k.id);
                          setPasteValue("");
                          setError(null);
                        }}
                      >
                        {k.label}
                      </button>
                    ))}
                  </div>
                ) : null}

                <input
                  ref={fileRef}
                  type="file"
                  accept="image/*,video/*"
                  multiple
                  className="sr-only"
                  id="artifact-file"
                  onChange={(e) => void ingestFiles(e.target.files)}
                />
                <input
                  ref={collectionRef}
                  type="file"
                  accept="image/*"
                  multiple
                  className="sr-only"
                  id="artifact-collection"
                  onChange={(e) => void ingestCollection(e.target.files)}
                />

                {isAuto || addKind === "files" ? (
                  <label
                    htmlFor="artifact-file"
                    className="library-dropzone-hit"
                  >
                    <strong>
                      {busy
                        ? "Working…"
                        : isAuto
                          ? "Drop a mixed batch here"
                          : `Drop photos into “${folderName(uploadTarget)}”`}
                    </strong>
                    <span>
                      {isAuto
                        ? existingOnly
                          ? "We’ll file into your existing folders only."
                          : "We’ll create folders as needed, then show results below."
                        : "Or click to choose — each file becomes its own artifact."}
                    </span>
                  </label>
                ) : null}

                {isFolder && addKind === "collection" ? (
                  <label
                    htmlFor="artifact-collection"
                    className="library-dropzone-hit"
                  >
                    <strong>
                      {busy
                        ? "Working…"
                        : `Drop photos for one collection in “${folderName(uploadTarget)}”`}
                    </strong>
                    <span>
                      Multiple photos become a single collection you can send
                      together.
                    </span>
                  </label>
                ) : null}

                {isFolder && addKind === "link" ? (
                  <div className="library-dropzone-paste is-solo">
                    <input
                      value={pasteValue}
                      onChange={(e) => setPasteValue(e.target.value)}
                      placeholder="https://…"
                      disabled={busy}
                      autoFocus
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.preventDefault();
                          addPaste();
                        }
                      }}
                    />
                    <button
                      type="button"
                      className="btn-solid-sm"
                      disabled={busy || !pasteValue.trim()}
                      onClick={addPaste}
                    >
                      Add link
                    </button>
                  </div>
                ) : null}

                {isFolder && addKind === "text" ? (
                  <div className="library-dropzone-paste is-stack">
                    <textarea
                      value={pasteValue}
                      onChange={(e) => setPasteValue(e.target.value)}
                      placeholder="Reusable message…"
                      rows={3}
                      disabled={busy}
                      autoFocus
                    />
                    <button
                      type="button"
                      className="btn-solid-sm"
                      disabled={busy || !pasteValue.trim()}
                      onClick={addPaste}
                    >
                      Add text
                    </button>
                  </div>
                ) : null}

                {isAuto ? (
                  <div className="library-dropzone-paste">
                    <input
                      value={pasteValue}
                      onChange={(e) => setPasteValue(e.target.value)}
                      placeholder="Or paste a link / text to auto-sort…"
                      disabled={busy}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.preventDefault();
                          addPaste();
                        }
                      }}
                    />
                    <button
                      type="button"
                      className="btn-solid-sm"
                      disabled={busy || !pasteValue.trim()}
                      onClick={addPaste}
                    >
                      Add
                    </button>
                  </div>
                ) : null}

                {status ? (
                  <p className="library-import-status" role="status">
                    {status}
                  </p>
                ) : null}
                {error ? <p className="editor-error">{error}</p> : null}
              </div>
              )}

              {isAll && (status || error) ? (
                <div className="library-all-status">
                  {status ? (
                    <p className="library-import-status" role="status">
                      {status}
                    </p>
                  ) : null}
                  {error ? <p className="editor-error">{error}</p> : null}
                </div>
              ) : null}

              <div className="library-edit-list-wrap is-dump">
                {editorList.length === 0 ? (
                  <div className="library-editor-empty is-soft">
                    <p>
                      {busy && isAuto
                        ? "Sorting… results will show here when ready."
                        : isAll
                          ? artifacts.length === 0
                            ? "Nothing yet — switch to Auto-sort to dump a batch."
                            : "No artifacts to show."
                          : isAuto
                            ? "Drop a batch above — sorted items appear here to edit."
                            : "This folder is empty — add photos, a link, or text."}
                    </p>
                  </div>
                ) : (
                  <ul className="library-edit-list">
                    {editorList.map((item) => {
                      const metaOpen = metaOpenIds.has(item.id);
                      return (
                        <li key={item.id}>
                          <article className="library-edit-card is-compact">
                            <div className="library-edit-card-media">
                              <ArtifactThumb artifact={item} />
                            </div>
                            <div className="library-edit-card-fields">
                              <input
                                className="library-edit-title"
                                value={item.title}
                                onChange={(e) =>
                                  updateArtifact(item.id, {
                                    title: e.target.value.slice(0, 80),
                                  })
                                }
                                placeholder="Name"
                                aria-label="Artifact name"
                              />
                              {item.kind === "collection" ? (
                                <span className="library-folder-pill">
                                  {item.urls?.length ?? 0} photos
                                </span>
                              ) : null}
                              {isFolder ? null : (
                                <span className="library-folder-pill">
                                  {folderName(item.categoryId)}
                                </span>
                              )}
                              {item.meta && !metaOpen ? (
                                <p className="library-meta-preview">
                                  {item.meta}
                                </p>
                              ) : null}
                              {metaOpen ? (
                                <label className="library-edit-note">
                                  <span>
                                    Assist note · {(item.meta ?? "").length}/
                                    {ARTIFACT_META_MAX}
                                  </span>
                                  <textarea
                                    value={item.meta ?? ""}
                                    onChange={(e) =>
                                      updateArtifact(item.id, {
                                        meta: clampArtifactMeta(e.target.value),
                                      })
                                    }
                                    rows={2}
                                    maxLength={ARTIFACT_META_MAX}
                                    aria-label="Artifact meta for Assist"
                                  />
                                </label>
                              ) : null}
                              <div className="library-edit-card-actions">
                                {sortedCategories.length > 1 ? (
                                  <label className="library-move-select">
                                    <span className="sr-only">Folder</span>
                                    <select
                                      value={item.categoryId}
                                      onChange={(e) =>
                                        moveArtifact(item.id, e.target.value)
                                      }
                                      aria-label="Move to folder"
                                    >
                                      {sortedCategories.map((c) => (
                                        <option key={c.id} value={c.id}>
                                          {c.name}
                                        </option>
                                      ))}
                                    </select>
                                  </label>
                                ) : null}
                                <button
                                  type="button"
                                  className="btn-text"
                                  onClick={() =>
                                    setMetaOpenIds((prev) => {
                                      const next = new Set(prev);
                                      if (next.has(item.id)) next.delete(item.id);
                                      else next.add(item.id);
                                      return next;
                                    })
                                  }
                                >
                                  {metaOpen ? "Hide note" : "Note"}
                                </button>
                                <button
                                  type="button"
                                  className="btn-text is-danger"
                                  onClick={() => removeArtifact(item.id)}
                                  aria-label="Remove"
                                >
                                  <IconTrash size={14} />
                                </button>
                              </div>
                            </div>
                          </article>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
