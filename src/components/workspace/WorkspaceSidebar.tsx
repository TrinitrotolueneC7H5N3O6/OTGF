"use client";

import { useEffect, useLayoutEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { FloorSettings } from "@/lib/types";
import {
  ACCOUNT_SETTINGS_NAV_TABS,
  SETTINGS_NAV,
  SIDEBAR_COLLAPSED_KEY,
  SIDEBAR_SECTIONS_KEY,
  dashHref,
  isPublicSettingsNav,
  navFromPathname,
  settingsNavIdFor,
  visiblePresenceLeaves,
  visibleToolsLeaves,
  visibleWorkNav,
  type DashNav,
} from "@/lib/workspaceNav";
import {
  IconCalendar,
  IconChevronDown,
  IconChevronLeft,
  IconChevronRight,
  IconClipboard,
  IconEye,
  IconFeedback,
  IconGrid,
  IconPhoto,
  IconStar,
  IconThumbUp,
  IconUser,
  IconUsers,
} from "@/components/shared/Icons";

interface WorkspaceSidebarProps {
  slug: string;
  settings?: FloorSettings | null;
}

const WORK_ICONS = {
  floor: IconFeedback,
  schedule: IconCalendar,
  forms: IconClipboard,
  referrals: IconStar,
  affiliates: IconUsers,
  storytelling: IconPhoto,
  insights: IconEye,
} as const;

const SETTINGS_ICONS = {
  tools: IconGrid,
  account: IconUser,
} as const;

type SectionId = "setup" | "tools" | "platforms" | "account";

const DEFAULT_OPEN: Record<SectionId, boolean> = {
  setup: false,
  tools: false,
  platforms: false,
  account: false,
};

function readCollapsed() {
  try {
    const saved = window.localStorage.getItem(SIDEBAR_COLLAPSED_KEY);
    if (saved === "1") return true;
    if (saved === "0") return false;
  } catch {
    // ignore
  }
  return window.matchMedia("(max-width: 980px)").matches;
}

function syncCollapsedAttr(next: boolean) {
  if (next) document.documentElement.setAttribute("data-nav-collapsed", "1");
  else document.documentElement.removeAttribute("data-nav-collapsed");
}

function persistCollapsed(next: boolean) {
  try {
    window.localStorage.setItem(SIDEBAR_COLLAPSED_KEY, next ? "1" : "0");
  } catch {
    // ignore
  }
  syncCollapsedAttr(next);
}

function readSections(): Partial<Record<SectionId, boolean>> {
  try {
    const saved = window.localStorage.getItem(SIDEBAR_SECTIONS_KEY);
    if (!saved) return {};
    const parsed = JSON.parse(saved) as Partial<Record<SectionId, boolean>>;
    if (!parsed || typeof parsed !== "object") return {};
    return parsed;
  } catch {
    return {};
  }
}

function persistSections(next: Record<SectionId, boolean>) {
  try {
    window.localStorage.setItem(SIDEBAR_SECTIONS_KEY, JSON.stringify(next));
  } catch {
    // ignore
  }
}

function ancestorsFor(active: DashNav): Partial<Record<SectionId, boolean>> {
  const id = settingsNavIdFor(active);
  if (id === "account") return { account: true };
  if (id !== "tools") return {};
  if (isPublicSettingsNav(active)) return { setup: true, platforms: true };
  if (active === "dashboard") return { setup: true };
  return { setup: true, tools: true };
}

export function WorkspaceSidebar({ slug, settings }: WorkspaceSidebarProps) {
  const pathname = usePathname();
  const active = navFromPathname(pathname, slug);
  const [collapsed, setCollapsed] = useState(false);
  const [open, setOpen] = useState<Record<SectionId, boolean>>(DEFAULT_OPEN);
  const settingsId = settingsNavIdFor(active);
  const presenceLeaves = visiblePresenceLeaves(settings);
  const toolsLeaves = visibleToolsLeaves(settings);

  useLayoutEffect(() => {
    const next = readCollapsed();
    setCollapsed(next);
    syncCollapsedAttr(next);
  }, []);

  useEffect(() => {
    setOpen({
      ...DEFAULT_OPEN,
      ...readSections(),
      ...ancestorsFor(active),
    });
    // Open the section for the first page only; later route changes use the effect below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    setOpen((current) => ({ ...current, ...ancestorsFor(active) }));
  }, [active]);

  function toggleCollapsed() {
    setCollapsed((current) => {
      const next = !current;
      persistCollapsed(next);
      return next;
    });
  }

  function toggleSection(id: SectionId) {
    setOpen((current) => {
      const next = { ...current, [id]: !current[id] };
      persistSections(next);
      return next;
    });
  }

  return (
    <nav
      className={`workspace-sidebar${collapsed ? " is-collapsed" : ""}`}
      aria-label="Workspace"
    >
      <button
        type="button"
        className="workspace-sidebar-collapse"
        onClick={toggleCollapsed}
        aria-pressed={collapsed}
        title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
      >
        {collapsed ? (
          <IconChevronRight size={16} />
        ) : (
          <IconChevronLeft size={16} />
        )}
        <span className="workspace-sidebar-label">
          {collapsed ? "Expand" : "Collapse"}
        </span>
      </button>

      <div className="workspace-sidebar-scroll">
      <div className="workspace-sidebar-work">
        {visibleWorkNav(settings).map((item) => {
          const Icon = WORK_ICONS[item.id];
          return (
            <Link
              key={item.id}
              href={dashHref(slug, item.id)}
              scroll={false}
              title={item.label}
              className={`workspace-sidebar-item${active === item.id ? " is-active" : ""}`}
              aria-current={active === item.id ? "page" : undefined}
            >
              <Icon size={18} />
              <span className="workspace-sidebar-label">{item.label}</span>
            </Link>
          );
        })}
      </div>

      <div className="workspace-sidebar-settings">
        {SETTINGS_NAV.map((item) => {
          const Icon = SETTINGS_ICONS[item.id];
          const parentActive = settingsId === item.id;
          const sectionId: SectionId = item.id === "account" ? "account" : "setup";
          const sectionOpen = open[sectionId];
          const groups = item.id === "tools"
            ? [
                { id: "tools" as const, label: "Tools", leaves: toolsLeaves },
                { id: "platforms" as const, label: "Get In Touch", leaves: presenceLeaves },
              ].filter((group) => group.leaves.length > 0)
            : item.id === "account"
              ? [{ id: "account" as const, label: "", leaves: ACCOUNT_SETTINGS_NAV_TABS }]
              : [];
          const showChildren = !collapsed && sectionOpen && groups.length > 0;

          return (
            <div key={item.id}>
              <div className="workspace-sidebar-heading">
                <Link
                  href={dashHref(slug, item.nav)}
                  scroll={false}
                  title={item.label}
                  className={`workspace-sidebar-item${parentActive ? " is-active" : ""}`}
                  aria-current={parentActive ? "page" : undefined}
                >
                  <Icon size={18} />
                  <span className="workspace-sidebar-label">{item.label}</span>
                </Link>
                {groups.length > 0 ? (
                  <button
                    type="button"
                    className="workspace-sidebar-twist"
                    aria-expanded={sectionOpen}
                    aria-label={sectionOpen ? `Collapse ${item.label}` : `Expand ${item.label}`}
                    onClick={() => toggleSection(sectionId)}
                  >
                    <IconChevronDown size={14} className={sectionOpen ? "is-open" : undefined} />
                  </button>
                ) : null}
              </div>
              {showChildren ? (
                <div className="workspace-sidebar-leaves">
                  {groups.map((group) => {
                    const nested = Boolean(group.label);
                    const groupOpen = nested ? open[group.id] : true;
                    const leafActive = group.leaves.some((leaf) => leaf.nav === active);
                    return (
                      <div key={group.id} role="group" aria-label={group.label || item.label}>
                        {nested ? (
                          <button
                            type="button"
                            className={`workspace-sidebar-group workspace-sidebar-settings-toggle${leafActive ? " is-active" : ""}`}
                            aria-expanded={groupOpen}
                            onClick={() => toggleSection(group.id)}
                          >
                            <span className="workspace-sidebar-group-label">
                              {group.label}
                            </span>
                            <IconChevronDown size={14} className={groupOpen ? "is-open" : undefined} />
                          </button>
                        ) : null}
                        {groupOpen
                          ? nested
                            ? (
                              <div className="workspace-sidebar-leaves is-nested">
                                {group.leaves.map((leaf) => (
                                  <Link
                                    key={leaf.nav}
                                    href={dashHref(slug, leaf.nav)}
                                    scroll={false}
                                    title={leaf.label}
                                    className={`workspace-sidebar-item is-leaf${active === leaf.nav ? " is-active" : ""}`}
                                    aria-current={active === leaf.nav ? "page" : undefined}
                                  >
                                    <span className="workspace-sidebar-label">
                                      {leaf.label}
                                    </span>
                                  </Link>
                                ))}
                              </div>
                            )
                            : group.leaves.map((leaf) => (
                              <Link
                                key={leaf.nav}
                                href={dashHref(slug, leaf.nav)}
                                scroll={false}
                                title={leaf.label}
                                className={`workspace-sidebar-item is-leaf${active === leaf.nav ? " is-active" : ""}`}
                                aria-current={active === leaf.nav ? "page" : undefined}
                              >
                                <span className="workspace-sidebar-label">
                                  {leaf.label}
                                </span>
                              </Link>
                            ))
                          : null}
                      </div>
                    );
                  })}
                </div>
              ) : null}
            </div>
          );
        })}
      </div>
      <Link
        href={dashHref(slug, "feedback")}
        scroll={false}
        title="Feedback board"
        className={`workspace-sidebar-item${active === "feedback" ? " is-active" : ""}`}
        aria-current={active === "feedback" ? "page" : undefined}
      >
        <IconThumbUp size={18} />
        <span className="workspace-sidebar-label">Feedback board</span>
      </Link>
      </div>
    </nav>
  );
}
