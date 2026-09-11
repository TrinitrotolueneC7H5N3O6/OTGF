"use client";

import { useState } from "react";
import type { PreChatLink } from "@/lib/types";
import { QuickBuildModal } from "@/components/client/QuickBuildModal";
import { PreviewFrame } from "./PreviewFrame";

export function ToolPreview({ slug, link }: { slug: string; link: PreChatLink }) {
  const [revision, setRevision] = useState(0);
  return (
    <PreviewFrame onRestart={() => setRevision((n) => n + 1)}>
      <QuickBuildModal key={`${link.id}-${revision}`} slug={slug} link={link} embedded preview onClose={() => setRevision((n) => n + 1)} />
    </PreviewFrame>
  );
}
