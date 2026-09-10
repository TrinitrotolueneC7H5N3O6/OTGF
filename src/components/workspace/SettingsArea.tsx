"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { dashHref, type DashNav } from "@/lib/workspaceNav";

export function SettingsArea({
  slug,
  title,
  help,
  tabs,
  active,
  children,
}: {
  slug: string;
  title: string;
  help: string;
  tabs: { nav: DashNav; label: string }[];
  active: DashNav;
  children: ReactNode;
}) {
  return (
    <div className="settings-area">
      <header className="settings-area-head">
        <h1 className="dashboard-panel-title">{title}</h1>
        <p className="floor-settings-help">{help}</p>
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
      </header>
      <div className="settings-area-body">{children}</div>
    </div>
  );
}
