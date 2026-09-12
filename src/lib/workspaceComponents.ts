import type { FloorSettings, WorkspaceComponentId } from "./types";

export type { WorkspaceComponentId } from "./types";

export const WORKSPACE_COMPONENT_IDS = [
  "liveChat",
  "schedule",
  "forms",
  "cases",
  "contacts",
  "watch",
  "referrals",
  "affiliates",
  "storytelling",
  "chatWidget",
  "contactPage",
  "quickBuilds",
] as const;

export const WORKSPACE_TOOL_IDS = [
  "liveChat",
  "schedule",
  "forms",
  "watch",
  "referrals",
  "affiliates",
  "storytelling",
] as const satisfies readonly WorkspaceComponentId[];

const WORKSPACE_SET = new Set<string>(WORKSPACE_COMPONENT_IDS);

export interface WorkspaceComponentInfo {
  id: WorkspaceComponentId;
  label: string;
  blurb: string;
}

export const WORKSPACE_COMPONENT_CATALOG: WorkspaceComponentInfo[] = [
  { id: "referrals", label: "Referral Programs", blurb: "Set up programs in settings. Track leads and rewards in Referral Programs." },
  { id: "affiliates", label: "Affiliates", blurb: "Set up partners in settings. Track sales and payouts in Affiliates." },
  { id: "storytelling", label: "Storytelling", blurb: "Pick photo stories or written cases. Publish short job snaps or one-page writeups customers can search." },
  {
    id: "liveChat",
    label: "Live Chat",
    blurb: "Your inbox. Unlocks live chat on your micro-landing page and widget.",
  },
  {
    id: "schedule",
    label: "Schedule",
    blurb: "Appointment requests. Unlocks scheduling on your micro-landing page and widget.",
  },
  {
    id: "forms",
    label: "Forms",
    blurb: "Intake people fill out. Build them under Tools.",
  },
  {
    id: "cases",
    label: "Cases",
    blurb: "Track jobs and follow-ups.",
  },
  {
    id: "contacts",
    label: "Contacts",
    blurb: "People who left their name, email, or phone.",
  },
  {
    id: "watch",
    label: "Watch",
    blurb: "Busy hours and traffic. Stays in the workspace.",
  },
  {
    id: "chatWidget",
    label: "Your widget",
    blurb: "The bubble customers see on your website.",
  },
  {
    id: "contactPage",
    label: "Contact page",
    blurb: "A contact form you can put on your site.",
  },
  {
    id: "quickBuilds",
    label: "Customer actions",
    blurb: "Live chat, forms, scheduling, and contact buttons.",
  },
];

export function allWorkspaceComponentIds(): WorkspaceComponentId[] {
  return WORKSPACE_COMPONENT_IDS.slice();
}

export function isWorkspaceComponentId(
  value: unknown,
): value is WorkspaceComponentId {
  return typeof value === "string" && WORKSPACE_SET.has(value);
}

export function workspaceComponentInfo(
  id: WorkspaceComponentId,
): WorkspaceComponentInfo | undefined {
  return WORKSPACE_COMPONENT_CATALOG.find((item) => item.id === id);
}

export function normalizeEnabledWorkspace(
  raw: unknown,
): WorkspaceComponentId[] {
  if (!Array.isArray(raw)) return allWorkspaceComponentIds();
  const next: WorkspaceComponentId[] = [];
  for (const item of raw) {
    if (isWorkspaceComponentId(item) && !next.includes(item)) next.push(item);
  }
  return next;
}

export function resolveEnabledWorkspace(
  settings?: Partial<FloorSettings> | null,
): WorkspaceComponentId[] {
  return normalizeEnabledWorkspace(settings?.enabledWorkspace);
}

export function isWorkspaceComponentEnabled(
  settings: Partial<FloorSettings> | null | undefined,
  id: WorkspaceComponentId,
): boolean {
  return resolveEnabledWorkspace(settings).includes(id);
}
