"use client";

import { useEffect, useState } from "react";
import type { BusinessSpace } from "@/lib/types";
import { getSpace, subscribeSpace } from "@/lib/store";
import { isPublicActionEnabled } from "@/lib/toolPublic";
import {
  formShare,
  quickBuildConfigForLink,
} from "@/lib/quickBuilds";
import { defaultPreChat } from "@/lib/spaceNormalize";
import { QuickBuildModal } from "./QuickBuildModal";

interface FormPublicAppProps {
  slug: string;
  formId: string;
  scheduler?: boolean;
}

export function FormPublicApp({ slug, formId, scheduler = false }: FormPublicAppProps) {
  const [space, setSpace] = useState<BusinessSpace | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const loaded = await getSpace(slug);
        if (!cancelled) setSpace(loaded);
      } catch {
        if (!cancelled) setError("Could not open this page.");
      }
    })();
    const unsubscribe = subscribeSpace(slug, (next) => {
      if (next) setSpace(next);
    });
    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, [slug]);

  if (error) {
    return (
      <div className="client-missing">
        <h1>Nothing here</h1>
        <p>{error}</p>
      </div>
    );
  }
  if (!space) {
    return <div className="client-chat-loading">Loading…</div>;
  }

  const link = (space.settings.preChat ?? defaultPreChat()).links.find(
    (item) => item.id === formId,
  );
  const config = link ? quickBuildConfigForLink(link) : null;
  const allowed =
    Boolean(link) &&
    (scheduler
      ? config?.type === "scheduler" && isPublicActionEnabled(space.settings, "scheduler") && config.sharePage !== false
      : config?.type === "form" && isPublicActionEnabled(space.settings, "form") && formShare(link!).page);

  if (!allowed || !link) {
    return (
      <div className="client-missing">
        <h1>{scheduler ? "This scheduler is off" : "This form is off"}</h1>
        <p>Ask the business for an updated link.</p>
      </div>
    );
  }

  return (
    <div className="public-form-app">
      <QuickBuildModal
        link={link}
        slug={slug}
        embedded
        onClose={() => undefined}
      />
    </div>
  );
}
