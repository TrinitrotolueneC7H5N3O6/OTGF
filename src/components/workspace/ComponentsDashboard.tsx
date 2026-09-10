"use client";

import Link from "next/link";
import type { FloorSettings } from "@/lib/types";
import {
  WORKSPACE_COMPONENT_IDS,
  WORKSPACE_TOOL_IDS,
  resolveEnabledWorkspace,
  workspaceComponentInfo,
  type WorkspaceComponentId,
} from "@/lib/workspaceComponents";
import {
  SOLUTION_IDS,
  resolveEnabledSolutions,
} from "@/lib/setupSolutions";
import {
  PUBLIC_SURFACE_CATALOG,
  isPublicPageEnabled,
  isPublicWidgetEnabled,
  type PublicSurfaceId,
} from "@/lib/toolPublic";
import { dashHref, visibleToolsLeaves } from "@/lib/workspaceNav";

interface ComponentsDashboardProps {
  slug: string;
  settings: FloorSettings;
  onChangeSettings: (settings: FloorSettings) => void;
}

function ToggleRow({
  label,
  blurb,
  on,
  onToggle,
}: {
  label: string;
  blurb: string;
  on: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      className={`components-toggle-row${on ? " is-on" : ""}`}
      role="switch"
      aria-checked={on}
      aria-label={label}
      onClick={onToggle}
    >
      <span className="components-toggle-copy">
        <strong>{label}</strong>
        <em>{blurb}</em>
      </span>
      <span className={`components-switch${on ? " is-on" : ""}`} aria-hidden />
    </button>
  );
}

export function ComponentsDashboard({
  slug,
  settings,
  onChangeSettings,
}: ComponentsDashboardProps) {
  const workspaceOn = new Set(resolveEnabledWorkspace(settings));
  const toolSettings = visibleToolsLeaves(settings);

  function toggleTool(id: WorkspaceComponentId) {
    const enabled = new Set(workspaceOn);
    if (enabled.has(id)) enabled.delete(id);
    else enabled.add(id);
    onChangeSettings({
      ...settings,
      enabledWorkspace: WORKSPACE_COMPONENT_IDS.filter((item) =>
        enabled.has(item),
      ),
    });
  }

  function toggleSurface(id: PublicSurfaceId) {
    if (id === "page") {
      const on = new Set(resolveEnabledSolutions(settings));
      if (isPublicPageEnabled(settings)) on.delete("preChat");
      else on.add("preChat");
      onChangeSettings({
        ...settings,
        setupIndustry: "custom",
        enabledSolutions: SOLUTION_IDS.filter((item) => on.has(item)),
      });
      return;
    }
    const enabled = new Set(workspaceOn);
    if (isPublicWidgetEnabled(settings)) enabled.delete("chatWidget");
    else enabled.add("chatWidget");
    onChangeSettings({
      ...settings,
      enabledWorkspace: WORKSPACE_COMPONENT_IDS.filter((item) =>
        enabled.has(item),
      ),
    });
  }

  function surfaceOn(id: PublicSurfaceId) {
    return id === "page"
      ? isPublicPageEnabled(settings)
      : isPublicWidgetEnabled(settings);
  }

  return (
    <div className="dashboard-panel-body components-dashboard">
      <header className="components-dashboard-head">
        <h1 className="dashboard-panel-title">
          Workspace setup
        </h1>
        <p className="floor-settings-help">
          Turn on the tools you use and choose where customers can find you.
        </p>
      </header>

      <section className="components-toggle-group">
        <h2>Tools</h2>
        <div className="components-toggle-list">
          {WORKSPACE_TOOL_IDS.map((id) => {
            const info = workspaceComponentInfo(id)!;
            const settingsLink =
              id === "liveChat"
                ? toolSettings.find((item) => item.nav === "tools:live-chat")
                : id === "forms"
                  ? toolSettings.find((item) => item.nav === "tools:forms")
                  : id === "schedule"
                    ? toolSettings.find((item) => item.nav === "tools:schedule")
                    : toolSettings.find((item) => item.nav === `tools:${id}`);
            return (
              <div key={id} className="components-tool-block">
                <ToggleRow
                  label={info.label}
                  blurb={info.blurb}
                  on={workspaceOn.has(id)}
                  onToggle={() => toggleTool(id)}
                />
                {workspaceOn.has(id) && settingsLink ? (
                  <Link
                    href={dashHref(slug, settingsLink.nav)}
                    scroll={false}
                    className="components-tool-settings"
                  >
                    {settingsLink.label} settings
                  </Link>
                ) : null}
              </div>
            );
          })}
        </div>
      </section>
      <section className="components-toggle-group">
        <h2>Platforms</h2>
        <div className="components-toggle-list">
          {PUBLIC_SURFACE_CATALOG.map((item) => {
            const settingsNav =
              item.id === "page" ? "client:page" : "client:chat";
            const on = surfaceOn(item.id);
            return (
              <div key={item.id} className="components-tool-block">
                <ToggleRow
                  label={item.label}
                  blurb={item.blurb}
                  on={on}
                  onToggle={() => toggleSurface(item.id)}
                />
                {on ? (
                  <Link
                    href={dashHref(slug, settingsNav)}
                    scroll={false}
                    className="components-tool-settings"
                  >
                    {item.label} settings
                  </Link>
                ) : null}
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
}
