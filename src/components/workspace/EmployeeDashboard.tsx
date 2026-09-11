"use client";

import { GrowthToolsPanel } from "./GrowthToolsPanel";
import { StoryTemplatePanel } from "./StoryTemplatePanel";
import { StoryCasesPanel } from "./StoryCasesPanel";
import { normalizeStoryTemplate } from "@/lib/storytelling";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
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
  ScheduleRequestStatus,
  FormSubmissionStatus,
  FeedbackPost,
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
import { messageTimeStamp } from "@/lib/spaceNormalize";
import { autoAnswerListLabel, withoutAutoAnswerDraft } from "@/lib/autoAnswer";
import { ScheduleSettingsPanel } from "./ScheduleSettingsPanel";
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
import { QuickBuildsPanel } from "./QuickBuildsPanel";
import { InsightsPanel } from "./InsightsPanel";
import { CasesPanel } from "./CasesPanel";
import { EmployeesPanel } from "./EmployeesPanel";
import { SchedulePanel } from "./SchedulePanel";
import { FormsPanel } from "./FormsPanel";
import { FeedbackBoardPanel } from "./FeedbackBoardPanel";
import { FormsManagerPanel } from "./FormsManagerPanel";
import { ComponentsDashboard } from "./ComponentsDashboard";
import { AutoAnswerReview, AutoAnswerToggle } from "./AutoAnswerReview";
import { WorkspaceSidebar } from "./WorkspaceSidebar";
import { WorkspaceShell } from "./WorkspaceShell";
import { isSolutionEnabled } from "@/lib/setupSolutions";
import {
  HASH_TO_NAV,
  LEGACY_NAV,
  ACCOUNT_SETTINGS_NAV_TABS,
  visibleToolsLeaves,
  visiblePresenceLeaves,
  SETTINGS_QUERY_TO_NAV,
  SETTINGS_QUERY_TO_SECTION,
  WIDGET_BUILD_CHAT_HASHES,
  LIVE_CHAT_SETTINGS_HASHES,
  canonicalNav,
  dashHref,
  isAccountSettingsNav,
  isPublicSettingsNav,
  isNavEnabled,
  navFromPathname,
  presenceHomeNav,
  workspaceHomeNav,
  type DashNav,
} from "@/lib/workspaceNav";
import { SettingsArea } from "./SettingsArea";

interface EmployeeDashboardProps {
  slug: string;
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
  const pathname = usePathname();
  const [space, setSpace] = useState<BusinessSpace | null>(null);
  const [floorMemberId, setFloorMemberId] = useState("all");
  const [copied, setCopied] = useState(false);
  const [clientUrl, setClientUrl] = useState("");
  const [loggingOut, setLoggingOut] = useState(false);
  const [nav, setNav] = useState<DashNav>(() => navFromPathname(pathname, slug));
  const opsInFlight = useRef(0);
  const offeringsTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const offeringsLatest = useRef<Offering[] | null>(null);
  const knowledgeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const knowledgeLatest = useRef<KnowledgeNote[] | null>(null);
  const openedFromQuery = useRef(false);
  const [popupClientId, setPopupClientId] = useState<string | null>(null);
  const [laterDraftIds, setLaterDraftIds] = useState<Set<string>>(() => new Set());
  const [sendingDraftId, setSendingDraftId] = useState<string | null>(null);
  const [employeesOpen, setEmployeesOpen] = useState(false);

  useEffect(() => {
    if (openedFromQuery.current) return;
    const tab = settingsTabFromQuery(
      new URLSearchParams(window.location.search).get("settings"),
    );
    if (!tab) return;
    openedFromQuery.current = true;
    const next: DashNav = SETTINGS_QUERY_TO_NAV[tab] ?? `account:${tab}`;
    const hashSection = SETTINGS_QUERY_TO_SECTION[tab];
    setNav(next);
    router.replace(dashHref(slug, next, hashSection), { scroll: false });
  }, [slug, router]);

  useEffect(() => {
    document.documentElement.classList.add("floor-lock");
    return () => document.documentElement.classList.remove("floor-lock");
  }, []);

  useEffect(() => {
    const next = navFromPathname(pathname, slug);
    setNav((current) => (current === next ? current : next));
    setEmployeesOpen(false);
  }, [pathname, slug]);

  useEffect(() => {
    const hash = window.location.hash.replace(/^#/, "");
    const mapped = HASH_TO_NAV[hash];
    if (!mapped) return;
    if (
      pathname === `/${slug}/live-chat` ||
      pathname === `/${slug}/live-chat/` ||
      pathname === `/${slug}/floor` ||
      pathname === `/${slug}/floor/` ||
      pathname === `/${slug}/dashboard` ||
      pathname === `/${slug}/dashboard/`
    ) {
      router.replace(dashHref(slug, mapped, hash), { scroll: false });
    }
  }, [pathname, slug, router]);

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

  function updateScheduleStatus(id: string, status: ScheduleRequestStatus) {
    runOp({ type: "updateScheduleStatus", id, status });
  }

  function updateFormStatus(id: string, status: FormSubmissionStatus) {
    runOp({ type: "updateFormStatus", id, status });
  }

  function feedbackAuthor() {
    const member =
      floorMemberId !== "all" ? members.find((item) => item.id === floorMemberId) : members[0];
    return {
      authorId: member?.id ?? "team",
      authorName: member?.name?.trim() || "Team",
    };
  }

  function createFeedbackPost(post: FeedbackPost) {
    runOp({ type: "createFeedbackPost", post });
  }

  function addFeedbackComment(postId: string, body: string) {
    const author = feedbackAuthor();
    runOp({
      type: "addFeedbackComment",
      postId,
      comment: {
        id: `fbc-${crypto.randomUUID()}`,
        authorId: author.authorId,
        authorName: author.authorName,
        body,
        createdAt: new Date().toISOString(),
      },
    });
  }

  function toggleFeedbackVote(postId: string) {
    runOp({ type: "toggleFeedbackVote", postId, voterId: feedbackAuthor().authorId });
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
        ? nextReadyPopupId(space?.clients ?? [], clientId, draftId
            ? new Set([...laterDraftIds, draftId])
            : laterDraftIds)
        : current,
    );
  }

  function laterAutoAnswer(clientId: string, draftId: string) {
    setLaterDraftIds((current) => new Set(current).add(draftId));
    setPopupClientId(nextReadyPopupId(space?.clients ?? [], clientId, new Set([...laterDraftIds, draftId])));
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
    setPopupClientId(nextReadyPopupId(space?.clients ?? [], client.id));
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
      const currentHash = window.location.hash.replace(/^#/, "");
      const hash =
        currentHash ||
        (nav === "site:bubble"
          ? "cf-bubble"
          : nav === "pref:sounds"
            ? "cf-sounds"
            : "");
      router.replace(dashHref(slug, remapped, hash), { scroll: false });
      return;
    }
    if (nav === "widget-builds") {
      const chatHash = window.location.hash.replace(/^#/, "");
      if (
        WIDGET_BUILD_CHAT_HASHES.has(chatHash) &&
        isNavEnabled(space.settings, "client:chat")
      ) {
        router.replace(
          dashHref(
            slug,
            "client:chat",
            chatHash === "chat" ? "" : chatHash,
          ),
          { scroll: false },
        );
        return;
      }
      if (
        LIVE_CHAT_SETTINGS_HASHES.has(chatHash) &&
        isNavEnabled(space.settings, "tools:live-chat")
      ) {
        router.replace(
          dashHref(slug, "tools:live-chat", chatHash),
          { scroll: false },
        );
        return;
      }
    }
    if (!isNavEnabled(space.settings, nav)) {
      router.replace(
        dashHref(
          slug,
          isPublicSettingsNav(nav)
            ? presenceHomeNav(space.settings)
            : "dashboard",
        ),
        { scroll: false },
      );
      return;
    }
    if (nav.startsWith("pref:")) {
      const sectionId = nav.slice(5);
      if (
        !visiblePrefSections(space.settings).some((item) => item.id === sectionId)
      ) {
        router.replace(
          dashHref(slug, workspaceHomeNav(space.settings)),
          { scroll: false },
        );
      }
      return;
    }
    if (nav.startsWith("account:")) {
      const tab = nav.slice(8);
      if (
        !visibleAccountSettingsTabs(space.settings).some((item) => item.id === tab)
      ) {
        router.replace(dashHref(slug, "account:setup"), { scroll: false });
      }
    }
  }, [space, nav, slug, router]);

  const allChats = clients;
  const readChats = clients.filter((c) => (c.unread || 0) === 0);
  const unreadChats = clients.filter((c) => (c.unread || 0) > 0);

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
      (space?.clients ?? []).filter(
        (c) => Boolean(c.autoAnswerDraft) && !c.chatEndedAt,
      ),
    [space?.clients],
  );

  useEffect(() => {
    const draftClients = space?.clients ?? [];
    if (popupClientId) {
      const open = draftClients.find((c) => c.id === popupClientId);
      if (!open?.autoAnswerDraft || open.chatEndedAt) {
        setPopupClientId(nextReadyPopupId(draftClients, popupClientId));
      }
      return;
    }
    const next = draftClients.find((c) => {
      const draft = c.autoAnswerDraft;
      return (
        draft?.status === "ready" &&
        !c.chatEndedAt &&
        !laterDraftIds.has(draft.id)
      );
    });
    if (next) setPopupClientId(next.id);
  }, [space?.clients, popupClientId, laterDraftIds]);

  if (!space) {
    return (
      <div className="client-chat-loading">
        {nav === "floor" ? "Loading live chat…" : "Loading dashboard…"}
      </div>
    );
  }

  if (nav === "floor") {
    return <WorkspaceShell slug={slug} initialSpace={space} />;
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

  const overview = (
    <div className="dashboard-overview">
      <header className="dashboard-hero">
        <div>
          <p className="dashboard-kicker">Dashboard</p>
          <h1>{space.business.name}</h1>
          <p className="dashboard-lede">
            Share your link, see who’s covering chats, and jump to live chat
            from the sidebar when a customer writes in.
          </p>
        </div>
        <div className="dashboard-hero-actions">
          <Link href={dashHref(slug, "floor")} className="btn-solid dashboard-open-floor">
            Open Live Chat
          </Link>
          <button
            type="button"
            className="btn-ghost dashboard-manage-employees"
            onClick={() => setEmployeesOpen(true)}
          >
            Manage Employees
          </button>
        </div>
      </header>

      <section className="dashboard-stats" aria-label="Overview">
        <div className="dashboard-stat is-open-chats">
          <span className="dashboard-stat-label">All</span>
          <strong>{allChats.length}</strong>
        </div>
        <div className="dashboard-stat is-unread">
          <span className="dashboard-stat-label">Read</span>
          <strong>{readChats.length}</strong>
        </div>
        <div className="dashboard-stat is-customers-online">
          <span className="dashboard-stat-label">Unread</span>
          <strong>{unreadChats.length}</strong>
        </div>
        <div className="dashboard-stat is-status">
          <span className="dashboard-stat-label">Status</span>
          <strong className={space.settings.live ? "is-live" : ""}>
            {space.settings.live ? "Live" : "Away"}
          </strong>
        </div>
      </section>

      <div className="dashboard-grid">
        <section className="dashboard-card is-recent-chats">
          <header className="dashboard-card-head">
            <h2>Inbox</h2>
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
                    <Link href={dashHref(slug, "floor")}>
                      <div className="dashboard-recent-main">
                        <strong>{client.name}</strong>
                        <span className="dashboard-recent-preview">
                          {(client.unread ?? 0) > 0 ? (
                            <span
                              className="dashboard-recent-unread"
                              aria-label="Unread messages"
                            />
                          ) : null}
                          {client.preview || "No messages yet"}
                        </span>
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

        <section className="dashboard-card is-team-load">
          <header className="dashboard-card-head">
            <h2>Quick Access</h2>
          </header>
          <div className="dashboard-team-stack">
            <div className="dashboard-team-inner dashboard-quick-access">
              <Link
                href={dashHref(slug, "floor")}
                className="btn-solid dashboard-open-floor"
              >
                Open Live Chat
              </Link>
              <button
                type="button"
                className="btn-ghost dashboard-manage-employees"
                onClick={() => setEmployeesOpen(true)}
              >
                Manage Employees
              </button>
              <AutoAnswerToggle
                on={Boolean(space.settings.autoAnswer)}
                onToggle={toggleAutoAnswer}
              />
            </div>
          </div>
        </section>
      </div>

      <div className="dashboard-more">
        <section className="dashboard-card is-auto-answer">
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
          <div className="dashboard-team-inner dashboard-auto-answer-inner">
            <p className="dashboard-auto-answer-waiting-label">
              Waiting on an AI draft
            </p>
            {autoAnswerQueue.length === 0 ? (
              <p className="dashboard-empty">
                {space.settings.autoAnswer
                  ? "No drafts right now. New customer messages will show up here."
                  : "Turn on AI Auto-Answer to draft replies for incoming chats."}
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
          </div>
        </section>

        <section className="dashboard-card dashboard-share-card">
          <header className="dashboard-card-head">
            <h2>Share your link</h2>
            <p>Customers scan this QR code or copy the URL to open your micro-landing page.</p>
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
      </div>
    </div>
  );

  let main: ReactNode = overview;
  if (employeesOpen) {
    main = (
      <EmployeesPanel members={members} onChangeMembers={updateMembers} />
    );
  } else if (nav === "dashboard" || nav === "online") {
    main = (
      <ComponentsDashboard
        slug={slug}
        settings={settingsPayload}
        onChangeSettings={updateSettings}
      />
    );
  } else if (nav === "client:page") {
    main = (
      <ClientFacingPanel
        slug={slug}
        surface="page"
        space={space}
        settings={settingsPayload}
        members={members}
        artifacts={space.artifacts ?? []}
        hideTitle
        onChangeSettings={updateSettings}
        onChangeMembers={updateMembers}
      />
    );
  } else if (nav === "client:chat") {
    main = (
      <ClientFacingPanel
        slug={slug}
        surface="widget"
        space={space}
        settings={settingsPayload}
        members={members}
        artifacts={space.artifacts ?? []}
        hideTitle
        onChangeSettings={updateSettings}
        onChangeMembers={updateMembers}
      />
    );
  } else if (nav === "tools:live-chat") {
    main = (
      <ClientFacingPanel
        slug={slug}
        surface="chat"
        space={space}
        settings={settingsPayload}
        members={members}
        artifacts={space.artifacts ?? []}
        hideTitle
        onChangeSettings={updateSettings}
        onChangeMembers={updateMembers}
      />
    );
  } else if (nav === "tools:referrals" || nav === "tools:affiliates") {
    main = <GrowthToolsPanel key={nav} slug={slug} kind={nav === "tools:referrals" ? "referral" : "affiliate"} mode="setup" />;
  } else if (nav === "tools:storytelling") {
    main = (
      <StoryTemplatePanel
        settings={settingsPayload}
        onChangeSettings={updateSettings}
      />
    );
  } else if (nav === "tools:schedule") {
    main = <ScheduleSettingsPanel slug={slug} settings={settingsPayload} onChangeSettings={updateSettings} />;
  } else if (nav === "tools:forms") {
    main = (
      <FormsManagerPanel
        slug={slug}
        settings={settingsPayload}
        onChangeSettings={updateSettings}
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
  } else if (nav === "cases" || nav === "cases:contacts") {
    main = (
      <CasesPanel
        slug={slug}
        cases={space.cases ?? []}
        clients={space.clients ?? []}
        contacts={space.collectedContacts ?? []}
        section={nav === "cases:contacts" ? "contacts" : "cases"}
        onCreateCase={createCase}
        onUpdateStatus={updateCaseStatus}
        onUpdateNotes={updateCaseNotes}
        onUpdateIdentifiers={updateCaseIdentifiers}
        onAssignChat={assignChatCase}
        onHideChat={hideCaseChat}
      />
    );
  } else if (nav === "schedule") {
    main = (
      <SchedulePanel
        slug={slug}
        requests={space.scheduleRequests ?? []}
        onUpdateStatus={updateScheduleStatus}
      />
    );
  } else if (nav === "forms") {
    main = (
      <FormsPanel
        submissions={space.formSubmissions ?? []}
        onUpdateStatus={updateFormStatus}
      />
    );
  } else if (nav === "feedback") {
    const author = feedbackAuthor();
    main = (
      <FeedbackBoardPanel
        posts={space.feedbackBoard ?? []}
        authorId={author.authorId}
        authorName={author.authorName}
        onCreate={createFeedbackPost}
        onComment={addFeedbackComment}
        onVote={toggleFeedbackVote}
      />
    );
  } else if (nav === "referrals") {
    main = <GrowthToolsPanel slug={slug} kind="referral" mode="data" />;
  } else if (nav === "affiliates") {
    main = <GrowthToolsPanel slug={slug} kind="affiliate" mode="data" />;
  } else if (nav === "storytelling") {
    main = (
      <StoryCasesPanel
        slug={slug}
        template={normalizeStoryTemplate(space.settings.storyTemplate)}
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
  } else if (nav === "widget-builds") {
    main = (
      <QuickBuildsPanel
        slug={slug}
        hideTitle
        settings={settingsPayload}
        onChangeSettings={updateSettings}
      />
    );
  } else if (nav === "insights") {
    main = <InsightsPanel slug={slug} />;
  } else if (nav === "site:contact") {
    main = (
      <WebsiteInstallPanel
        slug={slug}
        kind="contact"
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
        hideTitle
        variant="page"
        section={section}
      />
    );
  } else if (nav.startsWith("account:")) {
    const tab = nav.slice(8) as SettingsTab;
    main = (
      <FloorSettingsPanel
        slug={slug}
        settings={settingsPayload}
        members={members}
        artifacts={space.artifacts ?? []}
        hideTitle
        variant="page"
        activeTab={tab}
        loggingOut={loggingOut}
        onChangeSettings={updateSettings}
        onChangeMembers={updateMembers}
        onLogOut={() => void logOut()}
      />
    );
  }

  if (nav.startsWith("tools:")) {
    main = (
      <SettingsArea
        slug={slug}
        title="Tools"
        variant="crumb"
        tabs={visibleToolsLeaves(space.settings)}
        active={canonicalNav(nav)}
      >
        {main}
      </SettingsArea>
    );
  } else if (isPublicSettingsNav(nav)) {
    main = (
      <SettingsArea
        slug={slug}
        title="Get In Touch"
        variant="crumb"
        tabs={visiblePresenceLeaves(space.settings)}
        active={canonicalNav(nav)}
      >
        {main}
      </SettingsArea>
    );
  } else if (isAccountSettingsNav(nav)) {
    main = (
      <SettingsArea
        slug={slug}
        title="Account"
        help="Billing, email alerts, and your account."
        tabs={ACCOUNT_SETTINGS_NAV_TABS}
        active={canonicalNav(nav)}
      >
        {main}
      </SettingsArea>
    );
  }

  const popupClient = popupClientId
    ? space.clients.find((c) => c.id === popupClientId)
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
        brandNav={workspaceHomeNav(space.settings)}
      />

      <div className="dashboard-layout">
        <WorkspaceSidebar slug={slug} settings={space.settings} />
        <div className="dashboard-main">{main}</div>
      </div>

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
