"use client";

import type { FloorSettings } from "@/lib/types";
import {
  INDUSTRY_CATALOG,
  SOLUTION_CATALOG,
  industryInfo,
  resolveEnabledSolutions,
  resolveSetupIndustry,
  solutionsForIndustry,
  type SetupIndustry,
  type SolutionId,
} from "@/lib/setupSolutions";

interface SetupPanelProps {
  settings: FloorSettings;
  onChangeSettings: (settings: FloorSettings) => void;
}

export function SetupPanel({ settings, onChangeSettings }: SetupPanelProps) {
  const industry = resolveSetupIndustry(settings);
  const enabled = new Set(resolveEnabledSolutions(settings));
  const selected = industryInfo(industry);

  function chooseIndustry(id: SetupIndustry) {
    onChangeSettings({
      ...settings,
      setupIndustry: id,
      enabledSolutions:
        id === "custom"
          ? resolveEnabledSolutions(settings)
          : solutionsForIndustry(id),
    });
  }

  function toggleSolution(id: SolutionId) {
    const next = SOLUTION_CATALOG.map((item) => item.id).filter((item) =>
      item === id ? !enabled.has(item) : enabled.has(item),
    );
    onChangeSettings({
      ...settings,
      setupIndustry: "custom",
      enabledSolutions: next,
    });
  }

  return (
    <section
      className="floor-settings-section setup-panel"
      role="tabpanel"
      id="settings-panel-setup"
      aria-labelledby="settings-tab-setup"
    >
      <p className="floor-settings-help">
        Pick the industry that fits this space. We’ll turn on the modules that
        usually matter there so the dashboard and floor stay simpler. Custom
        lists every module if you want to mix your own.
      </p>

      <div className="setup-industry-grid">
        {INDUSTRY_CATALOG.map((item) => {
          const active = industry === item.id;
          return (
            <button
              key={item.id}
              type="button"
              className={`setup-industry-card${active ? " is-active" : ""}`}
              aria-pressed={active}
              onClick={() => chooseIndustry(item.id)}
            >
              <strong>{item.label}</strong>
              <span>{item.blurb}</span>
            </button>
          );
        })}
      </div>

      {industry === "custom" ? (
        <div className="setup-solution-list">
          <h3 className="prefs-subhead">All solutions</h3>
          <p className="floor-settings-help">
            Check the tools you actually use. Unchecked items hide from the
            dashboard, floor, and customer chat.
          </p>
          <ul className="setup-solution-checks">
            {SOLUTION_CATALOG.map((item) => {
              const on = enabled.has(item.id);
              return (
                <li key={item.id}>
                  <label className={`setup-solution-row${on ? " is-on" : ""}`}>
                    <input
                      type="checkbox"
                      checked={on}
                      onChange={() => toggleSolution(item.id)}
                    />
                    <span>
                      <strong>{item.label}</strong>
                      <em>{item.blurb}</em>
                    </span>
                  </label>
                </li>
              );
            })}
          </ul>
        </div>
      ) : (
        <div className="setup-solution-list">
          <h3 className="prefs-subhead">Included for {selected.label}</h3>
          <p className="floor-settings-help">
            These are on. Switch to Custom at the end of the list if you want
            to add or remove any.
          </p>
          <ul className="setup-solution-pills">
            {selected.solutions.map((id) => {
              const item = SOLUTION_CATALOG.find((row) => row.id === id);
              if (!item) return null;
              return (
                <li key={id}>
                  <strong>{item.label}</strong>
                  <span>{item.blurb}</span>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </section>
  );
}
