"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import type {
  Artifact,
  BannerTone,
  ChatBanner,
  ComposerShortcut,
  EmailAlertKind,
  FloorMember,
  FloorSettings,
  ResponseWindow,
  Weekday,
} from "@/lib/types";
import { EMAIL_ALERT_OPTIONS, EMAIL_ALERT_DEFAULTS } from "@/lib/emailAlertOptions";
import { readMediaFile } from "@/lib/store";
import { ChatBannerView } from "@/components/shared/ChatBannerView";
import { SetupPanel } from "./SetupPanel";
import { ACCOUNT_TAB_SOLUTION, isSolutionEnabled } from "@/lib/setupSolutions";
import {
  IconChevronLeft,
  IconChevronRight,
  IconTrash,
  IconX,
} from "@/components/shared/Icons";

const DAY_OPTIONS: { id: Weekday; label: string }[] = [
  { id: "mon", label: "Mon" },
  { id: "tue", label: "Tue" },
  { id: "wed", label: "Wed" },
  { id: "thu", label: "Thu" },
  { id: "fri", label: "Fri" },
  { id: "sat", label: "Sat" },
  { id: "sun", label: "Sun" },
];

const TONE_OPTIONS: { id: BannerTone; label: string }[] = [
  { id: "flash", label: "Flash" },
  { id: "promo", label: "Promo" },
  { id: "sale", label: "Sale" },
  { id: "urgent", label: "Urgent" },
  { id: "ink", label: "Ink" },
  { id: "custom", label: "Custom" },
];

export type SettingsTab =
  | "setup"
  | "brand"
  | "hours"
  | "shortcuts"
  | "shoutouts"
  | "notify"
  | "billing"
  | "account";

export const ACCOUNT_SETTINGS_TABS: { id: SettingsTab; label: string }[] = [
  { id: "setup", label: "Setup" },
  { id: "brand", label: "Logo & banner" },
  { id: "hours", label: "Hours" },
  { id: "shortcuts", label: "Shortcuts" },
  { id: "shoutouts", label: "Promo banners" },
  { id: "notify", label: "Email alerts" },
  { id: "billing", label: "Billing" },
  { id: "account", label: "Your account" },
];

export function visibleAccountSettingsTabs(settings: FloorSettings) {
  return ACCOUNT_SETTINGS_TABS.filter((item) => {
    const required = ACCOUNT_TAB_SOLUTION[item.id];
    return !required || isSolutionEnabled(settings, required);
  });
}

const TABS = ACCOUNT_SETTINGS_TABS;

interface FloorSettingsPanelProps {
  settings: FloorSettings;
  members: FloorMember[];
  artifacts: Artifact[];
  initialTab?: SettingsTab;
  /** Controlled tab when variant is page */
  activeTab?: SettingsTab;
  ownerEmail?: string | null;
  loggingOut?: boolean;
  variant?: "modal" | "page";
  /** Skip the page chrome so this panel can sit inside another page. */
  embed?: boolean;
  onChangeSettings: (settings: FloorSettings) => void;
  onChangeMembers: (members: FloorMember[]) => void;
  onOpenWidget?: () => void;
  onLogOut: () => void;
  onClose?: () => void;
}

function newShortcutId() {
  return `sc-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
}

export function TeamMembersEditor({
  members,
  onChangeMembers,
  searchable = false,
}: {
  members: FloorMember[];
  onChangeMembers: (members: FloorMember[]) => void;
  searchable?: boolean;
}) {
  const [memberDraft, setMemberDraft] = useState("");
  const [lookupOpen, setLookupOpen] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const lookupRef = useRef<HTMLDivElement>(null);

  const matches = useMemo(() => {
    const query = memberDraft.trim().toLowerCase();
    const sorted = [...members].sort((a, b) =>
      (a.name || "").localeCompare(b.name || "", undefined, {
        sensitivity: "base",
      }),
    );
    if (!query) return sorted;
    return sorted.filter((member) =>
      (member.name || "").toLowerCase().includes(query),
    );
  }, [members, memberDraft]);

  useEffect(() => {
    if (!searchable) return;
    function onPointerDown(event: PointerEvent) {
      if (!lookupRef.current?.contains(event.target as Node)) {
        setLookupOpen(false);
      }
    }
    window.addEventListener("pointerdown", onPointerDown);
    return () => window.removeEventListener("pointerdown", onPointerDown);
  }, [searchable]);

  useEffect(() => {
    if (selectedId && !members.some((member) => member.id === selectedId)) {
      setSelectedId(null);
    }
  }, [members, selectedId]);

  function chooseMember(member: FloorMember) {
    setSelectedId(member.id);
    setMemberDraft(member.name ?? "");
    setLookupOpen(false);
  }

  function addMember() {
    const name = memberDraft.trim();
    if (!name) return;
    const existing = members.find(
      (member) => member.name.trim().toLowerCase() === name.toLowerCase(),
    );
    if (existing) {
      chooseMember(existing);
      return;
    }
    const member: FloorMember = {
      id: `mem-${Date.now().toString(36)}`,
      name,
    };
    onChangeMembers([...members, member]);
    setSelectedId(member.id);
    setMemberDraft("");
    setLookupOpen(false);
  }

  function updateMemberName(id: string, name: string) {
    onChangeMembers(
      members.map((m) => (m.id === id ? { ...m, name } : m)),
    );
  }

  function removeMember(id: string) {
    onChangeMembers(members.filter((m) => m.id !== id));
    if (selectedId === id) {
      setSelectedId(null);
      setMemberDraft("");
    }
  }

  const nameInput = (
    <input
      value={memberDraft}
      onChange={(e) => {
        setMemberDraft(e.target.value);
        if (searchable) setLookupOpen(true);
      }}
      onFocus={() => {
        if (searchable) setLookupOpen(true);
      }}
      placeholder={searchable ? "Search or pick an employee…" : "Name…"}
      aria-label={searchable ? "Search employees" : "Employee name"}
      aria-expanded={searchable ? lookupOpen : undefined}
      aria-controls={searchable ? "employee-lookup-results" : undefined}
      autoComplete="off"
      onKeyDown={(e) => {
        if (e.key === "Escape" && searchable) {
          e.preventDefault();
          setLookupOpen(false);
          return;
        }
        if (e.key === "Enter") {
          e.preventDefault();
          const exact = matches.find(
            (member) =>
              member.name.trim().toLowerCase() ===
              memberDraft.trim().toLowerCase(),
          );
          if (exact) chooseMember(exact);
          else addMember();
        }
      }}
    />
  );

  if (searchable) {
    return (
      <div className="employee-lookup">
        <div className="employee-lookup-search" ref={lookupRef}>
          {nameInput}
          <button type="button" className="btn-solid" onClick={addMember}>
            Add
          </button>
          {lookupOpen ? (
            <ul
              className="employee-lookup-results"
              id="employee-lookup-results"
              role="listbox"
            >
              {members.length === 0 ? (
                <li className="is-empty">
                  No employees yet. Type a name and Add.
                </li>
              ) : matches.length === 0 ? (
                <li className="is-empty">
                  No matching names. Add to create this person.
                </li>
              ) : (
                matches.map((member) => (
                  <li key={member.id} className="employee-lookup-row">
                    <button
                      type="button"
                      role="option"
                      aria-selected={member.id === selectedId}
                      className={member.id === selectedId ? "is-selected" : ""}
                      onClick={() => chooseMember(member)}
                    >
                      <strong>{member.name || "Unnamed"}</strong>
                    </button>
                    <button
                      type="button"
                      className="floor-banner-remove icon-btn"
                      onClick={() => removeMember(member.id)}
                      aria-label={`Remove ${member.name}`}
                      title="Remove"
                    >
                      <IconTrash size={13} />
                    </button>
                  </li>
                ))
              )}
            </ul>
          ) : null}
        </div>
      </div>
    );
  }

  return (
    <>
      <ul className="floor-member-list">
        {members.map((member) => (
          <li key={member.id} className="floor-member-item">
            <input
              className="floor-member-name"
              value={member.name ?? ""}
              onChange={(e) => updateMemberName(member.id, e.target.value)}
              aria-label="Member name"
            />
            <button
              type="button"
              className="floor-banner-remove icon-btn"
              onClick={() => removeMember(member.id)}
              aria-label={`Remove ${member.name}`}
              title="Remove"
            >
              <IconTrash size={13} />
            </button>
          </li>
        ))}
      </ul>
      <div className="floor-banner-add">
        {nameInput}
        <button type="button" className="btn-solid" onClick={addMember}>
          Add
        </button>
      </div>
    </>
  );
}

export function FloorSettingsPanel({
  settings,
  members,
  artifacts,
  initialTab = "setup",
  activeTab,
  ownerEmail: ownerEmailProp,
  loggingOut = false,
  variant = "modal",
  embed = false,
  onChangeSettings,
  onChangeMembers,
  onOpenWidget,
  onLogOut,
  onClose,
}: FloorSettingsPanelProps) {
  const [tabState, setTab] = useState<SettingsTab>(activeTab ?? initialTab);
  const tab = activeTab ?? tabState;
  const [bannerDraft, setBannerDraft] = useState("");
  const [notifyDraft, setNotifyDraft] = useState("");
  const [notifyError, setNotifyError] = useState<string | null>(null);
  const [ownerEmail, setOwnerEmail] = useState<string | null>(
    ownerEmailProp ?? null,
  );
  const [brandBusy, setBrandBusy] = useState<"banner" | "logo" | null>(null);
  const [brandError, setBrandError] = useState<string | null>(null);
  const [phraseLabel, setPhraseLabel] = useState("");
  const [phraseText, setPhraseText] = useState("");
  const [artifactPick, setArtifactPick] = useState("");
  const bannerFileRef = useRef<HTMLInputElement>(null);
  const logoFileRef = useRef<HTMLInputElement>(null);
  const seededNotify = useRef(false);
  const brandFieldId = useId();

  useEffect(() => {
    if (activeTab) setTab(activeTab);
  }, [activeTab]);

  useEffect(() => {
    if (variant !== "modal" || !onClose) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose?.();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [variant, onClose]);

  useEffect(() => {
    if (embed) return;
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch("/api/auth/me", { cache: "no-store" });
        const data = (await res.json()) as {
          user?: { email?: string } | null;
        };
        const email = data.user?.email?.trim().toLowerCase() || null;
        if (cancelled || !email) return;
        setOwnerEmail(email);
      } catch {
        // ignore
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [embed]);

  useEffect(() => {
    if (embed) return;
    if (seededNotify.current || !ownerEmail) return;
    const current = settings.notifyEmails ?? [];
    if (current.length > 0) {
      seededNotify.current = true;
      return;
    }
    seededNotify.current = true;
    onChangeSettings({
      ...settings,
      notifyEmails: [ownerEmail],
    });
    // Seed once when owner email loads and list is empty.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ownerEmail, settings.notifyEmails]);

  function patch(partial: Partial<FloorSettings>) {
    onChangeSettings({ ...settings, ...partial });
  }

  function updateWindow(index: number, next: ResponseWindow) {
    const windows = settings.windows.map((w, i) => (i === index ? next : w));
    patch({ windows });
  }

  function toggleDay(index: number, day: Weekday) {
    const window = settings.windows[index];
    if (!window) return;
    const has = window.days.includes(day);
    const days = has
      ? window.days.filter((d) => d !== day)
      : [...window.days, day];
    if (days.length === 0) return;
    updateWindow(index, { ...window, days });
  }

  function addBanner() {
    const text = bannerDraft.trim();
    if (!text) return;
    const banner: ChatBanner = {
      id: `bn-${Date.now().toString(36)}`,
      text,
      enabled: true,
      tone: "promo",
      label: "SHOUTOUT",
      size: "lg",
    };
    patch({ banners: [...settings.banners, banner] });
    setBannerDraft("");
  }

  function updateBanner(id: string, partial: Partial<ChatBanner>) {
    patch({
      banners: settings.banners.map((b) =>
        b.id === id ? { ...b, ...partial } : b,
      ),
    });
  }

  function removeBanner(id: string) {
    patch({ banners: settings.banners.filter((b) => b.id !== id) });
  }

  const shortcuts = settings.shortcuts ?? [];
  const pinnedArtifactIds = new Set(
    shortcuts
      .filter(
        (s): s is Extract<ComposerShortcut, { kind: "artifact" }> =>
          s.kind === "artifact",
      )
      .map((s) => s.artifactId),
  );
  const hasHoursShortcut = shortcuts.some((s) => s.kind === "hours");
  const availableArtifacts = artifacts.filter(
    (a) => !pinnedArtifactIds.has(a.id),
  );

  function setShortcuts(next: ComposerShortcut[]) {
    patch({ shortcuts: next.slice(0, 16) });
  }

  function addHoursShortcut() {
    if (hasHoursShortcut) return;
    setShortcuts([...shortcuts, { id: newShortcutId(), kind: "hours" }]);
  }

  function addTextShortcut() {
    const text = phraseText.trim();
    if (!text) return;
    const label =
      phraseLabel.trim().slice(0, 40) ||
      text.slice(0, 22) + (text.length > 22 ? "…" : "");
    setShortcuts([
      ...shortcuts,
      { id: newShortcutId(), kind: "text", label, text: text.slice(0, 2000) },
    ]);
    setPhraseLabel("");
    setPhraseText("");
  }

  function addArtifactShortcut(artifactId: string) {
    const id = artifactId.trim();
    if (!id || pinnedArtifactIds.has(id)) return;
    if (!artifacts.some((a) => a.id === id)) return;
    setShortcuts([
      ...shortcuts,
      { id: newShortcutId(), kind: "artifact", artifactId: id },
    ]);
    setArtifactPick("");
  }

  function removeShortcut(id: string) {
    setShortcuts(shortcuts.filter((s) => s.id !== id));
  }

  function moveShortcut(id: string, delta: -1 | 1) {
    const index = shortcuts.findIndex((s) => s.id === id);
    if (index < 0) return;
    const nextIndex = index + delta;
    if (nextIndex < 0 || nextIndex >= shortcuts.length) return;
    const next = [...shortcuts];
    const [row] = next.splice(index, 1);
    next.splice(nextIndex, 0, row);
    setShortcuts(next);
  }

  function shortcutLabel(sc: ComposerShortcut) {
    if (sc.kind === "hours") return "Hours";
    if (sc.kind === "text") return sc.label;
    const item = artifacts.find((a) => a.id === sc.artifactId);
    return (
      sc.label?.trim() ||
      item?.title?.trim() ||
      (item ? item.kind : "Missing artifact")
    );
  }

  function shortcutKindLabel(sc: ComposerShortcut) {
    if (sc.kind === "hours") return "Hours";
    if (sc.kind === "text") return "Phrase";
    const item = artifacts.find((a) => a.id === sc.artifactId);
    if (!item) return "Artifact";
    if (item.kind === "photo") return "Photo";
    if (item.kind === "video") return "Video";
    if (item.kind === "url") return "Link";
    if (item.kind === "text") return "Text";
    if (item.kind === "collection") return "Collection";
    return "Artifact";
  }

  function addNotifyEmail() {
    const email = notifyDraft.trim().toLowerCase();
    setNotifyError(null);
    if (!email) return;
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setNotifyError("Enter a valid email.");
      return;
    }
    const current = settings.notifyEmails ?? [];
    if (current.includes(email)) {
      setNotifyError("That email is already on the list.");
      return;
    }
    patch({ notifyEmails: [...current, email] });
    setNotifyDraft("");
  }

  function removeNotifyEmail(email: string) {
    setNotifyError(null);
    if (ownerEmail && email === ownerEmail) return;
    patch({
      notifyEmails: (settings.notifyEmails ?? []).filter((e) => e !== email),
    });
  }

  function toggleEmailAlert(kind: EmailAlertKind, on: boolean) {
    patch({
      emailAlerts: {
        ...EMAIL_ALERT_DEFAULTS,
        ...settings.emailAlerts,
        [kind]: on,
      },
    });
  }

  const brandIncomplete = !settings.brandBannerUrl || !settings.logoUrl;
  const notifyEmails = settings.notifyEmails ?? [];

  async function onBrandImage(
    kind: "banner" | "logo",
    file: File | null,
  ) {
    if (!file) return;
    setBrandBusy(kind);
    setBrandError(null);
    try {
      const media = await readMediaFile(file);
      if (media.kind !== "photo") {
        throw new Error("Pick an image file.");
      }
      if (kind === "banner") patch({ brandBannerUrl: media.url });
      else patch({ logoUrl: media.url });
    } catch (e) {
      setBrandError(e instanceof Error ? e.message : "Could not add image.");
    } finally {
      setBrandBusy(null);
      if (kind === "banner" && bannerFileRef.current) {
        bannerFileRef.current.value = "";
      }
      if (kind === "logo" && logoFileRef.current) {
        logoFileRef.current.value = "";
      }
    }
  }

  const pageTitle = TABS.find((t) => t.id === tab)?.label ?? "Settings";
  const visibleTabs = visibleAccountSettingsTabs(settings);

  const panels = (
    <>
          {tab === "setup" ? (
            <SetupPanel
              settings={settings}
              onChangeSettings={onChangeSettings}
            />
          ) : null}

          {tab === "brand" ? (
            <section
              className="floor-settings-section"
              role="tabpanel"
              id="settings-panel-brand"
              aria-labelledby="settings-tab-brand"
            >
              <p className="floor-settings-help">
                Banner sits at the top of your public page and customer chat.
                Logo appears as a circle beside your name.
              </p>

              <div className="brand-upload-block">
                <div className="brand-upload-head">
                  <h3>Banner</h3>
                  {settings.brandBannerUrl ? (
                    <button
                      type="button"
                      className="btn-text"
                      onClick={() => patch({ brandBannerUrl: undefined })}
                    >
                      Remove
                    </button>
                  ) : null}
                </div>
                {settings.brandBannerUrl ? (
                  <div className="brand-banner-preview">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={settings.brandBannerUrl} alt="" />
                  </div>
                ) : (
                  <p className="editor-hint">No banner yet.</p>
                )}
                <input
                  ref={bannerFileRef}
                  type="file"
                  accept="image/*"
                  className="sr-only"
                  id={`settings-brand-banner-${brandFieldId}`}
                  onChange={(e) =>
                    void onBrandImage("banner", e.target.files?.[0] ?? null)
                  }
                />
                <label
                  htmlFor={`settings-brand-banner-${brandFieldId}`}
                  className="btn-solid-sm file-label"
                >
                  {brandBusy === "banner" ? "Uploading…" : "Choose banner"}
                </label>
              </div>

              <div className="brand-upload-block">
                <div className="brand-upload-head">
                  <h3>Logo</h3>
                  {settings.logoUrl ? (
                    <button
                      type="button"
                      className="btn-text"
                      onClick={() => patch({ logoUrl: undefined })}
                    >
                      Remove
                    </button>
                  ) : null}
                </div>
                {settings.logoUrl ? (
                  <div className="brand-logo-preview">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={settings.logoUrl} alt="" />
                  </div>
                ) : (
                  <p className="editor-hint">No logo yet.</p>
                )}
                <input
                  ref={logoFileRef}
                  type="file"
                  accept="image/*"
                  className="sr-only"
                  id={`settings-brand-logo-${brandFieldId}`}
                  onChange={(e) =>
                    void onBrandImage("logo", e.target.files?.[0] ?? null)
                  }
                />
                <label
                  htmlFor={`settings-brand-logo-${brandFieldId}`}
                  className="btn-solid-sm file-label"
                >
                  {brandBusy === "logo" ? "Uploading…" : "Choose logo"}
                </label>
              </div>

              {brandError ? <p className="editor-error">{brandError}</p> : null}
            </section>
          ) : null}

          {tab === "hours" ? (
            <section
              className="floor-settings-section"
              role="tabpanel"
              id="settings-panel-hours"
              aria-labelledby="settings-tab-hours"
            >
              <p className="floor-settings-help">
                Shown on the public page and in chat so people know when you
                usually reply.
              </p>

              {settings.windows.map((window, index) => (
                <div key={index} className="floor-window">
                  <div className="floor-day-row" role="group" aria-label="Days">
                    {DAY_OPTIONS.map((day) => (
                      <button
                        key={day.id}
                        type="button"
                        className={
                          window.days.includes(day.id) ? "is-active" : undefined
                        }
                        onClick={() => toggleDay(index, day.id)}
                      >
                        {day.label}
                      </button>
                    ))}
                  </div>
                  <div className="floor-time-row">
                    <label>
                      <span>From</span>
                      <input
                        type="time"
                        value={window.start ?? "10:00"}
                        onChange={(e) =>
                          updateWindow(index, {
                            ...window,
                            start: e.target.value || "10:00",
                          })
                        }
                      />
                    </label>
                    <label>
                      <span>To</span>
                      <input
                        type="time"
                        value={window.end ?? "18:00"}
                        onChange={(e) =>
                          updateWindow(index, {
                            ...window,
                            end: e.target.value || "18:00",
                          })
                        }
                      />
                    </label>
                  </div>
                </div>
              ))}

              <label className="floor-settings-note">
                <span>Note (optional)</span>
                <input
                  value={settings.responseNote ?? ""}
                  onChange={(e) => patch({ responseNote: e.target.value })}
                  placeholder="e.g. Weekends are slower"
                />
              </label>
            </section>
          ) : null}

          {tab === "shortcuts" ? (
            <section
              className="floor-settings-section"
              role="tabpanel"
              id="settings-panel-shortcuts"
              aria-labelledby="settings-tab-shortcuts"
            >
              <p className="floor-settings-help">
                Pin photos, phrases, and links from Artifacts onto the chat
                shortcut bar for one-tap send. Assist / Artifacts / Receipt stay
                fixed.
              </p>

              {shortcuts.length === 0 ? (
                <p className="floor-settings-empty">
                  No shortcuts yet — add an artifact or a phrase below.
                </p>
              ) : (
                <ul className="floor-shortcut-list">
                  {shortcuts.map((sc, index) => (
                    <li key={sc.id} className="floor-shortcut-item">
                      <div className="floor-shortcut-meta">
                        <span className="floor-shortcut-kind">
                          {shortcutKindLabel(sc)}
                        </span>
                        <span className="floor-shortcut-label">
                          {shortcutLabel(sc)}
                        </span>
                        {sc.kind === "text" ? (
                          <span className="floor-shortcut-preview">
                            {sc.text}
                          </span>
                        ) : null}
                        {sc.kind === "artifact" &&
                        !artifacts.some((a) => a.id === sc.artifactId) ? (
                          <span className="floor-shortcut-missing">
                            Artifact missing — remove or re-add
                          </span>
                        ) : null}
                      </div>
                      <div className="floor-shortcut-actions">
                        <button
                          type="button"
                          className="btn-ghost icon-btn"
                          onClick={() => moveShortcut(sc.id, -1)}
                          disabled={index === 0}
                          aria-label="Move earlier"
                          title="Move earlier"
                        >
                          <IconChevronLeft size={14} />
                        </button>
                        <button
                          type="button"
                          className="btn-ghost icon-btn"
                          onClick={() => moveShortcut(sc.id, 1)}
                          disabled={index === shortcuts.length - 1}
                          aria-label="Move later"
                          title="Move later"
                        >
                          <IconChevronRight size={14} />
                        </button>
                        <button
                          type="button"
                          className="floor-banner-remove icon-btn"
                          onClick={() => removeShortcut(sc.id)}
                          aria-label="Remove shortcut"
                          title="Remove"
                        >
                          <IconTrash size={13} />
                        </button>
                      </div>
                    </li>
                  ))}
                </ul>
              )}

              <div className="floor-shortcut-add">
                <h3>Add from artifacts</h3>
                {availableArtifacts.length === 0 ? (
                  <p className="floor-settings-help">
                    {artifacts.length === 0
                      ? "Add photos, links, or phrases in Artifacts first."
                      : "Every artifact is already on the bar."}
                  </p>
                ) : (
                  <div className="floor-banner-add">
                    <select
                      value={artifactPick}
                      onChange={(e) => setArtifactPick(e.target.value)}
                      aria-label="Choose artifact"
                    >
                      <option value="">Choose artifact…</option>
                      {availableArtifacts.map((item) => (
                        <option key={item.id} value={item.id}>
                          {(item.title || item.kind).slice(0, 48)} · {item.kind}
                        </option>
                      ))}
                    </select>
                    <button
                      type="button"
                      className="btn-solid"
                      disabled={!artifactPick}
                      onClick={() => addArtifactShortcut(artifactPick)}
                    >
                      Add
                    </button>
                  </div>
                )}
              </div>

              <div className="floor-shortcut-add">
                <h3>Add a phrase</h3>
                <label className="floor-settings-note">
                  <span>Chip label</span>
                  <input
                    value={phraseLabel}
                    onChange={(e) => setPhraseLabel(e.target.value.slice(0, 40))}
                    placeholder="e.g. Parking"
                  />
                </label>
                <label className="floor-settings-note">
                  <span>Text inserted into the message</span>
                  <textarea
                    rows={2}
                    value={phraseText}
                    onChange={(e) => setPhraseText(e.target.value.slice(0, 2000))}
                    placeholder="We're on the corner of 5th & Pine — street parking out front."
                  />
                </label>
                <button
                  type="button"
                  className="btn-solid"
                  onClick={addTextShortcut}
                  disabled={!phraseText.trim()}
                >
                  Add phrase
                </button>
              </div>

              <div className="floor-shortcut-add">
                <h3>Hours chip</h3>
                <p className="floor-settings-help">
                  Inserts your response hours into the composer.
                </p>
                {hasHoursShortcut ? (
                  <p className="floor-settings-empty">Hours is already on the bar.</p>
                ) : (
                  <button
                    type="button"
                    className="btn-solid"
                    onClick={addHoursShortcut}
                  >
                    Add Hours
                  </button>
                )}
              </div>
            </section>
          ) : null}

          {tab === "shoutouts" ? (
            <section
              className="floor-settings-section"
              role="tabpanel"
              id="settings-panel-shoutouts"
              aria-labelledby="settings-tab-shoutouts"
            >
              <p className="floor-settings-help">
                Loud marketing strips at the top of every customer chat. Turn
                them on, pick a look, make them hard to miss.
              </p>

              <ul className="floor-banner-list">
                {settings.banners.map((banner) => (
                  <li key={banner.id} className="floor-banner-card">
                    <div className="floor-banner-card-top">
                      <label className="floor-banner-enable">
                        <input
                          type="checkbox"
                          checked={Boolean(banner.enabled)}
                          onChange={(e) =>
                            updateBanner(banner.id, {
                              enabled: e.target.checked,
                            })
                          }
                        />
                        <span>{banner.enabled ? "Live" : "Off"}</span>
                      </label>
                      <button
                        type="button"
                        className="floor-banner-remove icon-btn"
                        onClick={() => removeBanner(banner.id)}
                        aria-label="Remove shoutout"
                        title="Remove"
                      >
                        <IconTrash size={13} />
                      </button>
                    </div>

                    <ChatBannerView
                      banner={banner}
                      className="floor-banner-preview"
                    />

                    <label className="floor-banner-field">
                      <span>Message</span>
                      <textarea
                        className="floor-banner-text"
                        rows={2}
                        value={banner.text ?? ""}
                        onChange={(e) =>
                          updateBanner(banner.id, { text: e.target.value })
                        }
                        placeholder="Walk-ins welcome · 20% off color today"
                      />
                    </label>

                    <label className="floor-banner-field">
                      <span>Label (optional)</span>
                      <input
                        value={banner.label ?? ""}
                        onChange={(e) =>
                          updateBanner(banner.id, {
                            label: e.target.value.slice(0, 24),
                          })
                        }
                        placeholder="DEAL, TODAY, SHOUTOUT…"
                      />
                    </label>

                    <div className="floor-banner-field">
                      <span>Look</span>
                      <div
                        className="floor-banner-tones"
                        role="group"
                        aria-label="Banner look"
                      >
                        {TONE_OPTIONS.map((tone) => (
                          <button
                            key={tone.id}
                            type="button"
                            className={
                              banner.tone === tone.id
                                ? `banner-tone-pill tone-${tone.id} is-active`
                                : `banner-tone-pill tone-${tone.id}`
                            }
                            onClick={() =>
                              updateBanner(banner.id, { tone: tone.id })
                            }
                          >
                            {tone.label}
                          </button>
                        ))}
                      </div>
                    </div>

                    {banner.tone === "custom" ? (
                      <div className="floor-banner-colors">
                        <label>
                          <span>Background</span>
                          <input
                            type="color"
                            value={banner.bg || "#ff2d55"}
                            onChange={(e) =>
                              updateBanner(banner.id, { bg: e.target.value })
                            }
                          />
                        </label>
                        <label>
                          <span>Text</span>
                          <input
                            type="color"
                            value={banner.color || "#ffffff"}
                            onChange={(e) =>
                              updateBanner(banner.id, {
                                color: e.target.value,
                              })
                            }
                          />
                        </label>
                      </div>
                    ) : null}

                    <div className="floor-banner-field">
                      <span>Size</span>
                      <div
                        className="floor-banner-tones"
                        role="group"
                        aria-label="Banner size"
                      >
                        <button
                          type="button"
                          className={
                            banner.size === "md"
                              ? "banner-tone-pill is-active"
                              : "banner-tone-pill"
                          }
                          onClick={() =>
                            updateBanner(banner.id, { size: "md" })
                          }
                        >
                          Regular
                        </button>
                        <button
                          type="button"
                          className={
                            banner.size !== "md"
                              ? "banner-tone-pill is-active"
                              : "banner-tone-pill"
                          }
                          onClick={() =>
                            updateBanner(banner.id, { size: "lg" })
                          }
                        >
                          Loud
                        </button>
                      </div>
                    </div>
                  </li>
                ))}
              </ul>

              <div className="floor-banner-add">
                <input
                  value={bannerDraft}
                  onChange={(e) => setBannerDraft(e.target.value)}
                  placeholder="New shoutout…"
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      addBanner();
                    }
                  }}
                />
                <button type="button" className="btn-solid" onClick={addBanner}>
                  Add
                </button>
              </div>
            </section>
          ) : null}

          {tab === "notify" ? (
            <section
              className="floor-settings-section"
              role="tabpanel"
              id="settings-panel-notify"
              aria-labelledby="settings-tab-notify"
            >
              <p className="floor-settings-help">
                Pick which emails go out, then who on your team receives the
                staff alerts. Customers only get a message when they ask for a
                link or leave contact details.
              </p>

              <div className="email-alert-groups">
                <div className="email-alert-group">
                  <h3>Emails to your team</h3>
                  <div className="email-alert-grid">
                    {EMAIL_ALERT_OPTIONS.filter(
                      (item) => item.audience === "owner",
                    ).map((item) => (
                      <label key={item.id} className="staff-out-toggle-card">
                        <input
                          type="checkbox"
                          checked={
                            settings.emailAlerts?.[item.id] ??
                            EMAIL_ALERT_DEFAULTS[item.id]
                          }
                          onChange={(event) =>
                            toggleEmailAlert(item.id, event.target.checked)
                          }
                        />
                        <span>
                          <strong>{item.label}</strong>
                          <small>{item.help}</small>
                        </span>
                      </label>
                    ))}
                  </div>
                </div>

                <div className="email-alert-group">
                  <h3>Emails to customers</h3>
                  <div className="email-alert-grid">
                    {EMAIL_ALERT_OPTIONS.filter(
                      (item) => item.audience === "customer",
                    ).map((item) => (
                      <label key={item.id} className="staff-out-toggle-card">
                        <input
                          type="checkbox"
                          checked={
                            settings.emailAlerts?.[item.id] ??
                            EMAIL_ALERT_DEFAULTS[item.id]
                          }
                          onChange={(event) =>
                            toggleEmailAlert(item.id, event.target.checked)
                          }
                        />
                        <span>
                          <strong>{item.label}</strong>
                          <small>{item.help}</small>
                        </span>
                      </label>
                    ))}
                  </div>
                </div>
              </div>

              <h3>Staff alert recipients</h3>
              <p className="floor-settings-help">
                These addresses get the team emails above. Your account email
                is included by default.
              </p>

              <ul className="floor-member-list floor-notify-list">
                {notifyEmails.map((email) => {
                  const isOwner = Boolean(ownerEmail && email === ownerEmail);
                  return (
                    <li key={email} className="floor-member-item">
                      <span className="floor-notify-email">
                        {email}
                        {isOwner ? (
                          <span className="floor-notify-badge">Account</span>
                        ) : null}
                      </span>
                      {isOwner ? null : (
                        <button
                          type="button"
                          className="floor-banner-remove icon-btn"
                          onClick={() => removeNotifyEmail(email)}
                          aria-label={`Remove ${email}`}
                          title="Remove"
                        >
                          <IconTrash size={13} />
                        </button>
                      )}
                    </li>
                  );
                })}
              </ul>

              <div className="floor-banner-add">
                <input
                  type="email"
                  value={notifyDraft}
                  onChange={(e) => {
                    setNotifyDraft(e.target.value);
                    setNotifyError(null);
                  }}
                  placeholder="Add email…"
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      addNotifyEmail();
                    }
                  }}
                />
                <button
                  type="button"
                  className="btn-solid"
                  onClick={addNotifyEmail}
                >
                  Add
                </button>
              </div>
              {notifyError ? <p className="editor-error">{notifyError}</p> : null}
            </section>
          ) : null}

          {tab === "billing" ? (
            <section
              className="floor-settings-section"
              role="tabpanel"
              id="settings-panel-billing"
              aria-labelledby="settings-tab-billing"
            >
              <p className="floor-settings-help">
                Plan, invoices, and payment for this space will live here.
              </p>
              <p className="floor-settings-empty">
                Billing isn’t connected yet. You’ll be able to manage your plan
                from this page.
              </p>
            </section>
          ) : null}

          {tab === "account" ? (
            <section
              className="floor-settings-section"
              role="tabpanel"
              id="settings-panel-account"
              aria-labelledby="settings-tab-account"
            >
              <p className="floor-settings-help">
                Signed-in email and sign-out for this space.
              </p>

              {ownerEmail ? (
                <p className="floor-settings-note">
                  <span>Signed in as</span>
                  <strong>{ownerEmail}</strong>
                </p>
              ) : null}

              <div className="account-actions">
                {onOpenWidget ? (
                  <button
                    type="button"
                    className="btn-solid"
                    onClick={() => {
                      onClose?.();
                      onOpenWidget();
                    }}
                  >
                    Website widget
                  </button>
                ) : null}
                <button
                  type="button"
                  className="btn-ghost"
                  onClick={onLogOut}
                  disabled={loggingOut}
                >
                  {loggingOut ? "Signing out…" : "Log out"}
                </button>
              </div>
            </section>
          ) : null}
    </>
  );

  if (variant === "page") {
    if (embed) return panels;
    return (
      <div
        className={`dashboard-panel-body${tab === "setup" ? " is-setup" : ""}`}
      >
        <h2 className="dashboard-panel-title">{pageTitle}</h2>
        {panels}
      </div>
    );
  }

  return (
    <div className="floor-settings-backdrop" onClick={onClose}>
      <div
        className="floor-settings-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="floor-settings-title"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="floor-settings-head">
          <div>
            <h2 id="floor-settings-title">Account Settings</h2>
            <p>Industry setup, brand, hours, and account.</p>
          </div>
          <button
            type="button"
            className="btn-ghost icon-btn"
            onClick={onClose}
            aria-label="Close"
            title="Close"
          >
            <IconX />
          </button>
        </header>

        <div className="floor-settings-tabs" role="tablist" aria-label="Account Settings">
          {visibleTabs.map((item) => {
            const incomplete = item.id === "brand" && brandIncomplete;
            return (
              <button
                key={item.id}
                type="button"
                role="tab"
                id={`settings-tab-${item.id}`}
                aria-selected={tab === item.id}
                aria-controls={`settings-panel-${item.id}`}
                className={tab === item.id ? "is-active" : undefined}
                onClick={() => setTab(item.id)}
              >
                <span>{item.label}</span>
                {incomplete ? (
                  <span
                    className="settings-tab-alert"
                    aria-label={`${item.label} incomplete`}
                    title="Needs setup"
                  >
                    !
                  </span>
                ) : null}
              </button>
            );
          })}
        </div>

        <div className="floor-settings-body">{panels}</div>
      </div>
    </div>
  );
}
