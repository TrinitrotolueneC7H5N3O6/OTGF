"use client";

import { SettingsEditorHeader } from "./SettingsEditorHeader";
import { ToolPreview } from "./ToolPreview";
import { useState } from "react";
import type { FloorSettings, PreChatLink } from "@/lib/types";
import { defaultPreChat } from "@/lib/spaceNormalize";
import { defaultQuickBuildConfig, quickBuildConfigForLink, quickBuildTypeFromLink } from "@/lib/quickBuilds";
import { WEEKDAYS, type SchedulerConfig } from "@/lib/scheduling";

export function ScheduleSettingsPanel({ slug, settings, onChangeSettings }: {
  slug: string; settings: FloorSettings; onChangeSettings: (settings: FloorSettings) => void;
}) {
  const page = settings.preChat ?? defaultPreChat();
  const events = page.links.filter((link) => quickBuildTypeFromLink(link) === "scheduler");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [copyStatus, setCopyStatus] = useState("");
  const selected = events.find((event) => event.id === selectedId) ?? events[0];
  const raw = selected ? quickBuildConfigForLink(selected) : null;
  const config = raw?.type === "scheduler" ? raw : null;
  const origin = typeof window === "undefined" ? "" : window.location.origin;
  const url = selected ? `${origin}/${slug}/book/${encodeURIComponent(selected.id)}` : "";
  const embed = selected ? `<iframe src="${origin}/${slug}/embed?action=${encodeURIComponent(selected.id)}" title="Schedule an appointment" style="width:100%;height:760px;border:0;" loading="lazy"></iframe>` : "";

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
  }
  async function copy(value: string, label: string) {
    try { await navigator.clipboard.writeText(value); setCopyStatus(`${label} copied.`); }
    catch { setCopyStatus("Copy was blocked. Select and copy the text above."); }
  }

  return <div className="forms-manager-shell">
  <div className="dashboard-panel-body forms-manager">
    <SettingsEditorHeader title="Schedule" description="Create event types, set your availability, and share a booking page." actions={<button type="button" className="btn-solid" onClick={create} disabled={page.links.length >= 16}>New event type</button>} />
    {!events.length ? <p className="dashboard-empty">Create your first event type to get a booking link and an embed for your website.</p> : <div className="forms-manager-layout">
      <ul className="forms-manager-list" aria-label="Event types">{events.map((event) => { const eventConfig = quickBuildConfigForLink(event) as SchedulerConfig; return <li key={event.id}><button className={selected?.id === event.id ? "is-active" : undefined} onClick={() => { setSelectedId(event.id); setCopyStatus(""); }}><strong>{eventConfig.title}</strong><span>{eventConfig.durationMinutes} min · Appointment request</span></button></li>; })}</ul>
      {config && selected ? <section className="forms-manager-editor" aria-label="Edit event type">
        <section className="settings-editor-card">
        <h3>Event details</h3>
        <label className="floor-settings-note"><span>Event name</span><input maxLength={100} value={config.title} onChange={(e) => patch({ title: e.target.value })} /></label>
        <label className="floor-settings-note"><span>Description</span><textarea maxLength={240} rows={2} value={config.description} onChange={(e) => patch({ description: e.target.value })} /></label>
        <div className="quick-build-customer-grid">
          <label className="floor-settings-note"><span>Duration</span><select value={config.durationMinutes} onChange={(e) => patch({ durationMinutes: Number(e.target.value) })}>{[15, 30, 45, 60, 90].map((n) => <option key={n} value={n}>{n} minutes</option>)}</select></label>
          <label className="floor-settings-note"><span>Meeting location</span><input maxLength={240} placeholder="Phone call, address, or meeting link" value={config.location ?? ""} onChange={(e) => patch({ location: e.target.value })} /></label>
        </div>
        </section>
        <section className="settings-editor-card">
        <h3>Availability</h3>
        <label className="floor-settings-note"><span>Time zone</span><select value={config.timeZone ?? "UTC"} onChange={(e) => patch({ timeZone: e.target.value })}>{[...new Set([config.timeZone ?? "UTC", "UTC", ...Intl.supportedValuesOf("timeZone")])].map((zone) => <option key={zone}>{zone}</option>)}</select></label>
        <fieldset className="schedule-weekdays"><legend>Available days</legend>{WEEKDAYS.map((day, i) => <label key={day}><input type="checkbox" checked={(config.weekdays ?? [0,1,2,3,4,5,6]).includes(i)} onChange={(e) => patch({ weekdays: e.target.checked ? [...(config.weekdays ?? [0,1,2,3,4,5,6]), i] : (config.weekdays ?? [0,1,2,3,4,5,6]).filter((d) => d !== i) })} />{day.slice(0, 3)}</label>)}</fieldset>
        <div className="quick-build-customer-grid">
          <label className="floor-settings-note"><span>Start time</span><input type="time" value={config.startTime} onChange={(e) => patch({ startTime: e.target.value })} /></label>
          <label className="floor-settings-note"><span>End time</span><input type="time" value={config.endTime} onChange={(e) => patch({ endTime: e.target.value })} /></label>
          <label className="floor-settings-note"><span>Booking window</span><select value={config.daysAhead} onChange={(e) => patch({ daysAhead: Number(e.target.value) })}>{[...new Set([7,14,30,60,90,180, config.daysAhead])].sort((a,b)=>a-b).map((n) => <option key={n} value={n}>{n} days ahead</option>)}</select></label>
          <label className="floor-settings-note"><span>Minimum notice</span><select value={config.minimumNoticeHours ?? 0} onChange={(e) => patch({ minimumNoticeHours: Number(e.target.value) })}>{[...new Set([0,1,2,4,12,24,48,72,168,config.minimumNoticeHours ?? 0])].sort((a,b)=>a-b).map((n) => <option key={n} value={n}>{n === 0 ? "No minimum" : `${n} hours`}</option>)}</select></label>
        </div>
        {config.startTime >= config.endTime ? <p className="editor-error">End time must be later than start time. No times will be offered until you fix this.</p> : null}
        {config.weekdays?.length === 0 ? <p className="floor-settings-help">No available days selected. This event cannot receive requests.</p> : null}
        <label className="schedule-phone-option"><input type="checkbox" checked={config.requirePhone ?? false} onChange={(e) => patch({ requirePhone: e.target.checked })} /> Require a phone number</label>
        <p className="floor-settings-help">Requests appear in Schedule for your team to confirm. Availability uses the hours above; external calendars are not connected.</p>
        </section>
        <section className="forms-share settings-editor-card"><h3>Share this event</h3>
          {([['sharePage', 'Separate booking page'], ['shareEmbed', 'Embed on a website']] as const).map(([key, label]) => <div key={key}>
            <button type="button" className="components-toggle-row" role="switch" aria-label={label} aria-checked={config[key] !== false} onClick={() => patch({ [key]: config[key] === false })}><span className="components-toggle-copy"><strong>{label}</strong><em>{key === 'sharePage' ? 'A public page just for this event.' : 'Paste this code into your website.'}</em></span><span aria-hidden className={`components-switch${config[key] !== false ? ' is-on' : ''}`} /></button>
            {config[key] !== false ? <div className="forms-share-copy"><pre><code>{key === 'sharePage' ? url : embed}</code></pre><div className="forms-share-actions">{key === 'sharePage' ? <a className="btn-ghost" href={url} target="_blank" rel="noreferrer">Open page</a> : null}<button className="btn-solid" onClick={() => void copy(key === 'sharePage' ? url : embed, key === 'sharePage' ? 'Link' : 'Embed')}>{key === 'sharePage' ? 'Copy link' : 'Copy embed'}</button></div></div> : null}
          </div>)}
          <p role="status">{copyStatus}</p>
        </section>
      </section> : null}
    </div>}
  </div>
  {selected ? <ToolPreview slug={slug} link={selected} /> : null}
  </div>;
}
