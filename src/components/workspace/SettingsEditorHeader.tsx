import type { ReactNode } from "react";

export function SettingsEditorHeader({ title, description, actions }: {
  title: string;
  description: string;
  actions?: ReactNode;
}) {
  return (
    <header className="settings-editor-head">
      <div>
        <h2 className="dashboard-panel-title">{title}</h2>
        <p className="floor-settings-help">{description}</p>
      </div>
      {actions}
    </header>
  );
}
