"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type {
  BusinessSpace,
  Client,
  CustomerCase,
  CustomerCaseIdentifier,
  CustomerCaseStatus,
  FloorMember,
  FloorSettings,
  Message,
  Offering,
  KnowledgeNote,
} from "@/lib/types";
import {
  appendMessage,
  applySpaceOp,
  applySpaceOpToSpace,
  bootFloor,
  subscribeSpace,
} from "@/lib/store";
import type { SpaceOp } from "@/lib/spaceOps";
import { waitSinceLabel } from "@/lib/messageTime";
import { isClientLive } from "@/lib/presence";
import { messageTimeStamp } from "@/lib/spaceNormalize";
import { autoAnswerListLabel, withoutAutoAnswerDraft } from "@/lib/autoAnswer";
import { WorkspaceTopBar } from "./WorkspaceTopBar";
import {
  ACCOUNT_SETTINGS_TABS,
  FloorSettingsPanel,
  visibleAccountSettingsTabs,
  type SettingsTab,
} from "./FloorSettingsPanel";
import {
  UserPreferencesPanel,
  visiblePrefSections,
  type PrefSection,
} from "./UserPreferencesPanel";
import { ShareQrCard } from "./QrShareModal";
import { ClientFacingPanel } from "./ClientFacingPanel";
import { WebsiteInstallPanel } from "./WebsiteInstallPanel";
import { OfferingsPanel } from "./OfferingsPanel";
import { AiSetupPanel } from "./AiSetupPanel";
import { CasesPanel } from "./CasesPanel";
import { AutoAnswerReview, AutoAnswerToggle } from "./AutoAnswerReview";
import { CornerTools } from "@/components/shared/CornerTools";
import { IconChevronDown } from "@/components/shared/Icons";
import {
  ACCOUNT_TAB_SOLUTION,
  PREF_SECTION_SOLUTION,
  isSolutionEnabled,
} from "@/lib/setupSolutions";

interface EmployeeDashboardProps {
  slug: string;
}

type DashNav =
  | "home"
  | `pref:${PrefSection}`
  | `account:${SettingsTab}`
  | "client:page"
  | "client:chat"
  | "site:contact"
  | "site:bubble"
  | "offerings"
  | "cases"
  | "ai";

type DashGroupId = "business" | "account";

type DashNavEntry =
  | { kind: "pref"; id: PrefSection; label: string }
  | { kind: "account"; id: SettingsTab; label: string }
  | { kind: "client"; id: "page" | "chat"; label: string }
  | { kind: "site"; id: "contact" | "bubble"; label: string }
  | { kind: "offerings"; label: string }
  | { kind: "cases"; label: string }
  | { kind: "ai"; label: string };

interface DashNavNested {
  id: string;
  label: string;
  items: DashNavEntry[];
}

type DashNavNode = DashNavEntry | DashNavNested;

const DASH_NAV_GROUPS: {
  id: DashGroupId;
  label: string;
  items: DashNavNode[];
}[] = [
  {
    id: "business",
    label: "Business settings",
    items: [
      { kind: "account", id: "setup", label: "Setup" },
      { kind: "offerings", label: "What you offer" },
      { kind: "account", id: "team", label: "Team" },
      { kind: "ai", label: "AI setup" },
      {
        id: "client-experience",
        label: "What clients see",
        items: [
          { kind: "client", id: "page", label: "Public page" },
          { kind: "client", id: "chat", label: "Live chat" },
        ],
      },
      {
        id: "site-install",
        label: "On your website",
        items: [
          { kind: "site", id: "contact", label: "Contact page" },
          { kind: "site", id: "bubble", label: "Chat bubble" },
        ],
      },
      { kind: "pref", id: "sounds", label: "Sounds" },
      { kind: "account", id: "shortcuts", label: "Shortcuts" },
    ],
  },
  {
    id: "account",
    label: "Account settings",
    items: [
      { kind: "account", id: "billing", label: "Billing" },
      { kind: "account", id: "notify", label: "Email alerts" },
      { kind: "account", id: "account", label: "Your account" },
    ],
  },
];

const SETTINGS_QUERY_TO_NAV: Partial<Record<SettingsTab, DashNav>> = {
  brand: "client:page",
  hours: "client:page",
  shoutouts: "client:chat",
};

const SETTINGS_QUERY_TO_SECTION: Partial<Record<SettingsTab, string>> = {
  brand: "cf-look",
  hours: "cf-hours",
  shoutouts: "cf-promos",
};

const LEGACY_NAV: Record<string, DashNav> = {
  "pref:pre-chat": "client:page",
  "pref:intro": "client:chat",
  "pref:links": "client:chat",
  "pref:chat-interface": "client:chat",
  "account:brand": "client:page",
  "account:hours": "client:page",
  "account:shoutouts": "client:chat",
};

function isNavNested(node: DashNavNode): node is DashNavNested {
  return "items" in node && !("kind" in node);
}

function dashNavId(item: DashNavEntry): DashNav {
  if (item.kind === "pref") return `pref:${item.id}`;
  if (item.kind === "client") return `client:${item.id}`;
  if (item.kind === "site") return `site:${item.id}`;
  if (item.kind === "offerings") return "offerings";
  if (item.kind === "cases") return "cases";
  if (item.kind === "ai") return "ai";
  return `account:${item.id}`;
}

function isDashItemVisible(settings: FloorSettings, item: DashNavEntry) {
  if (
    item.kind === "site" ||
    item.kind === "offerings" ||
    item.kind === "cases" ||
    item.kind === "ai"
  ) {
    return true;
  }
  if (item.kind === "client") {
    return item.id === "chat" || isSolutionEnabled(settings, "preChat");
  }
  const required =
    item.kind === "pref"
      ? PREF_SECTION_SOLUTION[item.id]
      : ACCOUNT_TAB_SOLUTION[item.id];
  return !required || isSolutionEnabled(settings, required);
}

function visibleNavNodes(
  settings: FloorSettings,
  nodes: DashNavNode[],
): DashNavNode[] {
  return nodes.flatMap((node): DashNavNode[] => {
    if (!isNavNested(node)) {
      return isDashItemVisible(settings, node) ? [node] : [];
    }
    const items = node.items.filter((item) => isDashItemVisible(settings, item));
    return items.length > 0 ? [{ ...node, items }] : [];
  });
}

function flattenNavEntries(nodes: DashNavNode[]): DashNavEntry[] {
  return nodes.flatMap((node) => (isNavNested(node) ? node.items : [node]));
}

function groupIdForNav(nav: DashNav): DashGroupId | null {
  if (nav === "home") return null;
  for (const group of DASH_NAV_GROUPS) {
    if (flattenNavEntries(group.items).some((item) => dashNavId(item) === nav)) {
      return group.id;
    }
  }
  return null;
}

function nestedIdForNav(nav: DashNav): string | null {
  if (nav === "home") return null;
  for (const group of DASH_NAV_GROUPS) {
    for (const node of group.items) {
      if (
        isNavNested(node) &&
        node.items.some((item) => dashNavId(item) === nav)
      ) {
        return node.id;
      }
    }
  }
  return null;
}

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
  const [loggingOut, setLoggingOut] = useState(false);
  const [nav, setNav] = useState<DashNav>("home");
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>({
    business: true,
    account: true,
    "client-experience": true,
    "site-install": true,
  });
  const opsInFlight = useRef(0);
  const offeringsTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const offeringsLatest = useRef<Offering[] | null>(null);
  const knowledgeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const knowledgeLatest = useRef<KnowledgeNote[] | null>(null);
  const openedFromQuery = useRef(false);
  const [popupClientId, setPopupClientId] = useState<string | null>(null);
  const [laterDraftIds, setLaterDraftIds] = useState<Set<string>>(() => new Set());
  const [sendingDraftId, setSendingDraftId] = useState<string | null>(null);

  useEffect(() => {
    if (openedFromQuery.current) return;
    const tab = settingsTabFromQuery(
      new URLSearchParams(window.location.search).get("settings"),
    );
    if (!tab) return;
    openedFromQuery.current = true;
    const next: DashNav = SETTINGS_QUERY_TO_NAV[tab] ?? `account:${tab}`;
    const section = SETTINGS_QUERY_TO_SECTION[tab];
    const group = groupIdForNav(next);
    const nested = nestedIdForNav(next);
    if (group || nested) {
      setOpenGroups((current) => ({
        ...current,
        ...(group ? { [group]: true } : {}),
        ...(nested ? { [nested]: true } : {}),
      }));
    }
    setNav(next);
    router.replace(
      section ? `/${slug}/dashboard#${section}` : `/${slug}/dashboard`,
      { scroll: false },
    );
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
          return {
            ...next,
            settings: current.settings,
            offerings: current.offerings,
            knowledgeNotes: current.knowledgeNotes,
          };
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

  function updateOfferings(offerings: Offering[]) {
    const prev = offeringsLatest.current ?? space?.offerings ?? [];
    const structural =
      prev.length !== offerings.length ||
      prev.some((item, i) => item.id !== offerings[i]?.id);
    offeringsLatest.current = offerings;
    setSpace((current) =>
      current ? { ...current, offerings } : current,
    );

    function persist() {
      offeringsTimer.current = null;
      void applySpaceOp(slug, {
        type: "setOfferings",
        offerings: offeringsLatest.current ?? [],
      })
        .catch((err) => console.warn("Update failed:", err))
        .finally(() => {
          opsInFlight.current = Math.max(0, opsInFlight.current - 1);
        });
    }

    if (offeringsTimer.current) {
      window.clearTimeout(offeringsTimer.current);
      offeringsTimer.current = null;
    } else {
      opsInFlight.current += 1;
    }

    if (structural) {
      persist();
      return;
    }
    offeringsTimer.current = setTimeout(persist, 280);
  }

  function updateKnowledgeNotes(knowledgeNotes: KnowledgeNote[]) {
    const prev = knowledgeLatest.current ?? space?.knowledgeNotes ?? [];
    const structural =
      prev.length !== knowledgeNotes.length ||
      prev.some((item, i) => item.id !== knowledgeNotes[i]?.id);
    knowledgeLatest.current = knowledgeNotes;
    setSpace((current) =>
      current ? { ...current, knowledgeNotes } : current,
    );

    function persist() {
      knowledgeTimer.current = null;
      void applySpaceOp(slug, {
        type: "setKnowledgeNotes",
        knowledgeNotes: knowledgeLatest.current ?? [],
      })
        .catch((err) => console.warn("Update failed:", err))
        .finally(() => {
          opsInFlight.current = Math.max(0, opsInFlight.current - 1);
        });
    }

    if (knowledgeTimer.current) {
      window.clearTimeout(knowledgeTimer.current);
      knowledgeTimer.current = null;
    } else {
      opsInFlight.current += 1;
    }

    if (structural) {
      persist();
      return;
    }
    knowledgeTimer.current = setTimeout(persist, 280);
  }

  function updateMembers(nextMembers: FloorMember[]) {
    runOp({ type: "updateMembers", members: nextMembers });
  }

  function createCase(customerCase: CustomerCase) {
    runOp({ type: "createCase", customerCase });
  }

  function updateCaseStatus(caseId: string, status: CustomerCaseStatus) {
    runOp({ type: "updateCaseStatus", caseId, status });
  }

  function updateCaseNotes(caseId: string, notes: string) {
    runOp({ type: "updateCaseNotes", caseId, notes });
  }

  function updateCaseIdentifiers(
    caseId: string,
    identifiers: CustomerCaseIdentifier[],
  ) {
    runOp({ type: "updateCaseIdentifiers", caseId, identifiers });
  }

  function assignChatCase(clientId: string, caseId: string | null) {
    runOp({ type: "assignChatCase", clientId, caseId });
  }

  function hideCaseChat(clientId: string, hidden: boolean) {
    runOp({ type: "hideClient", clientId, hidden });
  }

  function toggleLive() {
    if (!space) return;
    runOp({
      type: "setSettings",
      settings: { ...space.settings, live: !space.settings.live },
    });
  }

  function toggleAutoAnswer(on: boolean) {
    if (!space) return;
    runOp({
      type: "setSettings",
      settings: { ...space.settings, autoAnswer: on },
    });
  }

  function speakerStamp(client: Client): Pick<Message, "fromMemberId" | "fromName"> {
    const activeFloor =
      floorMemberId !== "all"
        ? members.find((m) => m.id === floorMemberId)
        : undefined;
    const owner =
      activeFloor ||
      (client.ownerMemberId &&
        members.find((m) => m.id === client.ownerMemberId)) ||
      (members.length === 1 ? members[0] : undefined);
    if (!owner) return {};
    return { fromMemberId: owner.id, fromName: owner.name };
  }

  function nextReadyPopupId(
    list: Client[],
    exceptClientId?: string,
    exceptDraftIds?: Set<string>,
  ) {
    const skipped = exceptDraftIds ?? laterDraftIds;
    const next = list.find((c) => {
      const draft = c.autoAnswerDraft;
      if (!draft || draft.status !== "ready") return false;
      if (c.id === exceptClientId) return false;
      if (skipped.has(draft.id)) return false;
      return true;
    });
    return next?.id ?? null;
  }

  function skipAutoAnswer(clientId: string) {
    const client = space?.clients.find((c) => c.id === clientId);
    const draftId = client?.autoAnswerDraft?.id;
    runOp({ type: "setAutoAnswerDraft", clientId, draft: null });
    setPopupClientId((current) =>
      current === clientId
        ? nextReadyPopupId(clients, clientId, draftId
            ? new Set([...laterDraftIds, draftId])
            : laterDraftIds)
        : current,
    );
  }

  function laterAutoAnswer(clientId: string, draftId: string) {
    setLaterDraftIds((current) => new Set(current).add(draftId));
    setPopupClientId(nextReadyPopupId(clients, clientId, new Set([...laterDraftIds, draftId])));
  }

  function retryAutoAnswer(clientId: string) {
    runOp({ type: "retryAutoAnswer", clientId });
  }

  function pauseAutoAnswer(clientId: string, off: boolean) {
    runOp({ type: "setAutoAnswerOff", clientId, off });
  }

  function sendAutoAnswer(client: Client, body: string) {
    if (!space || sendingDraftId) return;
    const text = body.trim();
    if (!text) return;
    const message: Message = {
      id: `m-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      clientId: client.id,
      from: "business",
      kind: "text",
      body: text,
      ...messageTimeStamp(),
      ...speakerStamp(client),
    };
    const nextClient = withoutAutoAnswerDraft({
      ...client,
      preview: text,
      lastActive: "Just now",
      unread: 0,
      ownerMemberId:
        floorMemberId !== "all" ? floorMemberId : client.ownerMemberId,
    });
    setSpace((current) =>
      current
        ? {
            ...current,
            clients: current.clients.map((c) =>
              c.id === client.id ? nextClient : c,
            ),
          }
        : current,
    );
    setSendingDraftId(client.id);
    setPopupClientId(nextReadyPopupId(clients, client.id));
    void appendMessage(slug, {
      message,
      client: nextClient,
      upsertClient: true,
      bumpClient: true,
    })
      .catch((err) => console.warn("Auto-answer send failed:", err))
      .finally(() => setSendingDraftId(null));
  }

  function copyClientUrl() {
    if (!clientUrl) return;
    void navigator.clipboard.writeText(clientUrl).then(() => {
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    }).catch(() => {});
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

  useEffect(() => {
    if (!space) return;
    const remapped = LEGACY_NAV[nav];
    if (remapped) {
      setNav(remapped);
      return;
    }
    if (nav === "client:page" && !isSolutionEnabled(space.settings, "preChat")) {
      setNav("client:chat");
      return;
    }
    if (nav.startsWith("pref:")) {
      const section = nav.slice(5);
      if (!visiblePrefSections(space.settings).some((item) => item.id === section)) {
        setNav("home");
      }
      return;
    }
    if (nav.startsWith("account:")) {
      const tab = nav.slice(8);
      if (
        !visibleAccountSettingsTabs(space.settings).some((item) => item.id === tab)
      ) {
        setNav("account:setup");
      }
    }
  }, [space, nav]);

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

  const autoAnswerQueue = useMemo(
    () =>
      clients.filter(
        (c) => Boolean(c.autoAnswerDraft) && !c.chatEndedAt,
      ),
    [clients],
  );

  useEffect(() => {
    if (popupClientId) {
      const open = clients.find((c) => c.id === popupClientId);
      if (!open?.autoAnswerDraft || open.chatEndedAt) {
        setPopupClientId(nextReadyPopupId(clients, popupClientId));
      }
      return;
    }
    const next = clients.find((c) => {
      const draft = c.autoAnswerDraft;
      return (
        draft?.status === "ready" &&
        !c.chatEndedAt &&
        !laterDraftIds.has(draft.id)
      );
    });
    if (next) setPopupClientId(next.id);
  }, [clients, popupClientId, laterDraftIds]);

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

  const publicPageOn = isSolutionEnabled(space.settings, "preChat");

  function leafIncomplete(item: DashNavEntry) {
    const brandAlert =
      item.kind === "client" &&
      brandIncomplete &&
      ((item.id === "page" && publicPageOn) ||
        (item.id === "chat" && !publicPageOn));
    return (
      brandAlert ||
      (item.kind === "account" && item.id === "brand" && brandIncomplete) ||
      (item.kind === "account" && item.id === "team" && teamIncomplete)
    );
  }

  function renderNavLeaf(item: DashNavEntry, nested = false) {
    const id = dashNavId(item);
    const incomplete = leafIncomplete(item);
    return (
      <button
        key={id}
        type="button"
        className={`dashboard-nav-item is-child${nested ? " is-nested-child" : ""} ${nav === id ? "is-active" : ""}`}
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
  }

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

      <section className="dashboard-card">
        <header className="dashboard-card-head">
          <h2>AI auto-answer</h2>
          <p>
            When a customer messages, AI drafts a reply for that chat only. You
            approve or edit it — nothing sends until you do.
          </p>
        </header>
        <AutoAnswerToggle
          on={Boolean(space.settings.autoAnswer)}
          onToggle={toggleAutoAnswer}
        />
      </section>

      <section className="dashboard-card dashboard-share-card">
        <header className="dashboard-card-head">
          <h2>Share your link</h2>
          <p>Customers scan this QR code or copy the URL to open your page.</p>
        </header>
        {clientUrl ? (
          <ShareQrCard
            url={clientUrl}
            businessName={space.business.name}
            copied={copied}
            onCopyLink={copyClientUrl}
          />
        ) : (
          <p className="dashboard-empty">Preparing your link…</p>
        )}
      </section>

      <div className="dashboard-grid">
        <section className="dashboard-card">
          <header className="dashboard-card-head">
            <h2>Team load</h2>
            <p>Open chats by employee</p>
          </header>
          {members.length === 0 ? (
            <p className="dashboard-empty">
              Add team members under Business settings → Team.
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

      <section className="dashboard-card is-auto-answer">
        <header className="dashboard-card-head">
          <h2>Waiting on an AI draft</h2>
          <p>Chats the AI is writing for, or that need your OK</p>
        </header>
        {autoAnswerQueue.length === 0 ? (
          <p className="dashboard-empty">
            {space.settings.autoAnswer
              ? "No drafts right now. New customer messages will show up here."
              : "Turn on AI auto-answer to draft replies for incoming chats."}
          </p>
        ) : (
          <ul className="auto-answer-list">
            {autoAnswerQueue.map((client) => {
              const draft = client.autoAnswerDraft;
              if (!draft) return null;
              return (
                <li key={client.id}>
                  <button
                    type="button"
                    className="auto-answer-list-open"
                    onClick={() => setPopupClientId(client.id)}
                  >
                    <div className="auto-answer-list-main">
                      <strong>{client.name}</strong>
                      <span>{autoAnswerListLabel(draft)}</span>
                    </div>
                    <div className="dashboard-recent-meta">
                      <span>
                        {draft.status === "working"
                          ? "Writing"
                          : draft.status === "failed"
                            ? "Needs retry"
                            : "Review"}
                      </span>
                      <span>This chat only</span>
                    </div>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );

  let main: ReactNode = overview;
  if (nav === "client:page" || nav === "client:chat") {
    main = (
      <ClientFacingPanel
        slug={slug}
        surface={nav === "client:page" ? "page" : "chat"}
        space={space}
        settings={settingsPayload}
        members={members}
        artifacts={space.artifacts ?? []}
        onChangeSettings={updateSettings}
        onChangeMembers={updateMembers}
      />
    );
  } else if (nav === "offerings") {
    main = (
      <OfferingsPanel
        slug={slug}
        offerings={space.offerings ?? []}
        onChangeOfferings={updateOfferings}
      />
    );
  } else if (nav === "cases") {
    main = (
      <CasesPanel
        slug={slug}
        cases={space.cases ?? []}
        clients={space.clients ?? []}
        onCreateCase={createCase}
        onUpdateStatus={updateCaseStatus}
        onUpdateNotes={updateCaseNotes}
        onUpdateIdentifiers={updateCaseIdentifiers}
        onAssignChat={assignChatCase}
        onHideChat={hideCaseChat}
      />
    );
  } else if (nav === "ai") {
    main = (
      <AiSetupPanel
        notes={space.knowledgeNotes ?? []}
        onChangeNotes={updateKnowledgeNotes}
        autoAnswer={Boolean(space.settings.autoAnswer)}
        onToggleAutoAnswer={toggleAutoAnswer}
      />
    );
  } else if (nav === "site:contact" || nav === "site:bubble") {
    main = (
      <WebsiteInstallPanel
        slug={slug}
        kind={nav === "site:contact" ? "contact" : "bubble"}
        publicPageOn={isSolutionEnabled(space.settings, "preChat")}
      />
    );
  } else if (nav.startsWith("pref:")) {
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

  const popupClient = popupClientId
    ? clients.find((c) => c.id === popupClientId)
    : undefined;
  const popupDraft = popupClient?.autoAnswerDraft;
  const readyDrafts = autoAnswerQueue.filter(
    (c) => c.autoAnswerDraft?.status === "ready",
  );
  const popupReadyIndex = popupClient
    ? readyDrafts.findIndex((c) => c.id === popupClient.id) + 1
    : 0;

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
          <button
            type="button"
            className={`dashboard-nav-item ${nav === "cases" ? "is-active" : ""}`}
            onClick={() => setNav("cases")}
          >
            Cases
          </button>

          {DASH_NAV_GROUPS.map((group) => {
            const items = visibleNavNodes(settingsPayload, group.items);
            if (items.length === 0) return null;
            const open = openGroups[group.id];
            const groupIncomplete = flattenNavEntries(items).some(leafIncomplete);
            return (
              <div key={group.id} className="dashboard-nav-group">
                <button
                  type="button"
                  className="dashboard-nav-group-toggle"
                  aria-expanded={open}
                  onClick={() =>
                    setOpenGroups((current) => ({
                      ...current,
                      [group.id]: !current[group.id],
                    }))
                  }
                >
                  <span className="dashboard-nav-group-label">
                    {group.label}
                    {groupIncomplete ? (
                      <span className="settings-tab-alert" aria-hidden>
                        !
                      </span>
                    ) : null}
                  </span>
                  <IconChevronDown
                    size={16}
                    className={open ? "is-open" : undefined}
                  />
                </button>
                {open ? (
                  <div className="dashboard-nav-children">
                    {items.map((node) => {
                      if (!isNavNested(node)) return renderNavLeaf(node);
                      const nestedOpen = openGroups[node.id] !== false;
                      const nestedIncomplete = node.items.some(leafIncomplete);
                      return (
                        <div
                          key={node.id}
                          className="dashboard-nav-nested"
                        >
                          <button
                            type="button"
                            className="dashboard-nav-group-toggle is-nested"
                            aria-expanded={nestedOpen}
                            onClick={() =>
                              setOpenGroups((current) => ({
                                ...current,
                                [node.id]: !nestedOpen,
                              }))
                            }
                          >
                            <span className="dashboard-nav-group-label">
                              {node.label}
                              {nestedIncomplete ? (
                                <span
                                  className="settings-tab-alert"
                                  aria-hidden
                                >
                                  !
                                </span>
                              ) : null}
                            </span>
                            <IconChevronDown
                              size={16}
                              className={nestedOpen ? "is-open" : undefined}
                            />
                          </button>
                          {nestedOpen
                            ? node.items.map((item) =>
                                renderNavLeaf(item, true),
                              )
                            : null}
                        </div>
                      );
                    })}
                  </div>
                ) : null}
              </div>
            );
          })}
        </nav>

        <div className="dashboard-main">{main}</div>
      </div>

      <CornerTools />

      {popupClient && popupDraft ? (
        <div
          className="auto-answer-overlay"
          role="dialog"
          aria-modal="true"
          aria-label={`AI draft for ${popupClient.name}`}
        >
          <div className="auto-answer-overlay-card">
            <AutoAnswerReview
              client={popupClient}
              draft={popupDraft}
              variant="modal"
              sending={sendingDraftId === popupClient.id}
              queueLabel={
                readyDrafts.length > 1 && popupReadyIndex > 0
                  ? `${popupReadyIndex} of ${readyDrafts.length}`
                  : undefined
              }
              onSend={(body) => sendAutoAnswer(popupClient, body)}
              onLater={() => laterAutoAnswer(popupClient.id, popupDraft.id)}
              onSkip={() => skipAutoAnswer(popupClient.id)}
              onRetry={
                popupDraft.status === "failed"
                  ? () => retryAutoAnswer(popupClient.id)
                  : undefined
              }
              onTogglePause={(off) => pauseAutoAnswer(popupClient.id, off)}
            />
          </div>
        </div>
      ) : null}
    </div>
  );
}
