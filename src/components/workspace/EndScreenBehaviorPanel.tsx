"use client";

import type {
  ChatEndScreenBehavior,
  ChatEndScreenKind,
  FloorSettings,
} from "@/lib/types";

interface EndScreenBehaviorPanelProps {
  settings: FloorSettings;
  onChangeSettings: (settings: FloorSettings) => void;
}

const END_SCREEN_OPTIONS: {
  kind: ChatEndScreenKind;
  title: string;
  description: string;
}[] = [
  {
    kind: "record_contact",
    title: "Collect contact",
    description: "Ask for name, email, or phone for follow-up/newsletter.",
  },
  {
    kind: "offer",
    title: "Show offer",
    description: "Display a thank-you code or promotion after the chat.",
  },
  {
    kind: "book_follow_up",
    title: "Book follow-up",
    description: "Send customers to a consult, appointment, or intake page.",
  },
  {
    kind: "review",
    title: "Ask for review",
    description: "Invite happy customers to leave feedback or a review.",
  },
  {
    kind: "none",
    title: "Simple ended state",
    description: "Only show that the chat has ended.",
  },
];

function behaviorWithDefaults(
  behavior: ChatEndScreenBehavior,
  kind: ChatEndScreenKind,
): ChatEndScreenBehavior {
  if (kind === behavior.kind) return behavior;
  const presets: Record<ChatEndScreenKind, Partial<ChatEndScreenBehavior>> = {
    record_contact: {
      title: "Before you go",
      body:
        "Want a copy of this conversation or future updates? Leave your name, email, or phone number.",
      collectLabel: "Contact info",
      collectPlaceholder: "Name, email, or phone",
      collectName: true,
      collectEmail: true,
      collectPhone: true,
      submitLabel: "Send",
    },
    offer: {
      title: "A thank-you offer",
      body: "Use this code next time, or tap below to claim the offer.",
      offerCode: behavior.offerCode || "THANKYOU10",
      ctaLabel: "Claim offer",
    },
    book_follow_up: {
      title: "Ready for the next step?",
      body: "Book a follow-up so we can help you move forward faster.",
      ctaLabel: "Book follow-up",
    },
    review: {
      title: "How did we do?",
      body: "If this helped, we would love a quick review or testimonial.",
      ctaLabel: "Leave a review",
    },
    none: {
      title: "Chat ended",
      body: "Thanks for chatting with us.",
    },
  };
  return { ...behavior, ...presets[kind], kind };
}

export function EndScreenBehaviorPanel({
  settings,
  onChangeSettings,
}: EndScreenBehaviorPanelProps) {
  const behavior = settings.endScreenBehavior;

  function patch(partial: Partial<ChatEndScreenBehavior>) {
    onChangeSettings({
      ...settings,
      endScreenBehavior: { ...behavior, ...partial },
    });
  }

  function patchContactField(
    field: "collectEmail" | "collectPhone",
    enabled: boolean,
  ) {
    const next = { ...behavior, [field]: enabled };
    if (!next.collectEmail && !next.collectPhone) {
      next[field === "collectEmail" ? "collectPhone" : "collectEmail"] = true;
    }
    patch(next);
  }

  function chooseKind(kind: ChatEndScreenKind) {
    onChangeSettings({
      ...settings,
      endScreenBehavior: behaviorWithDefaults(behavior, kind),
    });
  }

  return (
    <div className="end-screen-editor">
      <div className="end-screen-options" role="radiogroup">
        {END_SCREEN_OPTIONS.map((option) => (
          <button
            key={option.kind}
            type="button"
            className={
              behavior.kind === option.kind
                ? "end-screen-option is-active"
                : "end-screen-option"
            }
            aria-pressed={behavior.kind === option.kind}
            onClick={() => chooseKind(option.kind)}
          >
            <strong>{option.title}</strong>
            <span>{option.description}</span>
          </button>
        ))}
      </div>

      {behavior.kind === "none" ? (
        <p className="floor-settings-help">
          Customers will only see a small “Chat ended” state after the
          employee ends the chat.
        </p>
      ) : (
        <div className="end-screen-fields">
          <label className="floor-settings-note">
            <span>Headline</span>
            <input
              value={behavior.title}
              onChange={(event) => patch({ title: event.target.value.slice(0, 80) })}
              placeholder="Before you go"
            />
          </label>
          <label className="floor-settings-note">
            <span>Message</span>
            <textarea
              rows={3}
              value={behavior.body}
              onChange={(event) => patch({ body: event.target.value.slice(0, 500) })}
              placeholder="Add the message clients see after chat ends..."
            />
          </label>

          {behavior.kind === "record_contact" ? (
            <div className="end-screen-two-col">
              <label className="floor-settings-note">
                <span>Input label</span>
                <input
                  value={behavior.collectLabel}
                  onChange={(event) =>
                    patch({ collectLabel: event.target.value.slice(0, 50) })
                  }
                  placeholder="Contact info"
                />
              </label>
              <label className="floor-settings-note">
                <span>Button label</span>
                <input
                  value={behavior.submitLabel}
                  onChange={(event) =>
                    patch({ submitLabel: event.target.value.slice(0, 40) })
                  }
                  placeholder="Send"
                />
              </label>
              <div className="floor-settings-note end-screen-wide">
                <span>Collect fields</span>
                <div className="end-screen-field-toggles">
                  <label>
                    <input type="checkbox" checked readOnly />
                    Name
                  </label>
                  <label>
                    <input
                      type="checkbox"
                      checked={behavior.collectEmail}
                      onChange={(event) =>
                        patchContactField("collectEmail", event.target.checked)
                      }
                    />
                    Email
                  </label>
                  <label>
                    <input
                      type="checkbox"
                      checked={behavior.collectPhone}
                      onChange={(event) =>
                        patchContactField("collectPhone", event.target.checked)
                      }
                    />
                    Phone
                  </label>
                </div>
                <p className="editor-hint">
                  Name is always collected. Keep email or phone on for follow-up.
                </p>
              </div>
            </div>
          ) : null}

          {behavior.kind === "offer" ? (
            <label className="floor-settings-note">
              <span>Offer code</span>
              <input
                value={behavior.offerCode}
                onChange={(event) =>
                  patch({ offerCode: event.target.value.slice(0, 40) })
                }
                placeholder="THANKYOU10"
              />
            </label>
          ) : null}

          {behavior.kind === "offer" ||
          behavior.kind === "book_follow_up" ||
          behavior.kind === "review" ? (
            <div className="end-screen-two-col">
              <label className="floor-settings-note">
                <span>CTA label</span>
                <input
                  value={behavior.ctaLabel}
                  onChange={(event) =>
                    patch({ ctaLabel: event.target.value.slice(0, 60) })
                  }
                  placeholder="Book follow-up"
                />
              </label>
              <label className="floor-settings-note">
                <span>CTA link</span>
                <input
                  value={behavior.ctaUrl}
                  onChange={(event) =>
                    patch({ ctaUrl: event.target.value.slice(0, 500) })
                  }
                  placeholder="https://..."
                />
              </label>
            </div>
          ) : null}
        </div>
      )}
    </div>
  );
}
