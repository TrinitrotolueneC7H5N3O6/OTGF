import type { FloorSettings } from "./types";
import {
  isWorkspaceComponentEnabled,
  type WorkspaceComponentId,
} from "./workspaceComponents";
import {
  isPublicPageEnabled,
  isPublicWidgetEnabled,
} from "./toolPublic";
import type { SettingsTab } from "@/components/workspace/FloorSettingsPanel";
import type { PrefSection } from "@/components/workspace/UserPreferencesPanel";

export type DashNav =
  | "home"
  | "dashboard"
  | "floor"
  | `pref:${PrefSection}`
  | `account:${SettingsTab}`
  | "client:page"
  | "client:chat"
  | "site:contact"
  | "site:bubble"
  | "offerings"
  | "cases"
  | "cases:contacts"
  | "schedule"
  | "forms"
  | "referrals"
  | "affiliates"
  | "storytelling"
  | "widget-builds"
  | "tools:live-chat"
  | "tools:forms"
  | "tools:schedule"
  | "tools:referrals"
  | "tools:affiliates"
  | "tools:storytelling"
  | "online"
  | "insights"
  | "ai"
  | "feedback";

export type SettingsNavId = "tools" | "account";

export interface WorkNavItem {
  id: Extract<DashNav, "floor" | "schedule" | "forms" | "referrals" | "affiliates" | "storytelling" | "insights">;
  label: string;
}

export const WORK_NAV: WorkNavItem[] = [
  { id: "floor", label: "Live Chat" },
  { id: "schedule", label: "Appointments" },
  { id: "forms", label: "Forms" },
  { id: "referrals", label: "Referral Programs" },
  { id: "affiliates", label: "Affiliates" },
  { id: "storytelling", label: "Blog" },
  { id: "insights", label: "Site Activity" },
];

const WORK_NAV_COMPONENT: Record<WorkNavItem["id"], WorkspaceComponentId> = {
  floor: "liveChat",
  schedule: "schedule",
  forms: "forms",
  referrals: "referrals",
  affiliates: "affiliates",
  storytelling: "storytelling",
  insights: "watch",
};

export const SETTINGS_NAV: {
  id: SettingsNavId;
  label: string;
  nav: DashNav;
}[] = [
  { id: "tools", label: "Workspace setup", nav: "dashboard" },
  { id: "account", label: "Account", nav: "account:account" },
];

export const PUBLIC_SETTINGS_TABS: { nav: DashNav; label: string }[] = [
  { nav: "client:page", label: "Front Desk" },
  { nav: "client:chat", label: "Widget" },
];

export function visiblePresenceLeaves(settings?: FloorSettings | null) {
  return PUBLIC_SETTINGS_TABS.filter((tab) => {
    if (!settings) return true;
    if (tab.nav === "client:page") return isPublicPageEnabled(settings);
    if (tab.nav === "client:chat") return isPublicWidgetEnabled(settings);
    return false;
  });
}

export function presenceHomeNav(settings?: FloorSettings | null): DashNav {
  if (isPublicPageEnabled(settings)) return "client:page";
  if (isPublicWidgetEnabled(settings)) return "client:chat";
  return "online";
}

export const TOOL_SETTINGS_LEAVES: { nav: DashNav; label: string }[] = [
  { nav: "tools:live-chat", label: "Live Chat" },
  { nav: "tools:schedule", label: "Appointments" },
  { nav: "tools:forms", label: "Forms" },
  { nav: "tools:referrals", label: "Referral Programs" },
  { nav: "tools:affiliates", label: "Affiliates" },
  { nav: "tools:storytelling", label: "Blog" },
];

export function visibleToolsLeaves(settings?: FloorSettings | null) {
  return TOOL_SETTINGS_LEAVES.filter((tab) => {
    if (!settings) return true;
    if (tab.nav === "tools:referrals" || tab.nav === "tools:affiliates" || tab.nav === "tools:storytelling") return isWorkspaceComponentEnabled(settings, tab.nav.slice(6) as WorkspaceComponentId);
    if (tab.nav === "tools:live-chat") {
      return isWorkspaceComponentEnabled(settings, "liveChat");
    }
    if (tab.nav === "tools:schedule") return isWorkspaceComponentEnabled(settings, "schedule");
    if (tab.nav === "tools:forms") {
      return isWorkspaceComponentEnabled(settings, "forms");
    }
    return false;
  });
}

export const ACCOUNT_SETTINGS_NAV_TABS: { nav: DashNav; label: string }[] = [
  { nav: "account:billing", label: "Billing" },
  { nav: "account:notify", label: "Email alert" },
  { nav: "account:account", label: "Account" },
];

export const SETTINGS_QUERY_TO_NAV: Partial<Record<SettingsTab, DashNav>> = {
  brand: "client:page",
  hours: "client:page",
  shoutouts: "tools:live-chat",
};

export const SETTINGS_QUERY_TO_SECTION: Partial<Record<SettingsTab, string>> = {
  brand: "cf-look",
  hours: "cf-hours",
  shoutouts: "cf-promos",
};

export const LEGACY_NAV: Record<string, DashNav> = {
  "site:contact": "dashboard",
  "account:setup": "dashboard",
  offerings: "dashboard",
  "account:shortcuts": "dashboard",
  "pref:pre-chat": "client:page",
  "pref:intro": "tools:live-chat",
  "pref:links": "tools:live-chat",
  "pref:chat-interface": "tools:live-chat",
  "pref:sounds": "tools:live-chat",
  "account:brand": "client:page",
  "account:hours": "client:page",
  "account:shoutouts": "tools:live-chat",
  "site:bubble": "client:chat",
  "quick-builds": "widget-builds",
  "forms:referrals": "referrals",
  "forms:affiliates": "affiliates",
};

export const WORKSPACE_ROUTES: Array<[DashNav, string]> = [
  ["dashboard", "dashboard"],
  ["online", "settings/online"],
  ["floor", "live-chat"],
  ["schedule", "schedule"],
  ["forms", "forms"],
  ["referrals", "referrals"],
  ["affiliates", "affiliates"],
  ["storytelling", "storytelling"],
  ["cases", "cases"],
  ["cases:contacts", "contacts"],
  ["insights", "watch"],
  ["client:page", "settings/setup/public-page"],
  ["widget-builds", "settings/setup/widget-builds"],
  ["client:chat", "settings/setup/live-chat"],
  ["tools:live-chat", "settings/tools/live-chat"],
  ["tools:forms", "settings/tools/forms"],
  ["tools:schedule", "settings/tools/schedule"],
  ["tools:referrals", "settings/tools/referrals"],
  ["tools:affiliates", "settings/tools/affiliates"],
  ["tools:storytelling", "settings/tools/storytelling"],
  ["ai", "settings/knowledge/ai"],
  ["account:billing", "settings/account/billing"],
  ["account:notify", "settings/account/email-alerts"],
  ["account:account", "settings/account"],
  ["feedback", "feedback"],
];

const PATH_TO_NAV = new Map<string, DashNav>([
  ...WORKSPACE_ROUTES.map(([nav, path]) => [path, nav] as const),
  ["settings/setup/quick-builds", "widget-builds"],
  ["forms/referrals", "referrals"],
  ["forms/affiliates", "affiliates"],
  ["settings/account/sounds", "pref:sounds"],
]);

export function knownNavForPath(rest: string): DashNav | null {
  return PATH_TO_NAV.get(rest.replace(/\/$/, "")) ?? null;
}

const LEGACY_DASHBOARD_PATHS: Record<string, DashNav> = {
  "": "dashboard",
  "public-page": "client:page",
  "contact-page": "dashboard",
  "quick-builds": "widget-builds",
  "widget-builds": "widget-builds",
  watch: "insights",
  forms: "forms",
  "live-chat": "client:chat",
  ai: "ai",
  "case-records": "cases",
  "collected-contacts": "cases:contacts",
  industry: "dashboard",
  "what-you-offer": "dashboard",
  billing: "account:billing",
  "email-alerts": "account:notify",
  "your-account": "account:account",
  sounds: "tools:live-chat",
  shortcuts: "dashboard",
};

export const HASH_TO_NAV: Record<string, DashNav> = {
  "cf-look": "client:page",
  "cf-hours": "client:page",
  "cf-promos": "tools:live-chat",
  "cf-links": "tools:live-chat",
  "cf-initial-messages": "tools:live-chat",
  "cf-staff-out": "tools:live-chat",
  "cf-end-screen": "tools:live-chat",
  "cf-sounds": "tools:live-chat",
  "cf-bubble": "client:chat",
};

export const WIDGET_BUILD_CHAT_HASHES = new Set(["chat", "cf-bubble"]);

export const LIVE_CHAT_SETTINGS_HASHES = new Set([
  "cf-sounds",
  "cf-promos",
  "cf-links",
  "cf-initial-messages",
  "cf-staff-out",
  "cf-end-screen",
]);

export function canonicalNav(nav: DashNav): DashNav {
  return LEGACY_NAV[nav] ?? nav;
}

export function dashHref(slug: string, nav: DashNav, hash = "") {
  const next = canonicalNav(nav);
  const path =
    next === "home"
      ? "floor"
      : (WORKSPACE_ROUTES.find(([id]) => id === next)?.[1] ?? "floor");
  const href = `/${slug}/${path}`;
  return hash ? `${href}#${hash}` : href;
}

export function legacyDashboardRedirect(slug: string, section: string[] = []) {
  const key = section.filter(Boolean).join("/");
  return dashHref(slug, LEGACY_DASHBOARD_PATHS[key] ?? "dashboard");
}

export function navFromPathname(pathname: string, slug: string): DashNav {
  const prefix = `/${slug}/`;
  if (pathname === `/${slug}` || pathname === `/${slug}/`) return "home";
  if (!pathname.startsWith(prefix)) return "floor";
  const rest = pathname.slice(prefix.length).replace(/\/$/, "");
  if (rest === "floor" || rest.startsWith("floor/")) return "floor";
  if (rest === "dashboard") return "dashboard";
  if (rest.startsWith("dashboard/")) {
    const legacy = rest.slice("dashboard/".length);
    return LEGACY_DASHBOARD_PATHS[legacy] ?? "dashboard";
  }
  return knownNavForPath(rest) ?? "floor";
}

export function isWorkNav(nav: DashNav): boolean {
  return WORK_NAV.some((item) => item.id === canonicalNav(nav));
}

export function isPublicSettingsNav(nav: DashNav) {
  const next = canonicalNav(nav);
  return (
    next === "widget-builds" ||
    PUBLIC_SETTINGS_TABS.some((tab) => tab.nav === next)
  );
}

export function isAccountSettingsNav(nav: DashNav) {
  const next = canonicalNav(nav);
  return ACCOUNT_SETTINGS_NAV_TABS.some((tab) => tab.nav === next);
}

export function isSettingsNav(nav: DashNav): boolean {
  const next = canonicalNav(nav);
  return (
    next === "dashboard" ||
    next === "online" ||
    next.startsWith("tools:") ||
    next === "tools:live-chat" ||
    next === "tools:forms" ||
    next === "tools:schedule" ||
    isPublicSettingsNav(next) ||
    isAccountSettingsNav(next)
  );
}

export function settingsNavIdFor(nav: DashNav): SettingsNavId | null {
  const next = canonicalNav(nav);
  if (next.startsWith("tools:") || next === "dashboard" || next === "tools:live-chat" || next === "tools:forms" || next === "tools:schedule") {
    return "tools";
  }
  if (next === "online" || isPublicSettingsNav(next)) return "tools";
  if (isAccountSettingsNav(next)) return "account";
  return null;
}

export function visibleWorkNav(settings?: FloorSettings | null) {
  if (!settings) return WORK_NAV;
  return WORK_NAV.filter((item) =>
    isWorkspaceComponentEnabled(settings, WORK_NAV_COMPONENT[item.id]),
  );
}

export function workspaceHomeNav(
  settings?: FloorSettings | null,
): Extract<DashNav, "floor" | "dashboard"> {
  if (!settings || isWorkspaceComponentEnabled(settings, "liveChat")) {
    return "floor";
  }
  return "dashboard";
}

export function isNavEnabled(settings: FloorSettings, nav: DashNav) {
  const next = canonicalNav(nav);
  if (next === "dashboard" || next === "home" || next === "online") return true;
  if (next === "tools:referrals" || next === "tools:affiliates" || next === "tools:storytelling") return isWorkspaceComponentEnabled(settings, next.slice(6) as WorkspaceComponentId);
  if (next === "tools:live-chat") {
    return isWorkspaceComponentEnabled(settings, "liveChat");
  }
  if (next === "tools:schedule") return isWorkspaceComponentEnabled(settings, "schedule");
  if (next === "tools:forms") {
    return isWorkspaceComponentEnabled(settings, "forms");
  }
  if (next === "client:page") return isPublicPageEnabled(settings);
  if (next === "client:chat") return isPublicWidgetEnabled(settings);
  if (isPublicSettingsNav(next) || isAccountSettingsNav(next)) return true;
  const work = WORK_NAV.find((item) => item.id === next);
  if (work) {
    return isWorkspaceComponentEnabled(settings, WORK_NAV_COMPONENT[work.id]);
  }
  return true;
}

export const SIDEBAR_COLLAPSED_KEY = "otgf-nav-collapsed";
export const SIDEBAR_SECTIONS_KEY = "otgf-nav-sections";
