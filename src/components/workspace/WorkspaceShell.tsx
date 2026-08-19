"use client";

import Link from "next/link";
import { useEffect, useMemo, useState, useTransition } from "react";
import type {
  Artifact,
  BusinessSpace,
  Client,
  FloorMember,
  FloorSettings,
  LibraryCategory,
  Message,
} from "@/lib/types";
import { forgetChat } from "@/lib/chatMemory";
import { forgetThreadScroll, threadScrollKey } from "@/lib/threadScroll";
import {
  ensureSpace,
  messageTimeStamp,
  patchSpace,
  readMediaFile,
  subscribeSpace,
} from "@/lib/store";
import { ClientRail } from "./ClientRail";
import { ChatInterfaceSetupModal } from "./ChatInterfaceSetupModal";
import { FloorSettingsPanel } from "./FloorSettingsPanel";
import { PreChatSetupModal } from "./PreChatSetupModal";
import { ThreadPane } from "./ThreadPane";
import { RightPane } from "./RightPane";
import { FeedbackWidget } from "@/components/shared/FeedbackWidget";
import {
  IconCheck,
  IconEye,
  IconGear,
  IconLink,
} from "@/components/shared/Icons";
import { useRouter } from "next/navigation";

interface WorkspaceShellProps {
  slug: string;
}

export function WorkspaceShell({ slug }: WorkspaceShellProps) {
  const router = useRouter();
  const [space, setSpace] = useState<BusinessSpace | null>(null);
  const [activeId, setActiveId] = useState("");
  const [draft, setDraft] = useState("");
  const [query, setQuery] = useState("");
  const [libraryFilter, setLibraryFilter] = useState("all");
  const [sentFlash, setSentFlash] = useState<string | null>(null);
  const [pendingArtifacts, setPendingArtifacts] = useState<
    Record<string, Artifact>
  >({});
  const [scrollToBottomTick, setScrollToBottomTick] = useState(0);
  const [mobilePane, setMobilePane] = useState<"clients" | "thread" | "library">(
    "clients",
  );
  const [copied, setCopied] = useState(false);
  const [clientUrl, setClientUrl] = useState("");
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [chatInterfaceOpen, setChatInterfaceOpen] = useState(false);
  const [preChatOpen, setPreChatOpen] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);
  const [, startTransition] = useTransition();

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
    document.documentElement.classList.add("floor-lock");
    return () => document.documentElement.classList.remove("floor-lock");
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function boot() {
      const loaded = await ensureSpace(slug);
      if (cancelled) return;
      setSpace(loaded);
      const firstVisible = loaded.clients.find((c) =>
        loaded.messages.some(
          (m) => m.clientId === c.id && m.from === "client",
        ),
      );
      if (firstVisible) setActiveId(firstVisible.id);
      setClientUrl(`${window.location.origin}/${slug}`);
    }

    void boot();

    const unsubscribe = subscribeSpace(slug, (next) => {
      if (!next) return;
      setSpace(next);

      // Keep current selection if that chat still has guest activity.
      setActiveId((current) => {
        const visible = next.clients.filter((c) =>
          next.messages.some(
            (m) => m.clientId === c.id && m.from === "client",
          ),
        );
        if (current && visible.some((c) => c.id === current)) {
          return current;
        }
        return visible[0]?.id ?? "";
      });
    });

    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, [slug]);

  const clients = space?.clients ?? [];
  const messages = space?.messages ?? [];
  const categories = space?.categories ?? [];
  const artifacts = space?.artifacts ?? [];
  const members = space?.members ?? [];

  /** Stamp replies with chat owner (or sole team member) for the customer chat. */
  function speakerStamp(
    client: Client,
    team: FloorMember[],
  ): Pick<Message, "fromMemberId" | "fromName"> {
    const owner =
      (client.ownerMemberId &&
        team.find((m) => m.id === client.ownerMemberId)) ||
      (team.length === 1 ? team[0] : undefined);
    if (!owner) return {};
    return { fromMemberId: owner.id, fromName: owner.name };
  }

  const filteredClients = useMemo(() => {
    // Only show chats where the guest actually sent something (not just opened).
    const withGuestActivity = clients.filter((c) =>
      messages.some((m) => m.clientId === c.id && m.from === "client"),
    );
    const q = query.trim().toLowerCase();
    if (!q) return withGuestActivity;
    return withGuestActivity.filter(
      (c) =>
        c.name.toLowerCase().includes(q) ||
        c.preview.toLowerCase().includes(q) ||
        c.trade.includes(q),
    );
  }, [clients, messages, query]);

  const active =
    filteredClients.find((c) => c.id === activeId) ?? filteredClients[0];

  useEffect(() => {
    if (active && active.id !== activeId) setActiveId(active.id);
    if (!active && activeId) setActiveId("");
  }, [active, activeId]);

  const thread = useMemo(
    () => messages.filter((m) => m.clientId === active?.id),
    [messages, active?.id],
  );

  async function applyPatch(updater: (space: BusinessSpace) => BusinessSpace) {
    const next = await patchSpace(slug, updater);
    setSpace(next);
    return next;
  }

  function selectClient(client: Client) {
    startTransition(() => {
      setActiveId(client.id);
      setMobilePane("thread");
    });
  }

  function renameClient(clientId: string, name: string) {
    void applyPatch((latest) => ({
      ...latest,
      clients: latest.clients.map((c) =>
        c.id === clientId ? { ...c, name } : c,
      ),
    }));
  }

  function changeClientOwner(
    clientId: string,
    ownerMemberId: string | undefined,
  ) {
    void applyPatch((latest) => ({
      ...latest,
      clients: latest.clients.map((c) =>
        c.id === clientId ? { ...c, ownerMemberId } : c,
      ),
    }));
  }

  function updateMembers(members: FloorMember[]) {
    void applyPatch((latest) => {
      const memberIds = new Set(members.map((m) => m.id));
      const soleOwnerId = members.length === 1 ? members[0]?.id : undefined;
      return {
        ...latest,
        members,
        clients: latest.clients.map((c) => ({
          ...c,
          ownerMemberId:
            c.ownerMemberId && memberIds.has(c.ownerMemberId)
              ? c.ownerMemberId
              : soleOwnerId,
        })),
      };
    });
  }

  function deleteClient(clientId: string) {
    forgetThreadScroll(threadScrollKey(slug, clientId));
    setPendingArtifacts((prev) => {
      const next = { ...prev };
      delete next[clientId];
      return next;
    });
    void applyPatch((latest) => ({
      ...latest,
      deletedClientIds: [
        ...new Set([...(latest.deletedClientIds ?? []), clientId]),
      ],
      clients: latest.clients.filter((c) => c.id !== clientId),
      messages: latest.messages.filter((m) => m.clientId !== clientId),
    })).then((next) => {
      forgetChat(slug, clientId);
      if (activeId === clientId) {
        setActiveId(next.clients[0]?.id ?? "");
      }
    });
  }

  function endChat() {
    if (!active || active.chatEndedAt) return;
    const clientId = active.id;
    const speaker = speakerStamp(active, members);
    const body =
      "Chat ended. If you'd like a recording of this conversation, enter your email and we'll send one.";
    void applyPatch((latest) => {
      const client = latest.clients.find((c) => c.id === clientId);
      if (!client || client.chatEndedAt) return latest;
      const nextMsg: Message = {
        id: `m-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        clientId,
        from: "business",
        kind: "text",
        body,
        ...messageTimeStamp(),
        ...speaker,
      };
      return {
        ...latest,
        clients: latest.clients.map((c) =>
          c.id === clientId
            ? {
                ...c,
                chatEndedAt: new Date().toISOString(),
                preview: "Chat ended",
                lastActive: "Just now",
                unread: 0,
              }
            : c,
        ),
        messages: [...latest.messages, nextMsg],
      };
    });
    setPendingArtifacts((prev) => {
      if (!(clientId in prev)) return prev;
      const next = { ...prev };
      delete next[clientId];
      return next;
    });
    setDraft("");
    bumpScrollToBottom();
  }

  function bumpScrollToBottom() {
    setScrollToBottomTick((n) => n + 1);
  }

  function sendText() {
    if (!active || active.chatEndedAt || !draft.trim()) return;
    const body = draft.trim();
    const clientId = active.id;
    const speaker = speakerStamp(active, members);
    void applyPatch((latest) => {
      const nextMsg: Message = {
        id: `m-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        clientId,
        from: "business",
        kind: "text",
        body,
        ...messageTimeStamp(),
        ...speaker,
      };
      return {
        ...latest,
        clients: latest.clients.map((c) =>
          c.id === clientId
            ? { ...c, preview: body, lastActive: "Just now", unread: 0 }
            : c,
        ),
        messages: [...latest.messages, nextMsg],
      };
    });
    setDraft("");
    bumpScrollToBottom();
  }

  async function sendImage(file: File) {
    if (!active || active.chatEndedAt) return;
    const clientId = active.id;
    const speaker = speakerStamp(active, members);
    const caption = draft.trim();
    const media = await readMediaFile(file);
    if (media.kind !== "photo") {
      throw new Error("Pick an image file.");
    }

    void applyPatch((latest) => {
      const nextMsg: Message = {
        id: `m-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        clientId,
        from: "business",
        kind: "image",
        body: caption,
        imageUrl: media.url,
        ...messageTimeStamp(),
        ...speaker,
      };
      return {
        ...latest,
        clients: latest.clients.map((c) =>
          c.id === clientId
            ? {
                ...c,
                preview: caption || "Photo",
                lastActive: "Just now",
                unread: 0,
              }
            : c,
        ),
        messages: [...latest.messages, nextMsg],
      };
    });
    setDraft("");
    bumpScrollToBottom();
  }

  function stageArtifact(item: Artifact) {
    if (!active) return;
    setPendingArtifacts((prev) => ({ ...prev, [active.id]: item }));
    setSentFlash(item.id);
    setMobilePane("thread");
    bumpScrollToBottom();
    window.setTimeout(() => setSentFlash(null), 900);
  }

  function dismissPendingArtifact() {
    if (!active) return;
    setPendingArtifacts((prev) => {
      const next = { ...prev };
      delete next[active.id];
      return next;
    });
  }

  function sendArtifact(item: Artifact) {
    if (!active) return;
    const clientId = active.id;
    const speaker = speakerStamp(active, members);

    void applyPatch((latest) => {
      let nextMsg: Message;
      if (item.kind === "video") {
        nextMsg = {
          id: `m-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
          clientId,
          from: "business",
          kind: "video",
          body: item.caption || item.title,
          videoUrl: item.url,
          artifactId: item.id,
          ...messageTimeStamp(),
          ...speaker,
        };
      } else if (item.kind === "photo") {
        nextMsg = {
          id: `m-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
          clientId,
          from: "business",
          kind: "image",
          body: item.caption || item.title,
          imageUrl: item.url,
          artifactId: item.id,
          ...messageTimeStamp(),
          ...speaker,
        };
      } else if (item.kind === "url") {
        nextMsg = {
          id: `m-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
          clientId,
          from: "business",
          kind: "link",
          body: item.title || item.url,
          linkUrl: item.url,
          artifactId: item.id,
          ...messageTimeStamp(),
          ...speaker,
        };
      } else {
        nextMsg = {
          id: `m-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
          clientId,
          from: "business",
          kind: "text",
          body: item.body || item.caption || item.title,
          artifactId: item.id,
          ...messageTimeStamp(),
          ...speaker,
        };
      }

      const preview =
        item.kind === "text"
          ? (item.body || item.title).slice(0, 80)
          : item.title;

      return {
        ...latest,
        clients: latest.clients.map((c) =>
          c.id === clientId
            ? { ...c, preview, lastActive: "Just now", unread: 0 }
            : c,
        ),
        messages: [...latest.messages, nextMsg],
        artifacts: latest.artifacts.map((a) =>
          a.id === item.id ? { ...a, uses: a.uses + 1 } : a,
        ),
      };
    });
  }

  function confirmPendingArtifact() {
    if (!active) return;
    const item = pendingArtifacts[active.id];
    if (!item) return;
    sendArtifact(item);
    dismissPendingArtifact();
    bumpScrollToBottom();
  }

  function updateLibrary(next: {
    categories: LibraryCategory[];
    artifacts: Artifact[];
  }) {
    void applyPatch((latest) => ({
      ...latest,
      categories: next.categories,
      artifacts: next.artifacts,
    }));
  }

  async function copyClientUrl() {
    await navigator.clipboard.writeText(clientUrl);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1600);
  }

  function updateSettings(settings: FloorSettings) {
    void applyPatch((latest) => ({ ...latest, settings }));
  }

  function toggleLive() {
    void applyPatch((latest) => ({
      ...latest,
      settings: { ...latest.settings, live: !latest.settings.live },
    }));
  }

  if (!space) {
    return <div className="client-chat-loading">Loading floor…</div>;
  }

  return (
    <div className="workspace">
      <header className="workspace-brand">
        <div className="brand-lockup">
          <span className="brand-mark" aria-hidden />
          <div>
            <p className="brand-name">OTGF</p>
            <p className="brand-sub">{space.business.name}</p>
          </div>
        </div>
        <div className="floor-share">
          <button
            type="button"
            className={`floor-live-btn ${space.settings.live ? "is-live" : ""}`}
            onClick={toggleLive}
            aria-pressed={space.settings.live}
          >
            <span className="floor-live-dot" aria-hidden />
            <span className="floor-live-label">
              {space.settings.live ? "Live" : "Away"}
            </span>
          </button>
          <button
            type="button"
            className="chat-interface-setup-btn"
            onClick={() => setChatInterfaceOpen(true)}
          >
            Set up chat interface
            {(space.settings.chatEndImages?.length ?? 0) > 0 ? (
              <span className="chat-interface-setup-count" aria-hidden>
                {space.settings.chatEndImages!.length}
              </span>
            ) : null}
          </button>
          <button
            type="button"
            className="chat-interface-setup-btn"
            onClick={() => setPreChatOpen(true)}
          >
            Edit pre-chat page
          </button>
          <button
            type="button"
            className="btn-ghost icon-btn floor-settings-btn"
            onClick={() => setSettingsOpen(true)}
            aria-label="Settings"
            title="Settings"
          >
            <IconGear />
            {!space.settings.brandBannerUrl ||
            !space.settings.logoUrl ||
            !(space.members ?? []).some((m) => m.name.trim()) ? (
              <span className="settings-tab-alert floor-settings-alert" aria-hidden>
                !
              </span>
            ) : null}
          </button>
          <button
            type="button"
            className="icon-btn"
            onClick={copyClientUrl}
            aria-label={copied ? "Copied" : "Copy link"}
            title={copied ? "Copied" : "Copy link"}
          >
            {copied ? <IconCheck /> : <IconLink />}
          </button>
          <Link
            href={`/${slug}`}
            className="floor-preview icon-btn"
            aria-label="Preview"
            title="Preview"
          >
            <IconEye />
          </Link>
          <button
            type="button"
            className="btn-ghost floor-logout-btn"
            onClick={() => void logOut()}
            disabled={loggingOut}
          >
            {loggingOut ? "…" : "Log out"}
          </button>
        </div>
      </header>

      <div className="workspace-grid">
        <aside
          className={`pane pane-clients ${mobilePane === "clients" ? "is-mobile-show" : ""}`}
        >
          <ClientRail
            clients={filteredClients}
            members={space.members ?? []}
            messages={messages}
            activeId={active?.id ?? ""}
            query={query}
            onQueryChange={setQuery}
            onSelect={selectClient}
            onRename={renameClient}
            onOwnerChange={changeClientOwner}
            onDelete={deleteClient}
          />
        </aside>

        <main
          className={`pane pane-thread ${mobilePane === "thread" ? "is-mobile-show" : ""}`}
          key={active?.id ?? "empty"}
        >
          {active ? (
            <ThreadPane
              client={active}
              scrollKey={threadScrollKey(slug, active.id)}
              messages={thread}
              draft={draft}
              pendingArtifact={pendingArtifacts[active.id] ?? null}
              scrollToBottomTick={scrollToBottomTick}
              onDraftChange={setDraft}
              onSend={sendText}
              onSendImage={sendImage}
              onConfirmPending={confirmPendingArtifact}
              onDismissPending={dismissPendingArtifact}
              onEndChat={endChat}
            />
          ) : (
            <div className="thread thread-empty-floor">
              <h2>Waiting for clients</h2>
              <p>
                Share the entry link. Each person gets their own unique chat URL.
              </p>
              <code>{clientUrl || `/${slug}`}</code>
            </div>
          )}
        </main>

        <aside
          className={`pane pane-library ${mobilePane === "library" ? "is-mobile-show" : ""}`}
        >
          <RightPane
            categories={categories}
            artifacts={artifacts}
            filter={libraryFilter}
            onFilterChange={setLibraryFilter}
            onStageArtifact={stageArtifact}
            onChangeLibrary={updateLibrary}
            sentFlash={sentFlash}
            activeClient={active}
            thread={thread}
            businessName={space.business.name}
            trade={space.business.trade}
            assistBehavior={space.settings.assistBehavior ?? ""}
            onChangeAssistBehavior={(assistBehavior) =>
              updateSettings({
                ...space.settings,
                assistBehavior,
              })
            }
            onUseSuggestion={(text) => {
              setDraft(text);
              setMobilePane("thread");
              bumpScrollToBottom();
            }}
          />
        </aside>
      </div>

      <nav className="mobile-tabs" aria-label="Workspace panes">
        {(
          [
            ["clients", "Inbox"],
            ["thread", "Chat"],
            ["library", "Tools"],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            className={mobilePane === id ? "is-active" : undefined}
            onClick={() => setMobilePane(id)}
          >
            {label}
          </button>
        ))}
      </nav>

      {settingsOpen ? (
        <FloorSettingsPanel
          settings={{
            ...space.settings,
            responseNote: space.settings.responseNote ?? "",
            awayMessage: space.settings.awayMessage ?? "",
            windows: space.settings.windows ?? [],
            banners: space.settings.banners ?? [],
            brandBannerUrl: space.settings.brandBannerUrl,
            logoUrl: space.settings.logoUrl,
            chatEndImages: space.settings.chatEndImages ?? [],
            notifyEmails: space.settings.notifyEmails ?? [],
            assistBehavior: space.settings.assistBehavior ?? "",
          }}
          members={space.members ?? []}
          onChangeSettings={updateSettings}
          onChangeMembers={updateMembers}
          onClose={() => setSettingsOpen(false)}
        />
      ) : null}

      {chatInterfaceOpen ? (
        <ChatInterfaceSetupModal
          settings={{
            ...space.settings,
            chatEndImages: space.settings.chatEndImages ?? [],
          }}
          onChangeSettings={updateSettings}
          onClose={() => setChatInterfaceOpen(false)}
        />
      ) : null}

      {preChatOpen ? (
        <PreChatSetupModal
          settings={space.settings}
          onChangeSettings={updateSettings}
          onClose={() => setPreChatOpen(false)}
        />
      ) : null}

      <FeedbackWidget />
    </div>
  );
}
