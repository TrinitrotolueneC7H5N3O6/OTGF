"use client";

import type { Artifact } from "@/lib/types";

interface ArtifactThumbProps {
  artifact: Artifact;
}

export function ArtifactThumb({ artifact }: ArtifactThumbProps) {
  if (artifact.kind === "collection") {
    const shots = (
      artifact.urls?.length ? artifact.urls : artifact.url ? [artifact.url] : []
    ).slice(0, 3);
    return (
      <div
        className={`library-thumb library-thumb-fan count-${Math.min(shots.length, 3)}`}
        aria-hidden
      >
        {Array.from({ length: shots.length }, (_, order) => {
          const fan = shots.length - 1 - order;
          const src = shots[fan];
          return (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              key={`${fan}-${src.slice(0, 24)}`}
              src={src}
              alt=""
              className={`library-thumb-fan-card is-fan-${fan}`}
            />
          );
        })}
      </div>
    );
  }

  if (artifact.kind === "video") {
    return (
      <div className="library-thumb library-thumb-video">
        <video src={artifact.url} muted playsInline preload="metadata" />
        <span className="video-badge" aria-hidden>
          ▶
        </span>
      </div>
    );
  }

  if (artifact.kind === "photo" && artifact.url) {
    return (
      <div className="library-thumb">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={artifact.url} alt="" />
      </div>
    );
  }

  if (artifact.kind === "url") {
    return (
      <div className="library-thumb library-thumb-icon" aria-hidden>
        <span>URL</span>
      </div>
    );
  }

  return (
    <div className="library-thumb library-thumb-icon" aria-hidden>
      <span>Aa</span>
    </div>
  );
}
