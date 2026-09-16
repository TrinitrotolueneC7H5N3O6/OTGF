"use client";

import { useEffect, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { loadFunnelDraft, saveFunnelDraft } from "@/lib/funnel/store";
import type { ContactFieldToggles } from "@/lib/funnel/types";

const FIELD_META: { key: keyof ContactFieldToggles; label: string; hint: string }[] = [
  { key: "name", label: "Name", hint: "Almost always worth asking." },
  { key: "phone", label: "Phone number", hint: "The fastest way to follow up." },
  { key: "email", label: "Email", hint: "Good for a written follow-up." },
  { key: "zip", label: "Zip code", hint: "Useful if you serve a limited area." },
];

export default function ContactStepPage() {
  const router = useRouter();
  const [fields, setFields] = useState<ContactFieldToggles>({
    name: true,
    phone: true,
    email: false,
    zip: false,
  });

  useEffect(() => {
    const draft = loadFunnelDraft();
    setFields(draft.contactFields);
  }, []);

  function toggle(key: keyof ContactFieldToggles) {
    setFields((prev) => ({ ...prev, [key]: !prev[key] }));
  }

  const anySelected = Object.values(fields).some(Boolean);

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    saveFunnelDraft((draft) => ({ ...draft, contactFields: fields }));
    router.push("/build/thanks");
  }

  return (
    <form className="funnel-step" onSubmit={onSubmit}>
      <h1 className="funnel-title">What do you need to reach them?</h1>
      <p className="funnel-copy">
        Ask for as little as possible — every extra field costs you leads.
      </p>

      <div className="funnel-toggle-list">
        {FIELD_META.map((f) => (
          <label key={f.key} className="funnel-toggle-row">
            <span className="funnel-toggle-text">
              <span className="funnel-toggle-label">{f.label}</span>
              <span className="funnel-toggle-hint">{f.hint}</span>
            </span>
            <span
              className={`funnel-switch${fields[f.key] ? " is-on" : ""}`}
              role="switch"
              aria-checked={fields[f.key]}
              tabIndex={0}
              onClick={() => toggle(f.key)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  toggle(f.key);
                }
              }}
            >
              <span className="funnel-switch-knob" />
            </span>
          </label>
        ))}
      </div>

      {!anySelected ? (
        <p className="funnel-hint funnel-hint-warn">
          Turn on at least one way to reach a lead back.
        </p>
      ) : null}

      <div className="funnel-actions">
        <button type="submit" className="funnel-continue" disabled={!anySelected}>
          Continue
        </button>
      </div>
    </form>
  );
}
