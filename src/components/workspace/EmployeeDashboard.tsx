"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type {
  BusinessSpace,
  Client,
  FloorMember,
  FloorSettings,
} from "@/lib/types";
import {
  applySpaceOp,
  applySpaceOpToSpace,
  bootFloor,
  subscribeSpace,
} from "@/lib/store";
import type { SpaceOp } from "@/lib/spaceOps";
import { waitSinceLabel } from "@/lib/messageTime";
import { isClientLive } from "@/lib/presence";
import { WorkspaceTopBar } from "./WorkspaceTopBar";
import {
  ACCOUNT_SETTINGS_TABS,
  FloorSettingsPanel,
  type SettingsTab,
} from "./FloorSettingsPanel";
import {
  PREF_SECTIONS,
  UserPreferencesPanel,
  type PrefSection,
} from "./UserPreferencesPanel";
import { QrShareModal } from "./QrShareModal";
import { CornerTools } from "@/components/shared/CornerTools";
import { IconChevronDown, IconX } from "@/components/shared/Icons";

interface EmployeeDashboardProps {
  slug: string;
}

type DashNav =
  | "home"
  | `pref:${PrefSection}`
  | `account:${SettingsTab}`;

function guestActiveClients(clients: Client[]) {
  return clients.filter((c) => c.preview.trim());
}

function activityLabel(iso: string) {
  const ms = Date.parse(iso);
  if (!Number.isFinite(ms)) return "";
  return waitSinceLabel(ms);
}

function settingsTabFromQuery(raw: string | null): SettingsTab | null {
  if (!raw) return null;
  return ACCOUNT_SETTINGS_TABS.some((t) => t.id === raw)
    ? (raw as SettingsTab)
    : null;
}

export function EmployeeDashboard({ slug }: EmployeeDashboardProps) {
  const router = useRouter();
  const [space, setSpace] = useState<BusinessSpace | null>(null);
  const [floorMemberId, setFloorMemberId] = useState("all");
  const [copied, setCopied] = useState(false);
  const [clientUrl, setClientUrl] = useState("");
  const [qrOpen, setQrOpen] = useState(false);
  const [widgetOpen, setWidgetOpen] = useState(false);
  const [widgetCopied, setWidgetCopied] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);
  const [nav, setNav] = useState<DashNav>("home");
  const [prefsOpen, setPrefsOpen] = useState(true);
  const [accountOpen, setAccountOpen] = useState(true);
  const opsInFlight = useRef(0);
  const openedFromQuery = useRef(false);

  useEffect(() => {
    if (openedFromQuery.current) return;
    const tab = settingsTabFromQuery(
      new URLSearchParams(window.location.search).get("settings"),
    );
    if (!tab) return;
    openedFromQuery.current = true;
    setAccountOpen(true);
    setNav(`account:${tab}`);
    router.replace(`/${slug}/dashboard`, { scroll: false });
  }, [slug, router]);

  useEffect(() => {
    document.documentElement.classList.add("floor-lock");
    return () => document.documentElement.classList.remove("floor-lock");
  }, []);

  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(`otgf-floor-member:${slug}`);
      if (saved) setFloorMemberId(saved);
    } catch {
      // ignore
    }
  }, [slug]);

  function chooseFloorMember(memberId: string) {
    setFloorMemberId(memberId);
    try {
      window.localStorage.setItem(`otgf-floor-member:${slug}`, memberId);
    } catch {
      // ignore
    }
  }

  useEffect(() => {
    let cancelled = false;
    async function boot() {
      const loaded = await bootFloor(slug);
      if (cancelled) return;
      setSpace(loaded);
      setClientUrl(`${window.location.origin}/${slug}`);
    }
    void boot();
    const unsubscribe = subscribeSpace(slug, (next) => {
      if (!next) return;
      setSpace((current) => {
        if (opsInFlight.current > 0 && current) {
          return { ...next, settings: current.settings };
        }
        return next;
      });
    });
    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, [slug]);

  const members = space?.members ?? [];
  const clients = useMemo(
    () => guestActiveClients(space?.clients ?? []),
    [space?.clients],
  );

  useEffect(() => {
    if (members.length === 0) {
      if (floorMemberId !== "all") chooseFloorMember("all");
      return;
    }
    if (
      floorMemberId === "all" ||
      !members.some((m) => m.id === floorMemberId)
    ) {
      chooseFloorMember(members[0].id);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [members, floorMemberId]);

  function runOp(op: SpaceOp) {
    setSpace((current) =>
      current ? applySpaceOpToSpace(current, op) : current,
    );
    opsInFlight.current += 1;
    void applySpaceOp(slug, op)
      .catch((err) => console.warn("Update failed:", err))
      .finally(() => {
        opsInFlight.current = Math.max(0, opsInFlight.current - 1);
      });
  }

  function updateSettings(settings: FloorSettings) {
    runOp({ type: "setSettings", settings });
  }

  function updateMembers(nextMembers: FloorMember[]) {
    runOp({ type: "updateMembers", members: nextMembers });
  }

  function toggleLive() {
    if (!space) return;
    runOp({
      type: "setSettings",
      settings: { ...space.settings, live: !space.settings.live },
    });
  }

  function copyClientUrl() {
    if (!clientUrl) return;
    void navigator.clipboard.writeText(clientUrl).then(() => {
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    });
  }

  async function logOut() {
    if (loggingOut) return;
    setLoggingOut(true);
    try {
      await fetch("/api/auth/logout", { method: "POST" });
      router.push("/");
      router.refresh();
    } catch {
      setLoggingOut(false);
    }
  }

  function widgetSnippet() {
    const origin =
      typeof window !== "undefined" ? window.location.origin : "";
    return `<script src="${origin}/widget.js" data-slug="${slug}" async></script>`;
  }

  async function copyWidgetSnippet() {
    await navigator.clipboard.writeText(widgetSnippet());
    setWidgetCopied(true);
    window.setTimeout(() => setWidgetCopied(false), 1600);
  }

  useEffect(() => {
    if (!widgetOpen) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setWidgetOpen(false);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [widgetOpen]);

  const openChats = clients.filter((c) => !c.chatEndedAt);
  const unreadTotal = clients.reduce((sum, c) => sum + (c.unread || 0), 0);
  const presentNow = clients.filter((c) => isClientLive(c)).length;

  const byOwner = useMemo(() => {
    const rows = members.map((m) => {
      const owned = openChats.filter((c) => c.ownerMemberId === m.id);
      const unread = owned.reduce((sum, c) => sum + (c.unread || 0), 0);
      return { member: m, chats: owned.length, unread };
    });
    const unassigned = openChats.filter(
      (c) => !c.ownerMemberId || !members.some((m) => m.id === c.ownerMemberId),
    );
    return { rows, unassigned: unassigned.length };
  }, [members, openChats]);

  const recent = useMemo(() => {
    return [...clients]
      .sort(
        (a, b) =>
          new Date(b.lastActive).getTime() - new Date(a.lastActive).getTime(),
      )
      .slice(0, 8);
  }, [clients]);

  if (!space) {
    return <div className="client-chat-loading">Loading dashboard…</div>;
  }

  const settingsPayload = {
    ...space.settings,
    responseNote: space.settings.responseNote ?? "",
    awayMessage: space.settings.awayMessage ?? "",
    windows: space.settings.windows ?? [],
    banners: space.settings.banners ?? [],
    brandBannerUrl: space.settings.brandBannerUrl,
    logoUrl: space.settings.logoUrl,
    intro: space.settings.intro ?? "",
    profileLinks: space.settings.profileLinks ?? [],
    notifyEmails: space.settings.notifyEmails ?? [],
    assistBehavior: space.settings.assistBehavior ?? "",
    shortcuts: space.settings.shortcuts ?? [],
  };

  const brandIncomplete =
    !space.settings.brandBannerUrl || !space.settings.logoUrl;
  const teamIncomplete = !members.some((m) => m.name.trim());

  const overview = (
    <div className="dashboard-overview">
      <header className="dashboard-hero">
        <div>
          <p className="dashboard-kicker">Dashboard</p>
          <h1>{space.business.name}</h1>
          <p className="dashboard-lede">
            Share your link, tune the space, and see who’s covering which chats
            — then jump back to the floor to answer.
          </p>
        </div>
        <Link href={`/${slug}/floor`} className="btn-solid">
          Open floor
        </Link>
      </header>

      <section className="dashboard-stats" aria-label="Overview">
        <div className="dashboard-stat">
          <span className="dashboard-stat-label">Open chats</span>
          <strong>{openChats.length}</strong>
        </div>
        <div className="dashboard-stat">
          <span className="dashboard-stat-label">Unread</span>
          <strong>{unreadTotal}</strong>
        </div>
        <div className="dashboard-stat">
          <span className="dashboard-stat-label">Customers here</span>
          <strong>{presentNow}</strong>
        </div>
        <div className="dashboard-stat">
          <span className="dashboard-stat-label">Status</span>
          <strong className={space.settings.live ? "is-live" : ""}>
            {space.settings.live ? "Live" : "Away"}
          </strong>
        </div>
      </section>

      <div className="dashboard-grid">
        <section className="dashboard-card">
          <header className="dashboard-card-head">
            <h2>Team load</h2>
            <p>Open chats by employee</p>
          </header>
          {members.length === 0 ? (
            <p className="dashboard-empty">
              Add team members under Account Settings → Team.
            </p>
          ) : (
            <ul className="dashboard-team-list">
              {byOwner.rows.map(({ member, chats, unread }) => (
                <li key={member.id}>
                  <div>
                    <strong>{member.name || "Unnamed"}</strong>
                    <span>
                      {chats} open
                      {unread ? ` · ${unread} unread` : ""}
                    </span>
                  </div>
                  <span className="dashboard-load-bar" aria-hidden>
                    <span style={{ width: `${Math.min(100, chats * 18)}%` }} />
                  </span>
                </li>
              ))}
              {byOwner.unassigned > 0 ? (
                <li className="is-muted">
                  <div>
                    <strong>Unassigned</strong>
                    <span>{byOwner.unassigned} open</span>
                  </div>
                </li>
              ) : null}
            </ul>
          )}
        </section>

        <section className="dashboard-card">
          <header className="dashboard-card-head">
            <h2>Recent chats</h2>
            <p>Jump back into the floor inbox</p>
          </header>
          {recent.length === 0 ? (
            <p className="dashboard-empty">No customer chats yet.</p>
          ) : (
            <ul className="dashboard-recent-list">
              {recent.map((client) => {
                const owner = members.find(
                  (m) => m.id === client.ownerMemberId,
                );
                return (
                  <li key={client.id}>
                    <Link href={`/${slug}/floor`}>
                      <div className="dashboard-recent-main">
                        <strong>{client.name}</strong>
                        <span>{client.preview || "No messages yet"}</span>
                      </div>
                      <div className="dashboard-recent-meta">
                        <span>{activityLabel(client.lastActive)}</span>
                        <span>{owner?.name || "Unassigned"}</span>
                      </div>
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      </div>
    </div>
  );

  let main: ReactNode = overview;
  if (nav.startsWith("pref:")) {
    const section = nav.slice(5) as PrefSection;
    main = (
      <UserPreferencesPanel
        slug={slug}
        settings={settingsPayload}
        onChangeSettings={updateSettings}
        variant="page"
        section={section}
      />
    );
  } else if (nav.startsWith("account:")) {
    const tab = nav.slice(8) as SettingsTab;
    main = (
      <FloorSettingsPanel
        settings={settingsPayload}
        members={members}
        artifacts={space.artifacts ?? []}
        variant="page"
        activeTab={tab}
        loggingOut={loggingOut}
        onChangeSettings={updateSettings}
        onChangeMembers={updateMembers}
        onLogOut={() => void logOut()}
      />
    );
  }

  return (
    <div className="workspace workspace-dashboard">
      <WorkspaceTopBar
        slug={slug}
        businessName={space.business.name}
        view="dashboard"
        live={space.settings.live}
        onToggleLive={toggleLive}
        members={members}
        floorMemberId={floorMemberId}
        onChooseMember={chooseFloorMember}
        copied={copied}
        onCopyLink={copyClientUrl}
        onOpenQr={() => setQrOpen(true)}
        onOpenWidget={() => {
          setWidgetOpen(true);
          setWidgetCopied(false);
        }}
      />

      <div className="dashboard-layout">
        <nav className="dashboard-nav" aria-label="Dashboard">
          <button
            type="button"
            className={`dashboard-nav-item ${nav === "home" ? "is-active" : ""}`}
            onClick={() => setNav("home")}
          >
            Dashboard
          </button>

          <div className="dashboard-nav-group">
            <button
              type="button"
              className="dashboard-nav-group-toggle"
              aria-expanded={prefsOpen}
              onClick={() => setPrefsOpen((v) => !v)}
            >
              <span>User Preferences</span>
              <IconChevronDown
                size={16}
                className={prefsOpen ? "is-open" : undefined}
              />
            </button>
            {prefsOpen ? (
              <div className="dashboard-nav-children">
                {PREF_SECTIONS.map((item) => {
                  const id: DashNav = `pref:${item.id}`;
                  return (
                    <button
                      key={item.id}
                      type="button"
                      className={`dashboard-nav-item is-child ${nav === id ? "is-active" : ""}`}
                      onClick={() => setNav(id)}
                    >
                      {item.label}
                    </button>
                  );
                })}
              </div>
            ) : null}
          </div>

          <div className="dashboard-nav-group">
            <button
              type="button"
              className="dashboard-nav-group-toggle"
              aria-expanded={accountOpen}
              onClick={() => setAccountOpen((v) => !v)}
            >
              <span>Account Settings</span>
              <IconChevronDown
                size={16}
                className={accountOpen ? "is-open" : undefined}
              />
            </button>
            {accountOpen ? (
              <div className="dashboard-nav-children">
                {ACCOUNT_SETTINGS_TABS.map((item) => {
                  const id: DashNav = `account:${item.id}`;
                  const incomplete =
                    (item.id === "brand" && brandIncomplete) ||
                    (item.id === "team" && teamIncomplete);
                  return (
                    <button
                      key={item.id}
                      type="button"
                      className={`dashboard-nav-item is-child ${nav === id ? "is-active" : ""}`}
                      onClick={() => setNav(id)}
                    >
                      <span>{item.label}</span>
                      {incomplete ? (
                        <span className="settings-tab-alert" aria-hidden>
                          !
                        </span>
                      ) : null}
                    </button>
                  );
                })}
              </div>
            ) : null}
          </div>
        </nav>

        <div className="dashboard-main">{main}</div>
      </div>

      <CornerTools />

      {qrOpen ? (
        <QrShareModal
          url={clientUrl || `/${slug}`}
          businessName={space.business.name}
          copied={copied}
          onCopyLink={copyClientUrl}
          onClose={() => setQrOpen(false)}
        />
      ) : null}

      {widgetOpen ? (
        <div
          className="widget-snippet-backdrop"
          onClick={() => setWidgetOpen(false)}
        >
          <div
            className="widget-snippet-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="widget-snippet-title"
            onClick={(e) => e.stopPropagation()}
          >
            <header className="widget-snippet-head">
              <div>
                <h2 id="widget-snippet-title">Website widget</h2>
                <p>
                  Paste this on your store site — a chat bubble appears in the
                  corner, same inbox as the link.
                </p>
              </div>
              <button
                type="button"
                className="btn-ghost icon-btn"
                onClick={() => setWidgetOpen(false)}
                aria-label="Close"
                title="Close"
              >
                <IconX />
              </button>
            </header>
            <div className="widget-snippet-body">
              <pre className="widget-snippet-code">
                <code>{widgetSnippet()}</code>
              </pre>
              <div className="widget-snippet-actions">
                <button
                  type="button"
                  className="btn-solid"
                  onClick={() => void copyWidgetSnippet()}
                >
                  {widgetCopied ? "Copied" : "Copy snippet"}
                </button>
                <a
                  className="btn-ghost"
                  href={`/${slug}/embed`}
                  target="_blank"
                  rel="noreferrer"
                >
                  Preview embed
                </a>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
