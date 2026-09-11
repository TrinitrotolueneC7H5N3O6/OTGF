"use client";

import type { ReactNode } from "react";
import { createPortal } from "react-dom";
import { useSettingsChrome } from "./SettingsArea";

export function SettingsEditorHeader({ title, description, actions }: {
  title: string;
  description?: string;
  actions?: ReactNode;
}) {
  const { crumb, slot } = useSettingsChrome();
  if (crumb) return slot && actions ? createPortal(actions, slot) : null;
  return (
    <header className="settings-editor-head">
      <div>
        <h2 className="dashboard-panel-title">{title}</h2>
        {description ? <p className="floor-settings-help">{description}</p> : null}
      </div>
      {actions}
    </header>
  );
}
