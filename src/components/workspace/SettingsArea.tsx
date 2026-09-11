"use client";

import { createContext, useContext, useMemo, useState, type ReactNode } from "react";
import Link from "next/link";
import { dashHref, type DashNav } from "@/lib/workspaceNav";

const SettingsChromeContext = createContext<{ crumb: boolean; slot: HTMLElement | null }>({
  crumb: false,
  slot: null,
});

export function useSettingsChrome() {
  return useContext(SettingsChromeContext);
}

function crumbLabel(nav: DashNav, title: string, tabs: { nav: DashNav; label: string }[]) {
  return tabs.find((tab) => tab.nav === nav)?.label
    ?? (nav === "widget-builds" ? "Actions" : title);
}

export function SettingsArea({
  slug,
  title,
  help,
  tabs,
  active,
  variant = "page",
  children,
}: {
  slug: string;
  title: string;
  help?: string;
  tabs: { nav: DashNav; label: string }[];
  active: DashNav;
  variant?: "page" | "crumb";
  children: ReactNode;
}) {
  const [slot, setSlot] = useState<HTMLElement | null>(null);
  const crumb = variant === "crumb";
  const chrome = useMemo(() => ({ crumb, slot }), [crumb, slot]);
  const currentLabel = crumbLabel(active, title, tabs);
  const menuTabs = tabs.some((tab) => tab.nav === active)
    ? tabs
    : [...tabs, { nav: active, label: currentLabel }];

  return (
    <SettingsChromeContext.Provider value={chrome}>
      <div className={`settings-area${crumb ? " is-crumb" : ""}`}>
        <header className={`settings-area-head${crumb ? " is-crumb" : ""}`}>
          {crumb ? (
            <>
              <nav className="settings-crumb" aria-label={title}>
                <span className="settings-crumb-root">{title}</span>
                <div className="settings-crumb-pills">
                  {menuTabs.map((tab) => (
                    <Link
                      key={tab.nav}
                      href={dashHref(slug, tab.nav)}
                      scroll={false}
                      className={active === tab.nav ? "is-active" : undefined}
                      aria-current={active === tab.nav ? "page" : undefined}
                    >
                      {tab.label}
                    </Link>
                  ))}
                </div>
              </nav>
              <div className="settings-crumb-actions" ref={setSlot} />
            </>
          ) : (
            <>
              <h1 className="dashboard-panel-title">{title}</h1>
              {help ? <p className="floor-settings-help">{help}</p> : null}
              {tabs.length > 0 ? (
                <nav className="settings-area-tabs" aria-label={title}>
                  {tabs.map((tab) => (
                    <Link
                      key={tab.nav}
                      href={dashHref(slug, tab.nav)}
                      scroll={false}
                      className={active === tab.nav ? "is-active" : undefined}
                      aria-current={active === tab.nav ? "page" : undefined}
                    >
                      {tab.label}
                    </Link>
                  ))}
                </nav>
              ) : null}
            </>
          )}
        </header>
        <div className="settings-area-body">{children}</div>
      </div>
    </SettingsChromeContext.Provider>
  );
}
