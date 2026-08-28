"use client";

import { useEffect, useId, useState } from "react";
import type { Offering, OfferingKind } from "@/lib/types";
import { readMediaFile } from "@/lib/store";
import { IconCheck, IconLink, IconTrash } from "@/components/shared/Icons";
import { ShareQrCard } from "./QrShareModal";
import { newOfferingId, offeringAskPath } from "@/lib/offerings";

interface OfferingsPanelProps {
  slug: string;
  offerings: Offering[];
  onChangeOfferings: (offerings: Offering[]) => void;
}

export function OfferingsPanel({
  slug,
  offerings,
  onChangeOfferings,
}: OfferingsPanelProps) {
  const fieldId = useId();
  const [origin, setOrigin] = useState("");
  const [title, setTitle] = useState("");
  const [price, setPrice] = useState("");
  const [description, setDescription] = useState("");
  const [kind, setKind] = useState<OfferingKind>("service");
  const [imageUrl, setImageUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [shareId, setShareId] = useState<string | null>(null);

  useEffect(() => {
    setOrigin(window.location.origin);
  }, []);

  function askUrl(id: string) {
    const path = offeringAskPath(slug, id);
    return origin ? `${origin}${path}` : path;
  }

  async function onPhoto(file: File | null) {
    if (!file) return;
    setBusy(true);
    setError(null);
    try {
      const media = await readMediaFile(file);
      if (media.kind !== "photo") {
        setError("Pick an image file.");
        return;
      }
      setImageUrl(media.url);
    } catch {
      setError("Could not upload that photo.");
    } finally {
      setBusy(false);
    }
  }

  function addOffering() {
    const nextTitle = title.trim();
    if (!nextTitle) {
      setError("Add a name.");
      return;
    }
    const next: Offering = {
      id: newOfferingId(),
      title: nextTitle.slice(0, 80),
      description: description.trim().slice(0, 500),
      price: price.trim().slice(0, 40),
      kind,
      ...(imageUrl ? { imageUrl } : {}),
      sortOrder: offerings.length,
    };
    onChangeOfferings([...offerings, next]);
    setTitle("");
    setPrice("");
    setDescription("");
    setImageUrl("");
    setKind("service");
    setError(null);
    setShareId(next.id);
  }

  function patchOffering(id: string, partial: Partial<Offering>) {
    onChangeOfferings(
      offerings.map((item) => (item.id === id ? { ...item, ...partial } : item)),
    );
  }

  function removeOffering(id: string) {
    onChangeOfferings(
      offerings
        .filter((item) => item.id !== id)
        .map((item, index) => ({ ...item, sortOrder: index })),
    );
    if (shareId === id) setShareId(null);
  }

  async function copyAskLink(id: string) {
    try {
      await navigator.clipboard.writeText(askUrl(id));
      setCopiedId(id);
      window.setTimeout(() => setCopiedId(null), 1600);
    } catch {
      /* clipboard can be blocked */
    }
  }

  return (
    <div className="dashboard-panel-body">
      <h2 className="dashboard-panel-title">What you offer</h2>
      <p className="floor-settings-help">
        Add the products and services people ask about. Each one gets a link and
        QR code that opens a chat already asking about that item.
      </p>

      <section className="offerings-add">
        <h3>Add an item</h3>
        <div className="offerings-kind">
          {(["service", "product"] as const).map((id) => (
            <button
              key={id}
              type="button"
              className={kind === id ? "is-active" : undefined}
              aria-pressed={kind === id}
              onClick={() => setKind(id)}
            >
              {id === "service" ? "Service" : "Product"}
            </button>
          ))}
        </div>
        <label className="floor-settings-note">
          <span>Name</span>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value.slice(0, 80))}
            placeholder={kind === "product" ? "e.g. Hydrating serum" : "e.g. Balayage"}
            maxLength={80}
          />
        </label>
        <label className="floor-settings-note">
          <span>Price (optional)</span>
          <input
            value={price}
            onChange={(e) => setPrice(e.target.value.slice(0, 40))}
            placeholder="e.g. $180 or from $80"
            maxLength={40}
          />
        </label>
        <label className="floor-settings-note">
          <span>Details (optional)</span>
          <textarea
            rows={3}
            value={description}
            onChange={(e) => setDescription(e.target.value.slice(0, 500))}
            placeholder="What it includes, how long it takes…"
            maxLength={500}
          />
        </label>
        <div className="offerings-photo">
          {imageUrl ? (
            <div className="offerings-photo-preview">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={imageUrl} alt="" />
              <button
                type="button"
                className="btn-text"
                onClick={() => setImageUrl("")}
              >
                Remove photo
              </button>
            </div>
          ) : (
            <p className="editor-hint">Photo optional.</p>
          )}
          <input
            id={`${fieldId}-photo`}
            type="file"
            accept="image/*"
            className="sr-only"
            onChange={(e) => {
              const file = e.target.files?.[0] ?? null;
              e.target.value = "";
              void onPhoto(file);
            }}
          />
          <label htmlFor={`${fieldId}-photo`} className="btn-solid-sm file-label">
            {busy ? "Uploading…" : imageUrl ? "Change photo" : "Add photo"}
          </label>
        </div>
        {error ? <p className="editor-error">{error}</p> : null}
        <button type="button" className="btn-solid" onClick={addOffering}>
          Add
        </button>
      </section>

      {offerings.length === 0 ? (
        <p className="dashboard-empty">No products or services yet.</p>
      ) : (
        <ul className="offerings-list">
          {offerings.map((item) => {
            const url = askUrl(item.id);
            const sharing = shareId === item.id;
            return (
              <li key={item.id} className="offerings-card">
                <div className="offerings-card-head">
                  {item.imageUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={item.imageUrl} alt="" className="offerings-thumb" />
                  ) : (
                    <span className="offerings-thumb is-fallback" aria-hidden>
                      {item.title.slice(0, 1).toUpperCase()}
                    </span>
                  )}
                  <div className="offerings-card-main">
                    <span className="offerings-kind-label">
                      {item.kind === "product" ? "Product" : "Service"}
                    </span>
                    <input
                      value={item.title}
                      onChange={(e) =>
                        patchOffering(item.id, {
                          title: e.target.value.slice(0, 80),
                        })
                      }
                      aria-label="Name"
                    />
                    <input
                      value={item.price}
                      onChange={(e) =>
                        patchOffering(item.id, {
                          price: e.target.value.slice(0, 40),
                        })
                      }
                      aria-label="Price"
                      placeholder="Price"
                    />
                  </div>
                  <button
                    type="button"
                    className="floor-banner-remove icon-btn"
                    onClick={() => removeOffering(item.id)}
                    aria-label={`Remove ${item.title}`}
                    title="Remove"
                  >
                    <IconTrash size={13} />
                  </button>
                </div>
                <textarea
                  rows={2}
                  value={item.description}
                  onChange={(e) =>
                    patchOffering(item.id, {
                      description: e.target.value.slice(0, 500),
                    })
                  }
                  aria-label="Details"
                  placeholder="Details"
                />
                <div className="offerings-card-actions">
                  <button
                    type="button"
                    className="btn-ghost"
                    onClick={() =>
                      setShareId((current) =>
                        current === item.id ? null : item.id,
                      )
                    }
                  >
                    {sharing ? "Hide QR" : "QR & link"}
                  </button>
                  <button
                    type="button"
                    className="btn-ghost"
                    onClick={() => void copyAskLink(item.id)}
                  >
                    {copiedId === item.id ? (
                      <>
                        <IconCheck size={14} /> Copied
                      </>
                    ) : (
                      <>
                        <IconLink size={14} /> Copy link
                      </>
                    )}
                  </button>
                </div>
                {sharing ? (
                  <ShareQrCard
                    url={url}
                    businessName={item.title}
                    onCopyLink={() => void copyAskLink(item.id)}
                    copied={copiedId === item.id}
                  />
                ) : null}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
