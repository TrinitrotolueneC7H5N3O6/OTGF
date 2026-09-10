"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import { SettingsEditorHeader } from "./SettingsEditorHeader";
import { PreviewFrame } from "./PreviewFrame";
import { GrowthStory } from "@/components/client/GrowthPublicApp";
import { dashHref } from "@/lib/workspaceNav";
import { newGrowthData, growthMetrics, money, type GrowthKind, type GrowthData, type GrowthRecord } from "@/lib/growth";

const LABELS = {referral: "Referral Programs", affiliate: "Affiliates", story: "Storytelling"} as const;
const SETUP_DESCRIPTIONS = {
  referral: "Create programs, set rewards, and add referrers.",
  affiliate: "Create programs, set commissions, and add partners.",
  story: "Document your work as a story, from the first challenge to the final result.",
};

export function GrowthToolsPanel({
  slug,
  kind,
  mode = "setup",
}: {
  slug: string;
  kind: "referral" | "affiliate" | "story";
  mode?: "setup" | "data";
}) {
  const tracking = mode === "data" && kind !== "story";
  const [records, setRecords] = useState<GrowthRecord[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState("");
  const [selectedId, setSelectedId] = useState("");
  const [creating, setCreating] = useState(false);
  const [child, setChild] = useState<{kind: GrowthKind; record?: GrowthRecord} | null>(null);
  const [filter, setFilter] = useState("");
  const [search, setSearch] = useState("");
  const [notice, setNotice] = useState("");
  const [previewDraft, setPreviewDraft] = useState<GrowthData | null>(null);
  const load = useCallback(async () => {
    try {
      const response = await fetch(`/api/spaces/${encodeURIComponent(slug)}/growth`, {cache: "no-store"});
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Could not load records.");
      setRecords(result); setLoaded(true); setError("");
    } catch (err) { setError(err instanceof Error ? err.message : "Could not load records."); }
  }, [slug]);
  useEffect(() => { const timer = window.setTimeout(() => void load(), 0); return () => window.clearTimeout(timer); }, [load]);
  useEffect(() => {
    if (!tracking || child) return;
    const timer = window.setInterval(() => void load(), 20000);
    return () => window.clearInterval(timer);
  }, [load, tracking, child]);
  const programs = records.filter((r) => r.kind === kind);
  const selected = programs.find((r) => r.id === selectedId) ?? programs[0];
  const participants = records.filter((r) => r.kind === "partner" && r.data.programId === selected?.id);
  const conversions = records.filter((r) => r.kind === "conversion" && r.data.programId === selected?.id);
  const previewData = previewDraft ?? (creating ? null : selected?.data);
  const stats = selected ? growthMetrics(records, selected.id) : null;
  const settingsNav = kind === "affiliate" ? "tools:affiliates" : "tools:referrals";
  const dataNav = kind === "affiliate" ? "affiliates" : "referrals";

  async function save(data: GrowthData, recordKind: GrowthKind, record?: GrowthRecord) {
    const response = await fetch(`/api/spaces/${encodeURIComponent(slug)}/growth`, {method: "POST", headers: {"Content-Type": "application/json"}, body: JSON.stringify({id: record?.id, version: record?.version, kind: recordKind, data})});
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || "Could not save.");
    setRecords((all) => [result, ...all.filter((r) => r.id !== result.id)]);
    if (recordKind === kind) { setSelectedId(result.id); setCreating(false); }
    setChild(null); setPreviewDraft(null); setNotice("Saved.");
  }
  async function copyLink(path: string) {
    try { await navigator.clipboard.writeText(`${window.location.origin}${path}`); setNotice("Link copied."); }
    catch { setNotice("Copy was blocked. Open the page and copy its address."); }
  }

  const programList = programs.length ? (
    <ul className="forms-manager-list growth-record-list">
      {programs.map((r) => (
        <li key={r.id}>
          <button
            className={!creating && selected?.id === r.id ? "is-active" : undefined}
            onClick={() => {
              setSelectedId(r.id);
              setPreviewDraft(null);
              setCreating(false);
              setChild(null);
              setNotice("");
            }}
          >
            <strong>{r.data.title}</strong>
            <span>{r.data.status}{kind === "story" ? ` · ${r.visits} visits` : ""}</span>
          </button>
        </li>
      ))}
    </ul>
  ) : null;

  const noticeBlock = (
    <>
      {error ? <p className="editor-error" role="alert">{error} <button className="btn-ghost" onClick={() => void load()}>Retry</button></p> : null}
      <p className="growth-notice" role="status">{notice}</p>
      {!loaded && !error ? <p>Loading…</p> : null}
    </>
  );

  if (tracking) {
    return (
      <div className="dashboard-panel-body schedule-panel forms-panel growth-data">
        <header className="cases-page-head">
          <div>
            <p className="dashboard-kicker">{LABELS[kind]}</p>
            <h2 className="dashboard-panel-title">Activity</h2>
            <p className="floor-settings-help">
              {kind === "affiliate"
                ? "Partner visits, attributed sales, and payouts."
                : "Referrer visits, leads, and rewards."}
            </p>
          </div>
        </header>
        {noticeBlock}
        {loaded && !programs.length ? (
          <div className="dashboard-empty">
            <h3>No {kind === "affiliate" ? "affiliate" : "referral"} programs yet</h3>
            <p>Set up a program first, then leads, visits, and rewards will show up here.</p>
            <Link className="btn-solid" href={dashHref(slug, settingsNav)}>
              Set up {kind === "affiliate" ? "affiliates" : "referral programs"}
            </Link>
          </div>
        ) : null}
        {programList}
        {!creating && selected && stats ? (
          <>
            <div className="growth-metrics">
              {[["Participants", stats.partners], ["Link visits", stats.visits], ["Leads / records", stats.leads], ["Confirmed sales", stats.confirmed], ["Revenue", money(stats.revenue, selected.data.currency)], ["Rewards owed", money(stats.owed, selected.data.currency)], ["Rewards paid", money(stats.paid, selected.data.currency)]].map(([label, value]) => (
                <div key={label}><span>{label}</span><strong>{value}</strong></div>
              ))}
            </div>
            <p className="floor-settings-help">
              Visits count once per browser per day. Confirm sales and record payouts here; no money is transferred. Updates every 20 seconds.{" "}
              <Link href={dashHref(slug, settingsNav)}>Edit program setup</Link>
            </p>
            <section className="settings-editor-card">
              <div className="growth-section-head">
                <h3>{kind === "affiliate" ? "Affiliate partners" : "Referrers"}</h3>
              </div>
              {!participants.length ? (
                <p className="floor-settings-help">
                  Add participants in setup to generate tracking links.{" "}
                  <Link href={dashHref(slug, settingsNav)}>Open setup</Link>
                </p>
              ) : (
                <div className="growth-table-wrap">
                  <table className="growth-table">
                    <thead><tr><th>Name</th><th>Status</th><th>Visits</th><th>Tracking link</th></tr></thead>
                    <tbody>
                      {participants.map((r) => (
                        <tr key={r.id}>
                          <td>{r.data.title}</td>
                          <td>{r.data.status}</td>
                          <td>{r.visits}</td>
                          <td><button className="btn-ghost" onClick={() => void copyLink(`/${slug}/r/${r.id}`)}>Copy link</button></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
            <section className="settings-editor-card">
              <div className="growth-section-head">
                <h3>Leads & sales</h3>
                <button className="btn-solid" disabled={!participants.length} onClick={() => setChild({kind: "conversion"})}>Add record</button>
              </div>
              <div className="quick-build-customer-grid">
                <label className="floor-settings-note">
                  <span>Search records</span>
                  <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Name, email, or reference" />
                </label>
                <label className="floor-settings-note">
                  <span>Status</span>
                  <select value={filter} onChange={(e) => setFilter(e.target.value)}>
                    <option value="">All statuses</option>
                    {["lead", "confirmed", "paid", "rejected"].map((status) => <option key={status}>{status}</option>)}
                  </select>
                </label>
              </div>
              {!conversions.length ? (
                <p className="floor-settings-help">No leads or sales yet. Share participant links or add a manual record.</p>
              ) : (
                <div className="growth-table-wrap">
                  <table className="growth-table">
                    <thead><tr><th>Customer</th><th>Participant</th><th>Status</th><th>Sale</th><th>Reward</th></tr></thead>
                    <tbody>
                      {conversions.filter((r) => (!filter || r.data.status === filter) && `${r.data.title} ${r.data.email} ${r.data.reference}`.toLowerCase().includes(search.toLowerCase())).map((r) => (
                        <tr key={r.id}>
                          <td>
                            <button className="growth-text-button" onClick={() => setChild({kind: "conversion", record: r})}>{r.data.title}</button>
                            <small>{new Date(r.createdAt).toLocaleDateString()}</small>
                          </td>
                          <td>{participants.find((p) => p.id === r.data.partnerId)?.data.title ?? "Unknown"}</td>
                          <td>{r.data.status}</td>
                          <td>{money(r.data.amount, r.data.currency)}</td>
                          <td>{["confirmed", "paid"].includes(r.data.status) ? money(r.data.commission, r.data.currency) : "—"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              <button className="btn-ghost" onClick={() => void load()}>Refresh records</button>
            </section>
            {child?.kind === "conversion" ? (
              <GrowthEditor
                key={child.record?.id ?? "conversion"}
                kind="conversion"
                record={child.record}
                programId={selected.id}
                participants={participants}
                onSave={(data) => save(data, "conversion", child.record)}
                onCancel={() => setChild(null)}
              />
            ) : null}
          </>
        ) : null}
      </div>
    );
  }

  return (
    <div className="forms-manager-shell">
      <div className="dashboard-panel-body forms-manager">
        <SettingsEditorHeader
          title={LABELS[kind]}
          description={SETUP_DESCRIPTIONS[kind]}
          actions={
            <button
              className="btn-solid"
              disabled={!loaded}
              onClick={() => {
                setCreating(true);
                setPreviewDraft(null);
                setChild(null);
              }}
            >
              New {kind === "story" ? "story" : "program"}
            </button>
          }
        />
        {noticeBlock}
        {loaded && !programs.length && !creating ? (
          <div className="dashboard-empty">
            <h3>{kind === "story" ? "Every project has a story" : "Build your first program"}</h3>
            <p>
              {kind === "story"
                ? "Capture the challenge, the work, and the outcome. Start with a private draft."
                : "Set the reward, add participants, and share their individual links. Activity shows up in Referral Programs or Affiliates."}
            </p>
          </div>
        ) : null}
        {programList}
        {(creating || selected) && kind !== "story" ? (
          <p className="floor-settings-help">
            After this program is live, leads and rewards appear in {LABELS[kind]}.{" "}
            <Link href={dashHref(slug, dataNav)}>View program activity</Link>
          </p>
        ) : null}
        {(creating || selected) ? (
          <GrowthEditor
            key={creating ? "new" : `${selected.id}-${selected.version}`}
            kind={kind}
            record={creating ? undefined : selected}
            onSave={(data) => save(data, kind, creating ? undefined : selected)}
            onDraft={setPreviewDraft}
            onCancel={creating ? () => { setCreating(false); setPreviewDraft(null); } : undefined}
          />
        ) : null}
        {!creating && selected?.kind === "story" && selected.data.status === "published" ? (
          <section className="settings-editor-card growth-share">
            <h3>Share your story</h3>
            <code>{`/${slug}/story/${selected.id}`}</code>
            <div className="forms-share-actions">
              <a className="btn-ghost" href={`/${slug}/story/${selected.id}`} target="_blank" rel="noreferrer">Open story</a>
              <button className="btn-solid" onClick={() => void copyLink(`/${slug}/story/${selected.id}`)}>Copy link</button>
            </div>
          </section>
        ) : null}
        {!creating && selected && kind !== "story" ? (
          <section className="settings-editor-card">
            <div className="growth-section-head">
              <h3>{kind === "affiliate" ? "Affiliate partners" : "Referrers"}</h3>
              <button className="btn-solid" onClick={() => setChild({kind: "partner"})}>Add participant</button>
            </div>
            {!participants.length ? (
              <p className="floor-settings-help">Add a participant to generate their individual tracking link.</p>
            ) : (
              <div className="growth-table-wrap">
                <table className="growth-table">
                  <thead><tr><th>Name</th><th>Status</th><th>Tracking link</th></tr></thead>
                  <tbody>
                    {participants.map((r) => (
                      <tr key={r.id}>
                        <td><button className="growth-text-button" onClick={() => setChild({kind: "partner", record: r})}>{r.data.title}</button></td>
                        <td>{r.data.status}</td>
                        <td><button className="btn-ghost" onClick={() => void copyLink(`/${slug}/r/${r.id}`)}>Copy link</button></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            <p className="floor-settings-help">Links accept leads only while both the program and participant are active.</p>
            {child?.kind === "partner" ? (
              <GrowthEditor
                key={child.record?.id ?? "partner"}
                kind="partner"
                record={child.record}
                programId={selected.id}
                onSave={(data) => save(data, "partner", child.record)}
                onCancel={() => setChild(null)}
              />
            ) : null}
          </section>
        ) : null}
      </div>
      <PreviewFrame help={kind === "story" ? "Your story preview. Save to keep your changes." : "Your program preview. Save to keep your changes."} onRestart={() => void load()}>
        <div className="growth-preview-content">
          {previewData ? kind === "story" ? <GrowthStory data={previewData} /> : (
            <>
              <span className="growth-eyebrow">{kind === "referral" ? "Referral program" : "Affiliate program"}</span>
              <h2>{previewData.title}</h2>
              <p>{previewData.description || "Add a description of how the program works."}</p>
              <div className="growth-reward">
                <span>Reward per confirmed sale</span>
                <strong>{previewData.rewardType === "percent" ? `${previewData.reward}%` : money(previewData.reward, previewData.currency)}</strong>
              </div>
              <p className="growth-status">{previewData.status}</p>
              <p>Participants receive an individual link. Leads are attributed to that participant, and your team confirms sales and rewards.</p>
            </>
          ) : (
            <div className="growth-preview-empty">
              <h2>{kind === "story" ? "Your story starts here" : "Your program starts here"}</h2>
              <p>Save a {kind === "story" ? "draft" : "program"} to see its preview.</p>
            </div>
          )}
        </div>
      </PreviewFrame>
    </div>
  );
}

function GrowthEditor({kind,record,programId,participants=[],onSave,onCancel,onDraft}: {kind: GrowthKind; record?: GrowthRecord; programId?: string; participants?: GrowthRecord[]; onSave: (data: GrowthData) => Promise<void>; onCancel?: () => void; onDraft?: (data: GrowthData) => void}) {
  const [data,setData] = useState<GrowthData>(record?.data ?? {...newGrowthData(kind),programId: programId ?? "", partnerId: participants[0]?.id ?? ""});
  const [saving,setSaving] = useState(false);
  const [error,setError] = useState("");
  function patch(next: Partial<GrowthData>) {const value = {...data,...next}; setData(value); onDraft?.(value);}
  async function submit(event: FormEvent) {event.preventDefault(); setSaving(true); setError(""); try {await onSave(data);} catch (err) {setError(err instanceof Error ? err.message : "Could not save.");} finally {setSaving(false);}}
  function field(key: "title" | "description" | "email" | "reference" | "challenge" | "process" | "outcome" | "date", label: string, multiline=false) {return <label className="floor-settings-note"><span>{label}</span>{multiline ? <textarea rows={key === "description" ? 3 : 6} value={data[key]} maxLength={key === "description" ? 3000 : 12000} onChange={(e) => patch({[key]:e.target.value})} /> : <input type={key === "email" ? "email" : key === "date" ? "date" : "text"} required={key === "title"} maxLength={200} value={data[key]} onChange={(e) => patch({[key]:e.target.value})} />}</label>;}
  const statuses = kind === "story" ? ["draft","published","archived"] : kind === "partner" ? ["active","paused","archived"] : kind === "conversion" ? ["lead","confirmed","paid","rejected"] : ["draft","active","paused","archived"];
  return <form className="settings-editor-card growth-editor" onSubmit={(e) => void submit(e)}>
    <h3>{kind === "story" ? "Story details" : kind === "partner" ? "Participant details" : kind === "conversion" ? "Lead or sale details" : "Program details"}</h3>
    {field("title",kind === "story" ? "Story title" : kind === "partner" ? "Participant name" : kind === "conversion" ? "Customer name" : "Program name")}
    {field("description",kind === "story" ? "Introduction" : kind === "conversion" || kind === "partner" ? "Notes" : "How the program works",true)}
    <label className="floor-settings-note"><span>Status</span><select value={data.status} disabled={record?.data.status === "paid"} onChange={(e) => patch({status:e.target.value as GrowthData["status"]})}>{statuses.map((status) => <option key={status}>{status}</option>)}</select></label>
    {kind === "story" ? <>{field("date","Project date")}{field("challenge","The challenge — what needed to change?",true)}{field("process","The work — what did you do?",true)}{field("outcome","The outcome — what changed?",true)}<p className="floor-settings-help">Drafts are private. Publishing makes this story available to anyone with its link. Switch back to draft to unpublish.</p></> : null}
    {kind === "referral" || kind === "affiliate" ? <><div className="quick-build-customer-grid"><label className="floor-settings-note"><span>Reward type</span><select value={data.rewardType} onChange={(e) => patch({rewardType:e.target.value as GrowthData["rewardType"]})}><option value="fixed">Fixed amount per sale</option><option value="percent">Percentage of sale</option></select></label><label className="floor-settings-note"><span>Reward {data.rewardType === "percent" ? "(%)" : "amount"}</span><input type="number" min="0" max={data.rewardType === "percent" ? 100 : 100000000} step="0.01" value={data.reward} onChange={(e) => patch({reward:Number(e.target.value)})} /></label><label className="floor-settings-note"><span>Currency</span><select value={data.currency} onChange={(e) => patch({currency:e.target.value})}>{["USD","CAD","EUR","GBP","AUD"].map((c) => <option key={c}>{c}</option>)}</select></label></div><p className="floor-settings-help">Rewards are calculated when sales are confirmed. Later rate changes do not alter confirmed rewards.</p></> : null}
    {kind === "partner" || kind === "conversion" ? field("email","Email") : null}
    {kind === "conversion" ? <><label className="floor-settings-note"><span>Attributed participant</span><select disabled={Boolean(record)} value={data.partnerId} onChange={(e) => patch({partnerId:e.target.value})}>{participants.map((p) => <option key={p.id} value={p.id}>{p.data.title}</option>)}</select></label>{field("reference","Sale / order reference")}<label className="floor-settings-note"><span>Sale amount (program currency)</span><input type="number" min="0" max="100000000" step="0.01" disabled={record?.data.status === "paid" || record?.data.status === "confirmed"} value={data.amount} onChange={(e) => patch({amount:Number(e.target.value)})} /></label><p className="floor-settings-help">Confirm after verifying the sale. Mark paid only after you have paid the participant outside this app.</p></> : null}
    {error ? <p className="editor-error" role="alert">{error}</p> : null}
    <div className="forms-share-actions"><button className="btn-solid" type="submit" disabled={saving}>{saving ? "Saving…" : "Save changes"}</button>{onCancel ? <button className="btn-ghost" type="button" onClick={onCancel}>Cancel</button> : null}</div>
  </form>;
}
