"use client";

import type { Artifact } from "@/lib/types";

interface ArtifactThumbProps {
  artifact: Artifact;
}

export function ArtifactThumb({ artifact }: ArtifactThumbProps) {
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
