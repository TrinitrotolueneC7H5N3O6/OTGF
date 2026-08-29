"use client";

import type { FloorSettings, StaffOutIntake } from "@/lib/types";

interface StaffOutIntakePanelProps {
  settings: FloorSettings;
  onChangeSettings: (settings: FloorSettings) => void;
}

const FIELD_TOGGLES: {
  key: keyof Pick<
    StaffOutIntake,
    "askUrgency" | "askReason" | "askPreferredContact" | "askDetails" | "askConsent"
  >;
  label: string;
  help: string;
}[] = [
  {
    key: "askReason",
    label: "Reason",
    help: "Captures why they reached out.",
  },
  {
    key: "askUrgency",
    label: "Urgency",
    help: "Helps staff triage first.",
  },
  {
    key: "askPreferredContact",
    label: "Preferred contact",
    help: "Email, phone, or either.",
  },
  {
    key: "askDetails",
    label: "Details",
    help: "Gets the useful context upfront.",
  },
  {
    key: "askConsent",
    label: "Text/call consent",
    help: "Confirms follow-up permission.",
  },
];

export function StaffOutIntakePanel({
  settings,
  onChangeSettings,
}: StaffOutIntakePanelProps) {
  const intake = settings.staffOutIntake;

  function patch(partial: Partial<StaffOutIntake>) {
    onChangeSettings({
      ...settings,
      staffOutIntake: {
        ...intake,
        ...partial,
      },
    });
  }

  return (
    <div className="staff-out-editor">
      <div className="opening-message-card">
        <div className="opening-message-head">
          <div>
            <strong>Guided intake</strong>
            <span>Turn after-hours visitors into follow-up-ready leads.</span>
          </div>
          <label className="prefs-toggle">
            <input
              type="checkbox"
              checked={intake.enabled}
              onChange={(event) => patch({ enabled: event.target.checked })}
            />
            <span>{intake.enabled ? "On" : "Off"}</span>
          </label>
        </div>

        <div className="staff-out-copy-grid">
          <label className="floor-settings-note">
            <span>Title</span>
            <input
              value={intake.title}
              onChange={(event) => patch({ title: event.target.value.slice(0, 90) })}
              placeholder="We’re away, but we can still help"
              maxLength={90}
            />
          </label>
          <label className="floor-settings-note">
            <span>Expected response</span>
            <input
              value={intake.responseTime}
              onChange={(event) =>
                patch({ responseTime: event.target.value.slice(0, 160) })
              }
              placeholder="We usually reply by the next business day."
              maxLength={160}
            />
          </label>
        </div>

        <label className="floor-settings-note">
          <span>Reassurance message</span>
          <textarea
            rows={3}
            value={intake.reassurance}
            onChange={(event) =>
              patch({ reassurance: event.target.value.slice(0, 400) })
            }
            placeholder="Tell customers what happens after they submit details…"
            maxLength={400}
          />
        </label>

        <label className="floor-settings-note">
          <span>Urgent situation note</span>
          <input
            value={intake.emergencyNote}
            onChange={(event) =>
              patch({ emergencyNote: event.target.value.slice(0, 200) })
            }
            placeholder="If this is urgent, call the business directly."
            maxLength={200}
          />
        </label>
      </div>

      <div className="opening-message-card">
        <div className="opening-message-head">
          <div>
            <strong>Questions to ask</strong>
            <span>Name plus email or phone are always collected.</span>
          </div>
        </div>
        <div className="staff-out-toggle-grid">
          {FIELD_TOGGLES.map((field) => (
            <label key={field.key} className="staff-out-toggle-card">
              <input
                type="checkbox"
                checked={Boolean(intake[field.key])}
                onChange={(event) => patch({ [field.key]: event.target.checked })}
              />
              <span>
                <strong>{field.label}</strong>
                <small>{field.help}</small>
              </span>
            </label>
          ))}
        </div>
      </div>

      <div className="opening-message-card">
        <div className="opening-message-head">
          <div>
            <strong>Next step</strong>
            <span>Optional action after they leave details.</span>
          </div>
        </div>
        <div className="staff-out-copy-grid">
          <label className="floor-settings-note">
            <span>Button label</span>
            <input
              value={intake.nextStepLabel}
              onChange={(event) =>
                patch({ nextStepLabel: event.target.value.slice(0, 60) })
              }
              placeholder="Book a time"
              maxLength={60}
            />
          </label>
          <label className="floor-settings-note">
            <span>Button link</span>
            <input
              value={intake.nextStepUrl}
              onChange={(event) =>
                patch({ nextStepUrl: event.target.value.slice(0, 500) })
              }
              placeholder="https://booking-link.com"
              maxLength={500}
            />
          </label>
        </div>
      </div>
    </div>
  );
}
