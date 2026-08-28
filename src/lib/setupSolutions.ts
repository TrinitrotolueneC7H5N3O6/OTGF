import type { FloorSettings } from "./types";

/** Optional modules a floor can turn on. Live chat, brand, and team stay on. */
export const SOLUTION_IDS = [
  "preChat",
  "chatInterface",
  "intro",
  "specialties",
  "consultations",
  "promos",
  "artifacts",
  "receipts",
  "assist",
  "shoutouts",
  "shortcuts",
  "hours",
] as const;

export type SolutionId = (typeof SOLUTION_IDS)[number];

export const SETUP_INDUSTRY_IDS = [
  "salon",
  "hair",
  "food",
  "retail",
  "auto",
  "custom",
] as const;

export type SetupIndustry = (typeof SETUP_INDUSTRY_IDS)[number];

export interface SolutionInfo {
  id: SolutionId;
  label: string;
  blurb: string;
}

export interface IndustryInfo {
  id: SetupIndustry;
  label: string;
  blurb: string;
  solutions: readonly SolutionId[];
}

export const SOLUTION_CATALOG: SolutionInfo[] = [
  {
    id: "preChat",
    label: "Public page",
    blurb: "The page people hit from your link, before live chat.",
  },
  {
    id: "chatInterface",
    label: "Chat interface",
    blurb: "Marketing photo carousel at the bottom of customer chat.",
  },
  {
    id: "intro",
    label: "Intro messages",
    blurb: "Welcome copy customers see when they open chat.",
  },
  {
    id: "specialties",
    label: "Specialties & departments",
    blurb: "Numbered department buttons for menus, services, or teams.",
  },
  {
    id: "consultations",
    label: "Consultations",
    blurb: "Let customers request an in-person booking from chat.",
  },
  {
    id: "promos",
    label: "Promos",
    blurb: "One-tap ask for today’s promotions.",
  },
  {
    id: "artifacts",
    label: "Artifacts",
    blurb: "Send looks, menus, photos, and saved replies from the floor.",
  },
  {
    id: "receipts",
    label: "Receipts",
    blurb: "Quote a product or service and collect payment in chat.",
  },
  {
    id: "assist",
    label: "Assist",
    blurb: "AI coaching beside the live thread.",
  },
  {
    id: "shoutouts",
    label: "Shoutouts",
    blurb: "Promo banners at the top of customer chat.",
  },
  {
    id: "shortcuts",
    label: "Shortcuts",
    blurb: "One-tap chips on the floor composer.",
  },
  {
    id: "hours",
    label: "Hours",
    blurb: "Show when you usually reply, on chat and the public page.",
  },
];

const ALL_SOLUTIONS: SolutionId[] = SOLUTION_IDS.slice();

export const INDUSTRY_CATALOG: IndustryInfo[] = [
  {
    id: "salon",
    label: "Salon & spa",
    blurb: "Appointments, services, and look books.",
    solutions: [
      "preChat",
      "intro",
      "specialties",
      "consultations",
      "artifacts",
      "shoutouts",
      "hours",
    ],
  },
  {
    id: "hair",
    label: "Hair studio",
    blurb: "Styles, consultations, and a visual first impression.",
    solutions: [
      "preChat",
      "chatInterface",
      "intro",
      "specialties",
      "consultations",
      "artifacts",
      "hours",
    ],
  },
  {
    id: "food",
    label: "Food & drink",
    blurb: "Menus, specials, and pay-in-chat orders.",
    solutions: [
      "preChat",
      "intro",
      "artifacts",
      "receipts",
      "promos",
      "shoutouts",
      "hours",
    ],
  },
  {
    id: "retail",
    label: "Retail shop",
    blurb: "Products, promos, and checkout links.",
    solutions: [
      "preChat",
      "chatInterface",
      "artifacts",
      "receipts",
      "promos",
      "shoutouts",
      "hours",
    ],
  },
  {
    id: "auto",
    label: "Auto & local service",
    blurb: "Quotes, bookings, and canned replies on the floor.",
    solutions: [
      "preChat",
      "intro",
      "consultations",
      "assist",
      "shortcuts",
      "receipts",
      "hours",
    ],
  },
  {
    id: "custom",
    label: "Custom",
    blurb: "Every module, laid out so you can pick your own mix.",
    solutions: ALL_SOLUTIONS,
  },
];

const SOLUTION_SET = new Set<string>(SOLUTION_IDS);
const INDUSTRY_SET = new Set<string>(SETUP_INDUSTRY_IDS);

export function allSolutionIds(): SolutionId[] {
  return ALL_SOLUTIONS.slice();
}

export function isSolutionId(value: unknown): value is SolutionId {
  return typeof value === "string" && SOLUTION_SET.has(value);
}

export function isSetupIndustry(value: unknown): value is SetupIndustry {
  return typeof value === "string" && INDUSTRY_SET.has(value);
}

export function solutionsForIndustry(industry: SetupIndustry): SolutionId[] {
  const row = INDUSTRY_CATALOG.find((item) => item.id === industry);
  return [...(row?.solutions ?? ALL_SOLUTIONS)];
}

export function industryInfo(industry: SetupIndustry): IndustryInfo {
  return (
    INDUSTRY_CATALOG.find((item) => item.id === industry) ??
    INDUSTRY_CATALOG[INDUSTRY_CATALOG.length - 1]
  );
}

export function solutionInfo(id: SolutionId): SolutionInfo | undefined {
  return SOLUTION_CATALOG.find((item) => item.id === id);
}

export function normalizeSetupIndustry(raw: unknown): SetupIndustry {
  return isSetupIndustry(raw) ? raw : "custom";
}

export function normalizeEnabledSolutions(
  raw: unknown,
  industry: SetupIndustry,
): SolutionId[] {
  if (industry !== "custom") return solutionsForIndustry(industry);
  if (!Array.isArray(raw)) return allSolutionIds();
  const next: SolutionId[] = [];
  for (const item of raw) {
    if (isSolutionId(item) && !next.includes(item)) next.push(item);
  }
  return next;
}

export function resolveSetupIndustry(
  settings?: Partial<FloorSettings> | null,
): SetupIndustry {
  return normalizeSetupIndustry(settings?.setupIndustry);
}

export function resolveEnabledSolutions(
  settings?: Partial<FloorSettings> | null,
): SolutionId[] {
  const industry = resolveSetupIndustry(settings);
  return normalizeEnabledSolutions(settings?.enabledSolutions, industry);
}

export function isSolutionEnabled(
  settings: Partial<FloorSettings> | null | undefined,
  id: SolutionId,
): boolean {
  return resolveEnabledSolutions(settings).includes(id);
}

export const PREF_SECTION_SOLUTION: Record<string, SolutionId> = {
  intro: "intro",
  "chat-interface": "chatInterface",
  "pre-chat": "preChat",
};

export const ACCOUNT_TAB_SOLUTION: Record<string, SolutionId> = {
  hours: "hours",
  shortcuts: "shortcuts",
  shoutouts: "shoutouts",
};
