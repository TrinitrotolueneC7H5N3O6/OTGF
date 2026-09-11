"use client";

import { ScheduleRulesEditor } from "./ScheduleRulesEditor";
import { ToolPreview } from "./ToolPreview";
import { useState } from "react";
import type { FloorSettings, PreChatLink } from "@/lib/types";
import { defaultPreChat } from "@/lib/spaceNormalize";
import { defaultQuickBuildConfig, quickBuildConfigForLink, quickBuildTypeFromLink } from "@/lib/quickBuilds";
import { type SchedulerConfig } from "@/lib/scheduling";
import { IconTrash } from "@/components/shared/Icons";

const SECTIONS = [
  { id: "details", label: "Event" },
  { id: "availability", label: "Hours" },
  { id: "choices", label: "Choices" },
  { id: "share", label: "Share" },
] as const;

type SchedulePane = (typeof SECTIONS)[number]["id"];
const DURATIONS = [15, 30, 45, 60, 90];

export function ScheduleSettingsPanel({ slug, settings, onChangeSettings }: {
  slug: string; settings: FloorSettings; onChangeSettings: (settings: FloorSettings) => void;
}) {
  const page = settings.preChat ?? defaultPreChat();
  const events = page.links.filter((link) => quickBuildTypeFromLink(link) === "scheduler");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [pane, setPane] = useState<SchedulePane>("details");
  const [copyStatus, setCopyStatus] = useState("");
  const selected = events.find((event) => event.id === selectedId) ?? events[0];
  const raw = selected ? quickBuildConfigForLink(selected) : null;
  const config = raw?.type === "scheduler" ? raw : null;
  const origin = typeof window === "undefined" ? "" : window.location.origin;
  const url = selected ? `${origin}/${slug}/book/${encodeURIComponent(selected.id)}` : "";
  const embed = selected ? `<iframe src="${origin}/${slug}/embed?action=${encodeURIComponent(selected.id)}" title="Schedule an appointment" style="width:100%;height:760px;border:0;" loading="lazy"></iframe>` : "";
  const canCreate = page.links.length < 16;
  const choiceMode = config?.choiceDisplay ?? "dropdown";
  const choiceOptions = config?.choiceOptions ?? [];

  function persist(links: PreChatLink[]) { onChangeSettings({ ...settings, preChat: { ...page, links } }); }
  function patch(next: Partial<SchedulerConfig>) {
    if (!selected || !config) return;
    persist(page.links.map((link) => link.id === selected.id ? { ...link, label: next.title ?? link.label, quickBuild: { ...config, ...next } } : link));
  }
  function create() {
    const base = defaultQuickBuildConfig("scheduler") as SchedulerConfig;
    const id = `pre-quick-scheduler-${crypto.randomUUID()}`;
    persist([...page.links, { id, kind: "url", label: "30 minute meeting", enabled: false, showInWidget: false, quickBuild: { ...base, title: "30 minute meeting", weekdays: [1, 2, 3, 4, 5], minimumNoticeHours: 4, timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone, sharePage: true, shareEmbed: true } }]);
    setSelectedId(id);
    setPane("details");
  }
  function selectEvent(id: string) {
    setSelectedId(id);
    setCopyStatus("");
  }
  function remove() {
    if (!selected) return;
    const name = config?.title || "this event type";
    if (!window.confirm(`Delete ${name}? Booking links for it will stop working.`)) return;
    const next = page.links.filter((link) => link.id !== selected.id);
    persist(next);
    const remaining = next.filter((link) => quickBuildTypeFromLink(link) === "scheduler");
    setSelectedId(remaining[0]?.id ?? null);
    setCopyStatus("");
    setPane("details");
  }
  async function copy(value: string, label: string) {
    try { await navigator.clipboard.writeText(value); setCopyStatus(`${label} copied.`); }
    catch { setCopyStatus("Copy was blocked. Select and copy the text above."); }
  }

  return <div className="forms-manager-shell schedule-settings">
  <div className="dashboard-panel-body forms-manager">
    <div className="schedule-settings-body">
      <aside className="schedule-settings-rail" aria-label="Event types">
        <div className="schedule-settings-rail-head">
          <div>
            <strong>Event types</strong>
            <span>{events.length ? `${events.length} ${events.length === 1 ? "type" : "types"}` : "None yet"}</span>
          </div>
          <button type="button" className="btn-solid" onClick={create} disabled={!canCreate}>New</button>
        </div>
        {events.length ? (
          <ul className="schedule-settings-events">
            {events.map((event) => {
              const eventConfig = quickBuildConfigForLink(event) as SchedulerConfig;
              const active = selected?.id === event.id;
              return (
                <li key={event.id}>
                  <button type="button" className={active ? "is-active" : undefined} aria-current={active ? "true" : undefined} onClick={() => selectEvent(event.id)}>
                    <strong>{eventConfig.title || "Untitled event"}</strong>
                    <span className="schedule-settings-event-meta">
                      <em>{eventConfig.durationMinutes} min</em>
                      <em>{eventConfig.confirmationMode === "instant" ? "Instant" : "Approval"}</em>
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="schedule-settings-rail-empty">Create an event type to start taking bookings.</p>
        )}
      </aside>
      {config && selected ? (
        <section className="schedule-settings-editor" aria-label="Edit event type">
          <div className="schedule-settings-editor-bar">
            <nav className="schedule-settings-toc" aria-label="Event settings">
              {SECTIONS.map((section) => (
                <button
                  type="button"
                  key={section.id}
                  className={pane === section.id ? "is-active" : undefined}
                  aria-current={pane === section.id ? "page" : undefined}
                  onClick={() => setPane(section.id)}
                >
                  {section.label}
                </button>
              ))}
            </nav>
            <button type="button" className="btn-ghost schedule-settings-delete" onClick={remove}>
              Delete event
            </button>
          </div>
          <div className="schedule-settings-editor-scroll">
            {pane === "details" ? (
              <section className="settings-editor-card" id="schedule-section-details">
                <div className="schedule-card-head">
                  <h3>Event details</h3>
                </div>
                <label className="floor-settings-note"><span>Event name</span><input maxLength={100} value={config.title} onChange={(e) => patch({ title: e.target.value })} /></label>
                <label className="floor-settings-note"><span>Description</span><textarea maxLength={240} rows={2} value={config.description} onChange={(e) => patch({ description: e.target.value })} /></label>
                <div className="schedule-event-options">
                  <div className="floor-settings-note">
                    <span>Duration</span>
                    <div className="schedule-segment" role="group" aria-label="Duration">
                      {DURATIONS.map((n) => (
                        <button
                          key={n}
                          type="button"
                          className={config.durationMinutes === n ? "is-active" : undefined}
                          aria-pressed={config.durationMinutes === n}
                          onClick={() => patch({ durationMinutes: n })}
                        >
                          {n}m
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="floor-settings-note">
                    <span>Booking type</span>
                    <div className="schedule-choice-cards" role="group" aria-label="Booking type">
                      {([
                        ["instant", "Instant", "Confirmed as soon as they book."],
                        ["approval", "Approval", "You review it before it is confirmed."],
                      ] as const).map(([value, label, hint]) => {
                        const active = (config.confirmationMode ?? "approval") === value;
                        return (
                          <button
                            key={value}
                            type="button"
                            className={active ? "is-active" : undefined}
                            aria-pressed={active}
                            onClick={() => patch({ confirmationMode: value })}
                          >
                            <strong>{label}</strong>
                            <em>{hint}</em>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </div>
                <label className="floor-settings-note"><span>Meeting location</span><input maxLength={240} placeholder="Phone call, address, or meeting link" value={config.location ?? ""} onChange={(e) => patch({ location: e.target.value })} /></label>
              </section>
            ) : null}
            {pane === "availability" ? (
              <div className="schedule-hours-pane" id="schedule-section-availability">
                <section className="settings-editor-card">
                  <div className="schedule-card-head">
                    <h3>When they can book</h3>
                  </div>
                  <div className="schedule-limits">
                    <label className="floor-settings-note schedule-limits-wide"><span>Time zone</span><select value={config.timeZone ?? "UTC"} onChange={(e) => patch({ timeZone: e.target.value })}>{[...new Set([config.timeZone ?? "UTC", "UTC", ...Intl.supportedValuesOf("timeZone")])].map((zone) => <option key={zone}>{zone}</option>)}</select></label>
                    <label className="floor-settings-note"><span>Booking window</span><select value={config.daysAhead} onChange={(e) => patch({ daysAhead: Number(e.target.value) })}>{[...new Set([7,14,30,60,90,180, config.daysAhead])].sort((a,b)=>a-b).map((n) => <option key={n} value={n}>{n} days ahead</option>)}</select></label>
                    <label className="floor-settings-note"><span>Minimum notice</span><select value={config.minimumNoticeHours ?? 0} onChange={(e) => patch({ minimumNoticeHours: Number(e.target.value) })}>{[...new Set([0,1,2,4,12,24,48,72,168,config.minimumNoticeHours ?? 0])].sort((a,b)=>a-b).map((n) => <option key={n} value={n}>{n === 0 ? "No minimum" : `${n} hours`}</option>)}</select></label>
                  </div>
                </section>
                <ScheduleRulesEditor config={config} patch={patch} />
                <section className="settings-editor-card">
                  <button type="button" className="components-toggle-row" role="switch" aria-label="Require a phone number" aria-checked={config.requirePhone ?? false} onClick={() => patch({ requirePhone: !(config.requirePhone ?? false) })}>
                    <span className="components-toggle-copy"><strong>Require a phone number</strong></span>
                    <span aria-hidden className={`components-switch${config.requirePhone ? " is-on" : ""}`} />
                  </button>
                </section>
              </div>
            ) : null}
            {pane === "choices" ? (
              <section className="settings-editor-card" id="schedule-section-choices">
                <div className="schedule-card-head">
                  <h3>Customer choices</h3>
                </div>
                <div className="schedule-choice-setup">
                  <label className="floor-settings-note"><span>Question</span><input maxLength={80} placeholder="What is this for?" value={config.choicePrompt ?? ""} onChange={(e) => patch({ choicePrompt: e.target.value })} /></label>
                  <div className="floor-settings-note">
                    <span>Display</span>
                    <div className="schedule-segment" role="group" aria-label="Display style">
                      {(["dropdown", "list"] as const).map((mode) => (
                        <button key={mode} type="button" className={choiceMode === mode ? "is-active" : undefined} onClick={() => patch({ choiceDisplay: mode })}>
                          {mode === "dropdown" ? "Dropdown" : "List"}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
                <div className="contact-reason-options">
                  <div className="contact-reason-options-head">
                    <strong>Choices</strong>
                    <span>{choiceOptions.length ? "Customers pick one." : "Leave empty to skip this question."}</span>
                  </div>
                  <div className="contact-reason-options-grid">
                    {choiceOptions.map((option, index) => (
                      <label key={index} className="contact-reason-option">
                        <span>{index + 1}</span>
                        <input
                          type="text"
                          maxLength={80}
                          value={option}
                          onChange={(e) => {
                            const next = [...choiceOptions];
                            next[index] = e.target.value.slice(0, 80);
                            patch({ choiceOptions: next });
                          }}
                          placeholder={`Option ${index + 1}`}
                        />
                        <button type="button" className="floor-banner-remove icon-btn" onClick={() => patch({ choiceOptions: choiceOptions.filter((_, i) => i !== index) })} aria-label={`Remove choice ${index + 1}`} title="Remove">
                          <IconTrash size={13} />
                        </button>
                      </label>
                    ))}
                  </div>
                  <button type="button" className="btn-ghost opening-message-add" disabled={choiceOptions.length >= 20} onClick={() => patch({ choiceOptions: [...choiceOptions, `Option ${choiceOptions.length + 1}`] })}>
                    Add choice
                  </button>
                </div>
              </section>
            ) : null}
            {pane === "share" ? (
              <section className="forms-share schedule-share" id="schedule-section-share">
                {([["sharePage", "Separate booking page"], ["shareEmbed", "Embed on a website"]] as const).map(([key, label]) => (
                  <div key={key} className="settings-editor-card">
                    <button type="button" className="components-toggle-row" role="switch" aria-label={label} aria-checked={config[key] !== false} onClick={() => patch({ [key]: config[key] === false })}>
                      <span className="components-toggle-copy"><strong>{label}</strong><em>{key === "sharePage" ? "A public page just for this event." : "Paste this code into your website."}</em></span>
                      <span aria-hidden className={`components-switch${config[key] !== false ? " is-on" : ""}`} />
                    </button>
                    {config[key] !== false ? (
                      <div className="forms-share-copy">
                        <pre><code>{key === "sharePage" ? url : embed}</code></pre>
                        <div className="forms-share-actions">
                          {key === "sharePage" ? <a className="btn-ghost" href={url} target="_blank" rel="noreferrer">Open page</a> : null}
                          <button className="btn-solid" onClick={() => void copy(key === "sharePage" ? url : embed, key === "sharePage" ? "Link" : "Embed")}>{key === "sharePage" ? "Copy link" : "Copy embed"}</button>
                        </div>
                      </div>
                    ) : null}
                  </div>
                ))}
                <p role="status">{copyStatus}</p>
              </section>
            ) : null}
          </div>
        </section>
      ) : (
        <p className="schedule-settings-editor-empty">Create your first event type to get a booking link and an embed for your website.</p>
      )}
    </div>
  </div>
  {selected ? <ToolPreview slug={slug} link={selected} /> : null}
  </div>;
}
