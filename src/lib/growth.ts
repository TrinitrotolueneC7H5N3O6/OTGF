import type { StoryTemplate } from "./storytelling";

export type GrowthKind = "referral" | "affiliate" | "partner" | "conversion" | "story";
export type GrowthStatus = "draft" | "active" | "paused" | "archived" | "published" | "lead" | "confirmed" | "paid" | "rejected";
export interface GrowthData {
  title: string;
  description: string;
  status: GrowthStatus;
  programId: string;
  partnerId: string;
  email: string;
  rewardType: "fixed" | "percent";
  reward: number;
  currency: string;
  amount: number;
  commission: number;
  reference: string;
  challenge: string;
  process: string;
  outcome: string;
  date: string;
  photos: string[];
  tags: string[];
  chapters: Record<string, string>;
}
export interface GrowthRecord {
  id: string;
  kind: GrowthKind;
  data: GrowthData;
  visits: number;
  version: number;
  createdAt: string;
  updatedAt: string;
}
export function newGrowthData(kind: GrowthKind): GrowthData {
  return { title: "", description: "", status: kind === "partner" ? "active" : kind === "conversion" ? "lead" : "draft", programId: "", partnerId: "", email: "", rewardType: "fixed", reward: 0, currency: "USD", amount: 0, commission: 0, reference: "", challenge: "", process: "", outcome: "", date: "", photos: [], tags: [], chapters: {} };
}

function stringList(raw: unknown, maxItems: number, maxLength: number) {
  if (!Array.isArray(raw)) return [];
  const next: string[] = [];
  for (const item of raw) {
    if (typeof item !== "string") continue;
    const value = item.trim();
    if (!value || value.length > maxLength) continue;
    next.push(value);
    if (next.length >= maxItems) break;
  }
  return next;
}

function stringMap(raw: unknown, maxLength: number) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  const next: Record<string, string> = {};
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    if (typeof value !== "string") continue;
    const id = key.trim().slice(0, 32);
    if (!id) continue;
    next[id] = value.slice(0, maxLength);
  }
  return next;
}

export function validateGrowthData(kind: GrowthKind, raw: unknown, template?: StoryTemplate): GrowthData {
  if (!raw || typeof raw !== "object") throw new Error("Invalid record.");
  const input = raw as Record<string, unknown>;
  const result = newGrowthData(kind);
  for (const key of ["title", "description", "programId", "partnerId", "email", "reference", "challenge", "process", "outcome", "date"] as const) {
    const value = input[key];
    if (typeof value !== "string") throw new Error(`Invalid ${key}.`);
    const limit = ["challenge", "process", "outcome"].includes(key) ? 12000 : key === "description" ? 3000 : 200;
    if (value.length > limit) throw new Error(`${key} is too long.`);
    result[key] = value.trim();
  }
  result.photos = stringList(input.photos, 6, 400000);
  result.tags = stringList(input.tags, 8, 40).map((tag) => tag.toLowerCase());
  result.chapters = stringMap(input.chapters, 12000);
  if (kind === "story" && !Object.keys(result.chapters).length) {
    result.chapters = { situation: result.challenge, work: result.process, result: result.outcome };
  }
  if (kind === "story") {
    result.challenge = result.chapters.situation ?? result.challenge;
    result.process = result.chapters.work ?? result.process;
    result.outcome = result.chapters.result ?? result.outcome;
  }
  if (!result.title) {
    if (kind === "story" && template?.format === "photo") {
      const caption = result.chapters.caption?.trim() || result.description;
      result.title = caption
        ? (caption.replace(/\s+/g, " ").split(/[.!?]/).find((part) => part.trim()) || caption).trim().slice(0, 80)
        : result.status === "published" ? "" : "Untitled";
    }
    if (!result.title) throw new Error("Enter a name or title.");
  }
  if (result.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(result.email)) throw new Error("Enter a valid email.");
  const statuses: Record<GrowthKind, GrowthStatus[]> = {
    referral: ["draft", "active", "paused", "archived"], affiliate: ["draft", "active", "paused", "archived"],
    partner: ["active", "paused", "archived"], conversion: ["lead", "confirmed", "paid", "rejected"], story: ["draft", "published", "archived"],
  };
  if (!statuses[kind].includes(input.status as GrowthStatus)) throw new Error("Invalid status.");
  result.status = input.status as GrowthStatus;
  if (input.rewardType !== "fixed" && input.rewardType !== "percent") throw new Error("Invalid reward type.");
  result.rewardType = input.rewardType;
  for (const key of ["reward", "amount", "commission"] as const) {
    if (typeof input[key] !== "number" || !Number.isFinite(input[key]) || input[key] < 0 || input[key] > 100000000) throw new Error(`Invalid ${key}.`);
    result[key] = Math.round(input[key] * 100) / 100;
  }
  if (result.rewardType === "percent" && result.reward > 100) throw new Error("Percentage must be between 0 and 100.");
  if (typeof input.currency !== "string" || !["USD", "CAD", "EUR", "GBP", "AUD"].includes(input.currency)) throw new Error("Choose a supported currency.");
  result.currency = input.currency;
  if (kind === "story" && result.status === "published") {
    const format = template?.format ?? "writing";
    const chapters = Object.keys(result.chapters).length
      ? result.chapters
      : { situation: result.challenge, work: result.process, result: result.outcome };
    if (format === "photo") {
      const caption = chapters.caption?.trim() || result.description.trim();
      if (!caption) throw new Error("Add a short caption before publishing.");
      if (!result.photos.length) throw new Error("Add at least one photo before publishing.");
      if ((template?.photoStyle ?? "beforeAfter") === "beforeAfter" && result.photos.length < 2) {
        throw new Error("Add a before photo and an after photo before publishing.");
      }
      result.chapters = { ...chapters, caption };
      result.description = result.description.trim() || caption;
    } else {
      const required = (template?.sections ?? [
        { id: "situation", required: true },
        { id: "work", required: true },
        { id: "result", required: true },
      ]).filter((section) => section.required);
      if (required.some((section) => !chapters[section.id]?.trim())) {
        throw new Error("Fill every required part of the story before publishing.");
      }
      if (template?.photoStyle === "beforeAfter" && result.photos.length < 2) {
        throw new Error("Add a before photo and an after photo before publishing.");
      }
    }
  }
  return result;
}
export function commissionFor(amount: number, program: GrowthData) {
  return Math.round((program.rewardType === "percent" ? amount * program.reward / 100 : program.reward) * 100) / 100;
}
export function growthMetrics(records: GrowthRecord[], programId: string) {
  const partners = records.filter((r) => r.kind === "partner" && r.data.programId === programId);
  const conversions = records.filter((r) => r.kind === "conversion" && r.data.programId === programId);
  const confirmed = conversions.filter((r) => r.data.status === "confirmed" || r.data.status === "paid");
  return { partners: partners.length, visits: partners.reduce((n, r) => n + r.visits, 0), leads: conversions.filter((r) => r.data.status !== "rejected").length, confirmed: confirmed.length,
    revenue: confirmed.reduce((n, r) => n + r.data.amount, 0), owed: confirmed.filter((r) => r.data.status === "confirmed").reduce((n, r) => n + r.data.commission, 0), paid: confirmed.filter((r) => r.data.status === "paid").reduce((n, r) => n + r.data.commission, 0) };
}
export function money(value: number, currency: string) {
  return new Intl.NumberFormat(undefined, { style: "currency", currency }).format(value);
}
