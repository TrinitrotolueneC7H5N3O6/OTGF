"use client";

import { slugify } from "@/lib/spaceNormalize";
import {
  emptyLeadFunnelDraft,
  type CapturedLead,
  type LeadAnswer,
  type LeadGenFunnelDraft,
} from "./types";

const DRAFT_KEY = "routecraft-funnel-draft-v1";
const LEADS_KEY = "routecraft-leads-v1";

const draftListeners = new Set<() => void>();

function notifyDraftChange() {
  for (const fn of draftListeners) fn();
}

export function subscribeFunnelDraft(onChange: () => void): () => void {
  draftListeners.add(onChange);
  return () => draftListeners.delete(onChange);
}

export function loadFunnelDraft(): LeadGenFunnelDraft {
  if (typeof window === "undefined") return emptyLeadFunnelDraft();
  try {
    const raw = window.localStorage.getItem(DRAFT_KEY);
    if (!raw) return emptyLeadFunnelDraft();
    const parsed = JSON.parse(raw) as Partial<LeadGenFunnelDraft>;
    const base = emptyLeadFunnelDraft();
    return {
      ...base,
      ...parsed,
      business: { ...base.business, ...parsed.business },
      offer: { ...base.offer, ...parsed.offer },
      contactFields: { ...base.contactFields, ...parsed.contactFields },
      thankYou: { ...base.thankYou, ...parsed.thankYou },
      questions: parsed.questions ?? base.questions,
    };
  } catch {
    return emptyLeadFunnelDraft();
  }
}

export function saveFunnelDraft(
  updater: (draft: LeadGenFunnelDraft) => LeadGenFunnelDraft,
): LeadGenFunnelDraft {
  const current = loadFunnelDraft();
  const next = { ...updater(current), updatedAt: new Date().toISOString() };
  if (typeof window !== "undefined") {
    window.localStorage.setItem(DRAFT_KEY, JSON.stringify(next));
  }
  notifyDraftChange();
  return next;
}

export function resetFunnelDraft() {
  if (typeof window !== "undefined") {
    window.localStorage.removeItem(DRAFT_KEY);
  }
  notifyDraftChange();
}

/** Publish: mint a slug from the business name (if not already set) and stamp publishedAt. */
export function publishFunnelDraft(): LeadGenFunnelDraft {
  return saveFunnelDraft((draft) => {
    const slug = draft.slug || slugify(draft.business.name || "my-funnel");
    return { ...draft, slug, publishedAt: new Date().toISOString() };
  });
}

function readAllPublished(): Record<string, LeadGenFunnelDraft> {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem("routecraft-published-v1");
    return raw ? (JSON.parse(raw) as Record<string, LeadGenFunnelDraft>) : {};
  } catch {
    return {};
  }
}

/** Published funnels are snapshotted separately from the in-progress draft
 * so an operator can keep editing without breaking their live link, and so
 * the public /f/[slug] page can look up a funnel by slug directly. */
export function snapshotPublishedFunnel(draft: LeadGenFunnelDraft) {
  if (typeof window === "undefined" || !draft.slug) return;
  const all = readAllPublished();
  all[draft.slug] = draft;
  window.localStorage.setItem("routecraft-published-v1", JSON.stringify(all));
}

export function getPublishedFunnel(slug: string): LeadGenFunnelDraft | null {
  const all = readAllPublished();
  return all[slug] ?? null;
}

export function loadLeads(): CapturedLead[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(LEADS_KEY);
    return raw ? (JSON.parse(raw) as CapturedLead[]) : [];
  } catch {
    return [];
  }
}

export function addLead(input: {
  slug: string;
  name: string;
  phone: string;
  email: string;
  zip: string;
  answers: LeadAnswer[];
}): CapturedLead {
  const lead: CapturedLead = {
    id: `lead-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    createdAt: new Date().toISOString(),
    ...input,
  };
  const leads = [lead, ...loadLeads()];
  if (typeof window !== "undefined") {
    window.localStorage.setItem(LEADS_KEY, JSON.stringify(leads));
  }
  return lead;
}
