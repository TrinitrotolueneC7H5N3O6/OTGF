"use client";

import { useEffect, useRef, useState } from "react";
import type { FloorSettings } from "@/lib/types";
import { readMediaFile } from "@/lib/store";
import { IconX } from "@/components/shared/Icons";

const MAX_IMAGES = 6;

interface ChatInterfaceSetupModalProps {
  settings: FloorSettings;
  onChangeSettings: (settings: FloorSettings) => void;
  onClose: () => void;
}

export function ChatInterfaceSetupModal({
  settings,
  onChangeSettings,
  onClose,
}: ChatInterfaceSetupModalProps) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const images = settings.chatEndImages ?? [];

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  function patchImages(next: string[]) {
    onChangeSettings({
      ...settings,
      chatEndImages: next.slice(0, MAX_IMAGES),
    });
  }

  async function onAddFiles(fileList: FileList | null) {
    if (!fileList?.length) return;
    const remaining = MAX_IMAGES - images.length;
    if (remaining <= 0) {
      setError(`You can add up to ${MAX_IMAGES} images.`);
      return;
    }

    setBusy(true);
    setError(null);
    const added: string[] = [];
    try {
      const files = Array.from(fileList).slice(0, remaining);
      for (const file of files) {
        const media = await readMediaFile(file);
        if (media.kind !== "photo") {
          throw new Error("Pick image files only.");
        }
        added.push(media.url);
      }
      patchImages([...images, ...added]);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not add images.");
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  function removeAt(index: number) {
    patchImages(images.filter((_, i) => i !== index));
  }

  return (
    <div className="floor-settings-backdrop" onClick={onClose}>
      <div
        className="floor-settings-modal chat-interface-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="chat-interface-title"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="floor-settings-head">
          <div>
            <h2 id="chat-interface-title">Set up chat interface</h2>
            <p>
              Pick up to {MAX_IMAGES} photos. They appear as a carousel at the
              bottom of customer chat as soon as it opens.
            </p>
          </div>
          <button
            type="button"
            className="btn-ghost icon-btn"
            onClick={onClose}
            aria-label="Close"
            title="Close"
          >
            <IconX />
          </button>
        </header>

        <div className="floor-settings-body chat-interface-body">
          <div className="chat-interface-grid" role="list">
            {images.map((url, index) => (
              <div
                key={`${index}-${url.slice(0, 24)}`}
                className="chat-interface-slot is-filled"
                role="listitem"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={url} alt={`Marketing photo ${index + 1}`} />
                <button
                  type="button"
                  className="chat-interface-remove"
                  onClick={() => removeAt(index)}
                  aria-label={`Remove photo ${index + 1}`}
                >
                  <IconX />
                </button>
              </div>
            ))}
            {images.length < MAX_IMAGES
              ? Array.from({ length: MAX_IMAGES - images.length }).map((_, i) => (
                  <label
                    key={`empty-${i}`}
                    className={`chat-interface-slot is-empty ${busy ? "is-busy" : ""}`}
                    htmlFor="chat-interface-file"
                  >
                    <span>{busy ? "…" : "+"}</span>
                    <span className="chat-interface-slot-label">Add photo</span>
                  </label>
                ))
              : null}
          </div>

          <input
            ref={fileRef}
            id="chat-interface-file"
            type="file"
            accept="image/*"
            multiple
            className="sr-only"
            disabled={busy || images.length >= MAX_IMAGES}
            onChange={(e) => void onAddFiles(e.target.files)}
          />

          <p className="floor-settings-help">
            {images.length}/{MAX_IMAGES} photos · under 4MB each
          </p>
          {error ? <p className="editor-error">{error}</p> : null}
        </div>
      </div>
    </div>
  );
}
