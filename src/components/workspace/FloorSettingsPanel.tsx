"use client";

import { useEffect, useRef, useState } from "react";
import type {
  BannerTone,
  ChatBanner,
  FloorMember,
  FloorSettings,
  ResponseWindow,
  Weekday,
} from "@/lib/types";
import { readMediaFile } from "@/lib/store";
import { ChatBannerView } from "@/components/shared/ChatBannerView";
import { IconTrash, IconX } from "@/components/shared/Icons";

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

type SettingsTab = "brand" | "team" | "hours" | "shoutouts" | "notify";

const TABS: { id: SettingsTab; label: string }[] = [
  { id: "brand", label: "Brand" },
  { id: "team", label: "Team" },
  { id: "hours", label: "Hours" },
  { id: "shoutouts", label: "Shoutouts" },
  { id: "notify", label: "Notify" },
];

interface FloorSettingsPanelProps {
  settings: FloorSettings;
  members: FloorMember[];
  onChangeSettings: (settings: FloorSettings) => void;
  onChangeMembers: (members: FloorMember[]) => void;
  onClose: () => void;
}

export function FloorSettingsPanel({
  settings,
  members,
  onChangeSettings,
  onChangeMembers,
  onClose,
}: FloorSettingsPanelProps) {
  const [tab, setTab] = useState<SettingsTab>("brand");
  const [bannerDraft, setBannerDraft] = useState("");
  const [memberDraft, setMemberDraft] = useState("");
  const [notifyDraft, setNotifyDraft] = useState("");
  const [notifyError, setNotifyError] = useState<string | null>(null);
  const [ownerEmail, setOwnerEmail] = useState<string | null>(null);
  const [brandBusy, setBrandBusy] = useState<"banner" | "logo" | null>(null);
  const [brandError, setBrandError] = useState<string | null>(null);
  const bannerFileRef = useRef<HTMLInputElement>(null);
  const logoFileRef = useRef<HTMLInputElement>(null);
  const seededNotify = useRef(false);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  useEffect(() => {
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
  }, []);

  useEffect(() => {
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

  function addMember() {
    const name = memberDraft.trim();
    if (!name) return;
    const member: FloorMember = {
      id: `mem-${Date.now().toString(36)}`,
      name,
    };
    onChangeMembers([...members, member]);
    setMemberDraft("");
  }

  function updateMemberName(id: string, name: string) {
    onChangeMembers(
      members.map((m) => (m.id === id ? { ...m, name } : m)),
    );
  }

  function removeMember(id: string) {
    onChangeMembers(members.filter((m) => m.id !== id));
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

  const brandIncomplete = !settings.brandBannerUrl || !settings.logoUrl;
  const teamIncomplete = !members.some((m) => m.name.trim());
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
            <h2 id="floor-settings-title">Settings</h2>
            <p>Brand, team, hours, shoutouts, and notify.</p>
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

        <div className="floor-settings-tabs" role="tablist" aria-label="Settings">
          {TABS.map((item) => {
            const incomplete =
              (item.id === "brand" && brandIncomplete) ||
              (item.id === "team" && teamIncomplete);
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

        <div className="floor-settings-body">
          {tab === "brand" ? (
            <section
              className="floor-settings-section"
              role="tabpanel"
              id="settings-panel-brand"
              aria-labelledby="settings-tab-brand"
            >
              <p className="floor-settings-help">
                Banner sits at the top of customer chat and fades out. Logo
                appears as a circle beside your business name.
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
                  id="settings-brand-banner"
                  onChange={(e) =>
                    void onBrandImage("banner", e.target.files?.[0] ?? null)
                  }
                />
                <label
                  htmlFor="settings-brand-banner"
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
                  id="settings-brand-logo"
                  onChange={(e) =>
                    void onBrandImage("logo", e.target.files?.[0] ?? null)
                  }
                />
                <label
                  htmlFor="settings-brand-logo"
                  className="btn-solid-sm file-label"
                >
                  {brandBusy === "logo" ? "Uploading…" : "Choose logo"}
                </label>
              </div>

              {brandError ? <p className="editor-error">{brandError}</p> : null}
            </section>
          ) : null}

          {tab === "team" ? (
            <section
              className="floor-settings-section"
              role="tabpanel"
              id="settings-panel-team"
              aria-labelledby="settings-tab-team"
            >
              <p className="floor-settings-help">
                Add employees so chats can be assigned to someone. If
                there&apos;s only one person, they own every chat by default.
              </p>

              <ul className="floor-member-list">
                {members.map((member) => (
                  <li key={member.id} className="floor-member-item">
                    <input
                      className="floor-member-name"
                      value={member.name ?? ""}
                      onChange={(e) =>
                        updateMemberName(member.id, e.target.value)
                      }
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
                <input
                  value={memberDraft}
                  onChange={(e) => setMemberDraft(e.target.value)}
                  placeholder="Name…"
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      addMember();
                    }
                  }}
                />
                <button type="button" className="btn-solid" onClick={addMember}>
                  Add
                </button>
              </div>
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
                Shown on customer chat so they know when you usually reply.
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
                These emails get notified about new customer chats and messages.
                Your account email is included by default.
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
        </div>
      </div>
    </div>
  );
}
