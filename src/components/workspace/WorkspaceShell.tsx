"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import type {
  Artifact,
  BusinessSpace,
  Client,
  FloorMember,
  FloorSettings,
  LibraryCategory,
  Message,
  MessageReplyRef,
  ReceiptPayment,
  ReceiptProduct,
  ComposerShortcut,
} from "@/lib/types";
import { forgetChat } from "@/lib/chatMemory";
import {
  forgetThreadScroll,
  threadScrollKey,
} from "@/lib/threadScroll";
import {
  buildReplyRef,
  toggleMessageReaction,
  type ReactionActor,
} from "@/lib/messageSocial";
import {
  appendMessage,
  applySpaceOp,
  applySpaceOpToSpace,
  bootFloor,
  createForwardLink,
  getSpace,
  messageTimeStamp,
  readMediaFile,
  subscribeSpace,
  toggleReaction,
} from "@/lib/store";
import type { SpaceOp } from "@/lib/spaceOps";
import { messageCreatedMs } from "@/lib/messageTime";
import {
  markSendAck,
  markSendPaint,
  markSendStart,
  noteIncomingMessages,
} from "@/lib/chatLatency";
import { parseSoloUrl } from "@/lib/messageLinks";
import { ClientRail } from "./ClientRail";
import { WorkspaceTopBar } from "./WorkspaceTopBar";
import { ChatInterfaceSetupModal } from "./ChatInterfaceSetupModal";
import { PreChatSetupModal } from "./PreChatSetupModal";
import { ThreadPane } from "./ThreadPane";
import { RightPane, type RightTab } from "./RightPane";
import { CornerTools } from "@/components/shared/CornerTools";
import {
  loadFloorPrefs,
  playActiveChatSound,
  playNewChatSound,
} from "@/lib/floorPrefs";
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
  const [clientUrl, setClientUrl] = useState("");
  const [floorMemberId, setFloorMemberId] = useState<string>("all");
  const [openAtBottom, setOpenAtBottom] = useState(false);
  const [rightTab, setRightTab] = useState<RightTab>("artifacts");
  const [replyTo, setReplyTo] = useState<MessageReplyRef | null>(null);
  const [pendingIds, setPendingIds] = useState<Set<string>>(() => new Set());
  const [failedIds, setFailedIds] = useState<Set<string>>(() => new Set());
  const [forwardCopied, setForwardCopied] = useState(false);
  const [chatInterfaceOpen, setChatInterfaceOpen] = useState(false);
  const [preChatOpen, setPreChatOpen] = useState(false);
  const localSentIds = useRef<Set<string>>(new Set());
  const opsInFlight = useRef(0);
  const soundPrimed = useRef(false);
  const knownClientIds = useRef<Set<string>>(new Set());
  const knownClientMsgIds = useRef<Set<string>>(new Set());
  const activeIdRef = useRef(activeId);
  /** Per-chat message cache — fetch once per chat, reuse when switching back. */
  const threadCacheRef = useRef<Map<string, Message[]>>(new Map());
  const loadedThreadsRef = useRef<Set<string>>(new Set());
  /** Chats that got new messages while not focused — open scrolled to bottom. */
  const pinBottomOnOpenRef = useRef<Set<string>>(new Set());
  const [, startTransition] = useTransition();

  useEffect(() => {
    activeIdRef.current = activeId;
  }, [activeId]);

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
    soundPrimed.current = false;
    knownClientIds.current = new Set();
    knownClientMsgIds.current = new Set();
    threadCacheRef.current = new Map();
    loadedThreadsRef.current = new Set();
    pinBottomOnOpenRef.current = new Set();
  }, [slug]);

  useEffect(() => {
    let cancelled = false;
    let unsubscribe = () => {};

    function mergeThread(existing: Message[], incoming: Message[]): Message[] {
      if (!incoming.length) return existing;
      if (!existing.length) return incoming;
      const map = new Map<string, Message>();
      for (const m of existing) map.set(m.id, m);
      for (const m of incoming) map.set(m.id, m);
      const merged = Array.from(map.values());
      merged.sort(
        (a, b) => (messageCreatedMs(a) ?? 0) - (messageCreatedMs(b) ?? 0),
      );
      return merged;
    }

    function onLiveSpace(next: BusinessSpace) {
      noteIncomingMessages(next.messages, localSentIds.current);
      setSpace((current) => {
        const aid = activeIdRef.current;
        const merged =
          opsInFlight.current > 0 && current
            ? { ...next, settings: current.settings }
            : next;

        const byClient = new Map<string, Message[]>();
        for (const m of current?.messages ?? []) {
          if (!loadedThreadsRef.current.has(m.clientId)) continue;
          const list = byClient.get(m.clientId) ?? [];
          list.push(m);
          byClient.set(m.clientId, list);
        }

        const incomingByClient = new Map<string, Message[]>();
        for (const m of merged.messages) {
          const list = incomingByClient.get(m.clientId) ?? [];
          list.push(m);
          incomingByClient.set(m.clientId, list);
        }

        for (const [clientId, incoming] of incomingByClient) {
          const canPatch =
            clientId === aid || loadedThreadsRef.current.has(clientId);
          if (!canPatch) continue;

          const prev =
            byClient.get(clientId) ??
            threadCacheRef.current.get(clientId) ??
            [];
          const hadNew = incoming.some((m) => !prev.some((p) => p.id === m.id));
          const nextThread = mergeThread(prev, incoming);
          byClient.set(clientId, nextThread);
          threadCacheRef.current.set(clientId, nextThread);
          loadedThreadsRef.current.add(clientId);

          if (hadNew && clientId !== aid) {
            pinBottomOnOpenRef.current.add(clientId);
          }
        }

        // Unread bump on any non-active chat → open at bottom next time.
        if (current) {
          for (const c of merged.clients) {
            if (c.id === aid) continue;
            const prev = current.clients.find((x) => x.id === c.id);
            if (prev && (c.unread ?? 0) > (prev.unread ?? 0)) {
              pinBottomOnOpenRef.current.add(c.id);
            }
          }
        }

        const messages = Array.from(byClient.values()).flat();
        return { ...merged, messages };
      });

      // Keep current selection if that chat still has guest activity.
      setActiveId((current) => {
        const visible = next.clients.filter((c) => c.preview.trim());
        if (current && visible.some((c) => c.id === current)) {
          return current;
        }
        // Fall back to most recently active chat (server order).
        return visible[0]?.id ?? "";
      });
    }

    async function boot() {
      const loaded = await bootFloor(slug);
      if (cancelled) return;

      setClientUrl(`${window.location.origin}/${slug}`);

      const mostRecent = loaded.clients.find((c) => c.preview.trim());
      let seeded = loaded;

      if (mostRecent) {
        loadedThreadsRef.current.add(mostRecent.id);
        const threadMsgs = loaded.messages.filter(
          (m) => m.clientId === mostRecent.id,
        );
        threadCacheRef.current.set(mostRecent.id, threadMsgs);
        activeIdRef.current = mostRecent.id;

        if ((mostRecent.unread ?? 0) > 0) {
          forgetThreadScroll(threadScrollKey(slug, mostRecent.id));
          setOpenAtBottom(true);
        }

        setSpace(loaded);
        setActiveId(mostRecent.id);
        seeded = { ...loaded, messages: threadMsgs };
      } else {
        setSpace(loaded);
        setActiveId("");
      }

      if (cancelled) return;

      unsubscribe = subscribeSpace(slug, (next) => {
        if (!next) return;
        onLiveSpace(next);
      }, {
        getChatId: () => activeIdRef.current || undefined,
        initialSpace: seeded,
        retainOtherThreadMessages: true,
      });
    }

    void boot();

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

  useEffect(() => {
    if (!space) return;
    const clientMsgs = space.messages.filter((m) => m.from === "client");
    if (!soundPrimed.current) {
      knownClientIds.current = new Set(
        space.clients
          .filter((c) => clientMsgs.some((m) => m.clientId === c.id))
          .map((c) => c.id),
      );
      knownClientMsgIds.current = new Set(clientMsgs.map((m) => m.id));
      soundPrimed.current = true;
      return;
    }

    const prefs = loadFloorPrefs(slug);
    for (const m of clientMsgs) {
      if (knownClientMsgIds.current.has(m.id)) continue;
      knownClientMsgIds.current.add(m.id);
      if (!knownClientIds.current.has(m.clientId)) {
        knownClientIds.current.add(m.clientId);
        playNewChatSound(prefs.newChatSound);
      } else if (m.clientId === activeId) {
        playActiveChatSound(prefs.activeChatSound);
      }
    }
  }, [space, activeId, slug]);

  useEffect(() => {
    if (members.length === 0) {
      if (floorMemberId !== "all") chooseFloorMember("all");
      return;
    }
    if (floorMemberId === "all" || !members.some((m) => m.id === floorMemberId)) {
      chooseFloorMember(members[0].id);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [members, floorMemberId]);

  /** Stamp replies with the employee currently using the floor. */
  function speakerStamp(
    client: Client,
    team: FloorMember[],
  ): Pick<Message, "fromMemberId" | "fromName"> {
    const activeFloor =
      floorMemberId !== "all"
        ? team.find((m) => m.id === floorMemberId)
        : undefined;
    const owner =
      activeFloor ||
      (client.ownerMemberId &&
        team.find((m) => m.id === client.ownerMemberId)) ||
      (team.length === 1 ? team[0] : undefined);
    if (!owner) return {};
    return { fromMemberId: owner.id, fromName: owner.name };
  }

  /** Assign the active floor employee as this chat's owner when they engage. */
  function claimChatOwner(
    latestClients: Client[],
    clientId: string,
  ): Client[] {
    if (floorMemberId === "all") return latestClients;
    if (!members.some((m) => m.id === floorMemberId)) return latestClients;
    return latestClients.map((c) =>
      c.id === clientId && c.ownerMemberId !== floorMemberId
        ? { ...c, ownerMemberId: floorMemberId }
        : c,
    );
  }

  const filteredClients = useMemo(() => {
    const withGuestActivity = clients.filter((c) => c.preview.trim());
    const q = query.trim().toLowerCase();
    if (!q) return withGuestActivity;
    return withGuestActivity.filter(
      (c) =>
        c.name.toLowerCase().includes(q) ||
        c.preview.toLowerCase().includes(q) ||
        c.trade.includes(q),
    );
  }, [clients, query]);

  useEffect(() => {
    if (!activeId) return;

    // Already in memory — leave space.messages alone so the filter is instant.
    if (loadedThreadsRef.current.has(activeId)) return;

    let cancelled = false;
    void getSpace(slug, activeId).then((loaded) => {
      if (cancelled || !loaded) return;
      if (activeIdRef.current !== activeId) return;
      const threadMsgs = loaded.messages.filter((m) => m.clientId === activeId);
      loadedThreadsRef.current.add(activeId);
      threadCacheRef.current.set(activeId, threadMsgs);
      setSpace((current) => {
        if (!current) {
          return { ...loaded, messages: threadMsgs };
        }
        const kept = current.messages.filter((m) => m.clientId !== activeId);
        return {
          ...current,
          clients: loaded.clients,
          messages: [...kept, ...threadMsgs],
        };
      });
    });
    return () => {
      cancelled = true;
    };
  }, [activeId, slug]);

  // Keep cache fresh while viewing (sends, reactions, SSE).
  useEffect(() => {
    if (!activeId || !space) return;
    if (!loadedThreadsRef.current.has(activeId)) return;
    const threadMsgs = space.messages.filter((m) => m.clientId === activeId);
    threadCacheRef.current.set(activeId, threadMsgs);
  }, [space, activeId]);

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

  function runOp(op: SpaceOp) {
    setSpace((current) =>
      current ? applySpaceOpToSpace(current, op) : current,
    );
    opsInFlight.current += 1;
    void applySpaceOp(slug, op)
      .catch((err) => {
        console.warn("Update failed:", err);
      })
      .finally(() => {
        opsInFlight.current = Math.max(0, opsInFlight.current - 1);
      });
  }

  function selectClient(client: Client) {
    const jumpToLatest =
      (client.unread ?? 0) > 0 ||
      pinBottomOnOpenRef.current.has(client.id);
    if (jumpToLatest) {
      forgetThreadScroll(threadScrollKey(slug, client.id));
      pinBottomOnOpenRef.current.delete(client.id);
    }
    setOpenAtBottom(jumpToLatest);
    startTransition(() => {
      setActiveId(client.id);
      setReplyTo(null);
      setMobilePane("thread");
    });
    if (jumpToLatest || (client.unread ?? 0) > 0) {
      setSpace((current) =>
        current
          ? {
              ...current,
              clients: current.clients.map((c) =>
                c.id === client.id ? { ...c, unread: 0 } : c,
              ),
            }
          : current,
      );
    }
    if (
      floorMemberId !== "all" &&
      client.ownerMemberId !== floorMemberId
    ) {
      runOp({
        type: "setOwner",
        clientId: client.id,
        ownerMemberId: floorMemberId,
      });
    }
  }

  function renameClient(clientId: string, name: string) {
    runOp({ type: "renameClient", clientId, name });
  }

  function changeClientOwner(
    clientId: string,
    ownerMemberId: string | undefined,
  ) {
    runOp({ type: "setOwner", clientId, ownerMemberId: ownerMemberId ?? null });
  }

  function updateMembers(nextMembers: FloorMember[]) {
    runOp({ type: "updateMembers", members: nextMembers });
  }

  function deleteClient(clientId: string) {
    forgetThreadScroll(threadScrollKey(slug, clientId));
    threadCacheRef.current.delete(clientId);
    loadedThreadsRef.current.delete(clientId);
    setPendingArtifacts((prev) => {
      const next = { ...prev };
      delete next[clientId];
      return next;
    });
    forgetChat(slug, clientId);
    if (activeId === clientId) {
      setActiveId(
        (space?.clients.find((c) => c.id !== clientId && c.preview.trim())?.id ??
          "") ||
          "",
      );
    }
    runOp({ type: "deleteClient", clientId });
  }

  function endChat() {
    if (!active || active.chatEndedAt) return;
    const clientId = active.id;
    const speaker = speakerStamp(active, members);
    const body =
      "Chat ended. If you'd like a recording of this conversation, enter your email and we'll send one.";
    const nextMsg: Message = {
      id: `m-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      clientId,
      from: "business",
      kind: "text",
      body,
      ...messageTimeStamp(),
      ...speaker,
    };
    if (floorMemberId !== "all") {
      runOp({
        type: "setOwner",
        clientId,
        ownerMemberId: floorMemberId,
      });
    }
    runOp({ type: "endChat", clientId, message: nextMsg });
    setPendingArtifacts((prev) => {
      if (!(clientId in prev)) return prev;
      const next = { ...prev };
      delete next[clientId];
      return next;
    });
    setDraft("");
    bumpScrollToBottom();
  }

  async function copyForwardLink() {
    if (!active) return;
    try {
      const { url } = await createForwardLink(slug, active.id);
      await navigator.clipboard.writeText(url);
      setForwardCopied(true);
      window.setTimeout(() => setForwardCopied(false), 1600);
    } catch (err) {
      console.warn("Forward link failed:", err);
    }
  }

  function openTool(tab: RightTab) {
    setRightTab(tab);
    setMobilePane("library");
  }

  function bumpScrollToBottom() {
    setScrollToBottomTick((n) => n + 1);
  }

  function reactionActor(client: Client): ReactionActor {
    const stamp = speakerStamp(client, members);
    return {
      from: "business",
      ...(stamp.fromMemberId ? { fromMemberId: stamp.fromMemberId } : {}),
      ...(stamp.fromName ? { fromName: stamp.fromName } : {}),
    };
  }

  function startReply(message: Message) {
    setReplyTo(buildReplyRef(message));
    bumpScrollToBottom();
  }

  function reactToMessage(messageId: string, emoji: string) {
    if (!active || active.chatEndedAt || !space) return;
    const actor = reactionActor(active);
    const prev = space.messages.find((m) => m.id === messageId)?.reactions;
    const nextReactions = toggleMessageReaction(prev, emoji, actor);
    setSpace({
      ...space,
      messages: space.messages.map((m) =>
        m.id === messageId ? { ...m, reactions: nextReactions } : m,
      ),
    });
    void toggleReaction(slug, { messageId, emoji, actor }).catch((err) => {
      console.warn("Reaction failed:", err);
      setSpace((current) => {
        if (!current) return current;
        return {
          ...current,
          messages: current.messages.map((m) =>
            m.id === messageId ? { ...m, reactions: prev } : m,
          ),
        };
      });
    });
  }

  function sendText() {
    if (!active || active.chatEndedAt || !draft.trim() || !space) return;
    const body = draft.trim();
    const soloUrl = parseSoloUrl(body);
    const clientId = active.id;
    const speaker = speakerStamp(active, members);
    const reply = replyTo;
    const nextMsg: Message = {
      id: `m-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      clientId,
      from: "business",
      ...(soloUrl
        ? { kind: "link" as const, body: soloUrl, linkUrl: soloUrl }
        : { kind: "text" as const, body }),
      ...(reply ? { replyTo: reply } : {}),
      ...messageTimeStamp(),
      ...speaker,
    };
    const nextClients = claimChatOwner(space.clients, clientId).map((c) =>
      c.id === clientId
        ? { ...c, preview: body, lastActive: "Just now", unread: 0 }
        : c,
    );
    const nextClient =
      nextClients.find((c) => c.id === clientId) ??
      ({ ...active, preview: body, lastActive: "Just now", unread: 0 } as Client);

    localSentIds.current.add(nextMsg.id);
    markSendStart(nextMsg.id);
    setPendingIds((prev) => new Set(prev).add(nextMsg.id));
    setFailedIds((prev) => {
      const next = new Set(prev);
      next.delete(nextMsg.id);
      return next;
    });
    setSpace({
      ...space,
      clients: nextClients,
      messages: [...space.messages, nextMsg],
    });
    setDraft("");
    setReplyTo(null);
    bumpScrollToBottom();
    queueMicrotask(() => markSendPaint(nextMsg.id));

    void appendMessage(slug, {
      message: nextMsg,
      client: nextClient,
      upsertClient: true,
      bumpClient: true,
    })
      .then(() => {
        markSendAck(nextMsg.id);
        setPendingIds((prev) => {
          const next = new Set(prev);
          next.delete(nextMsg.id);
          return next;
        });
      })
      .catch((err) => {
        console.warn("Send failed:", err);
        setPendingIds((prev) => {
          const next = new Set(prev);
          next.delete(nextMsg.id);
          return next;
        });
        setFailedIds((prev) => new Set(prev).add(nextMsg.id));
      });
  }

  async function sendImage(file: File) {
    if (!active || active.chatEndedAt || !space) return;
    const clientId = active.id;
    const speaker = speakerStamp(active, members);
    const caption = draft.trim();
    const reply = replyTo;
    const media = await readMediaFile(file);
    if (media.kind !== "photo") {
      throw new Error("Pick an image file.");
    }

    const nextMsg: Message = {
      id: `m-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      clientId,
      from: "business",
      kind: "image",
      body: caption,
      imageUrl: media.url,
      ...(reply ? { replyTo: reply } : {}),
      ...messageTimeStamp(),
      ...speaker,
    };
    const nextClients = claimChatOwner(space.clients, clientId).map((c) =>
      c.id === clientId
        ? {
            ...c,
            preview: caption || "Photo",
            lastActive: "Just now",
            unread: 0,
          }
        : c,
    );
    const nextClient =
      nextClients.find((c) => c.id === clientId) ?? active;
    setSpace({
      ...space,
      clients: nextClients,
      messages: [...space.messages, nextMsg],
    });
    setDraft("");
    setReplyTo(null);
    bumpScrollToBottom();
    void appendMessage(slug, {
      message: nextMsg,
      client: nextClient,
      upsertClient: true,
      bumpClient: true,
    }).catch((err) => console.warn("Photo send failed:", err));
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
    if (!active || !space) return;
    const clientId = active.id;
    const speaker = speakerStamp(active, members);
    const reply = replyTo;

    const build = () => {
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
          ...(reply ? { replyTo: reply } : {}),
          ...messageTimeStamp(),
          ...speaker,
        };
      } else if (item.kind === "photo") {
        nextMsg = {
          id: `m-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
          clientId,
          from: "business",
          kind: "image",
          body: "",
          imageUrl: item.url,
          artifactId: item.id,
          ...(reply ? { replyTo: reply } : {}),
          ...messageTimeStamp(),
          ...speaker,
        };
      } else if (item.kind === "collection") {
        const urls =
          item.urls?.length && item.urls.length > 0
            ? item.urls
            : item.url
              ? [item.url]
              : [];
        nextMsg = {
          id: `m-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
          clientId,
          from: "business",
          kind: "image",
          body: "",
          imageUrl: urls[0] || item.url,
          ...(urls.length > 1 ? { imageUrls: urls } : {}),
          artifactId: item.id,
          ...(reply ? { replyTo: reply } : {}),
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
          ...(reply ? { replyTo: reply } : {}),
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
          ...(reply ? { replyTo: reply } : {}),
          ...messageTimeStamp(),
          ...speaker,
        };
      }

      const preview =
        item.kind === "text"
          ? (item.body || item.title).slice(0, 80)
          : item.title;

      const nextClients = claimChatOwner(space.clients, clientId).map((c) =>
        c.id === clientId
          ? { ...c, preview, lastActive: "Just now", unread: 0 }
          : c,
      );
      return {
        nextMsg,
        nextClients,
        nextClient: nextClients.find((c) => c.id === clientId) ?? active,
        artifacts: space.artifacts.map((a) =>
          a.id === item.id ? { ...a, uses: a.uses + 1 } : a,
        ),
      };
    };
    const built = build();
    setSpace({
      ...space,
      clients: built.nextClients,
      messages: [...space.messages, built.nextMsg],
      artifacts: built.artifacts,
    });
    setReplyTo(null);
    void appendMessage(slug, {
      message: built.nextMsg,
      client: built.nextClient,
      upsertClient: true,
      bumpClient: true,
    }).catch((err) => console.warn("Send failed:", err));
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
    const ids = new Set(next.artifacts.map((a) => a.id));
    const shortcuts = (space?.settings.shortcuts ?? []).filter(
      (sc) => sc.kind !== "artifact" || ids.has(sc.artifactId),
    );
    if (
      space &&
      shortcuts.length !== (space.settings.shortcuts ?? []).length
    ) {
      runOp({
        type: "setSettings",
        settings: { ...space.settings, shortcuts },
      });
    }
    runOp({
      type: "setLibrary",
      categories: next.categories,
      artifacts: next.artifacts,
    });
  }

  function toggleArtifactShortcut(item: Artifact) {
    if (!space) return;
    const current = space.settings.shortcuts ?? [];
    const existing = current.find(
      (sc) => sc.kind === "artifact" && sc.artifactId === item.id,
    );
    const shortcuts: ComposerShortcut[] = existing
      ? current.filter((sc) => sc.id !== existing.id)
      : current.length >= 16
        ? current
        : [
            ...current,
            {
              id: `sc-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
              kind: "artifact",
              artifactId: item.id,
            },
          ];
    updateSettings({ ...space.settings, shortcuts });
  }

  function openShortcutSettings() {
    router.push(`/${slug}/dashboard?settings=shortcuts`);
  }

  function updateReceiptPayments(receiptPayments: ReceiptPayment[]) {
    runOp({ type: "setReceipts", receiptPayments });
  }

  function updateReceiptProducts(receiptProducts: ReceiptProduct[]) {
    runOp({ type: "setReceipts", receiptProducts });
  }

  function sendReceipt(input: {
    product: ReceiptProduct;
    payment: ReceiptPayment;
  }) {
    if (!active || active.chatEndedAt) return;
    const clientId = active.id;
    const speaker = speakerStamp(active, members);
    const { product, payment } = input;
    const priceBit = product.price ? ` · ${product.price}` : "";
    const body = `Official receipt: ${product.title}${priceBit}`;
    const productLink =
      typeof product.linkUrl === "string" &&
      /^https?:\/\//i.test(product.linkUrl.trim())
        ? product.linkUrl.trim()
        : undefined;
    const paymentLink =
      payment.kind === "url" && /^https?:\/\//i.test(payment.detail.trim())
        ? payment.detail.trim()
        : undefined;
    const linkUrl =
      payment.kind === "url" ? productLink || paymentLink : undefined;

    const nextMsg: Message = {
      id: `m-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      clientId,
      from: "business",
      kind: "receipt",
      body,
      ...(linkUrl ? { linkUrl } : {}),
      receipt: {
        productId: product.id,
        productTitle: product.title,
        ...(product.price ? { productPrice: product.price } : {}),
        ...(product.note ? { productNote: product.note } : {}),
        ...(productLink ? { productLinkUrl: productLink } : {}),
        paymentId: payment.id,
        paymentKind: payment.kind,
        paymentLabel: payment.label,
        paymentDetail: payment.detail,
      },
      ...messageTimeStamp(),
      ...speaker,
    };
    if (!space) return;
    const nextClients = claimChatOwner(space.clients, clientId).map((c) =>
      c.id === clientId
        ? { ...c, preview: body, lastActive: "Just now", unread: 0 }
        : c,
    );
    const nextClient = nextClients.find((c) => c.id === clientId) ?? active;
    setSpace({
      ...space,
      clients: nextClients,
      messages: [...space.messages, nextMsg],
    });
    void appendMessage(slug, {
      message: nextMsg,
      client: nextClient,
      upsertClient: true,
      bumpClient: true,
    }).catch((err) => console.warn("Receipt send failed:", err));
    setMobilePane("thread");
    bumpScrollToBottom();
  }

  function updateSettings(settings: FloorSettings) {
    runOp({ type: "setSettings", settings });
  }

  function toggleLive() {
    if (!space) return;
    runOp({
      type: "setSettings",
      settings: { ...space.settings, live: !space.settings.live },
    });
  }

  if (!space) {
    return <div className="client-chat-loading">Loading floor…</div>;
  }

  return (
    <div className="workspace">
      <WorkspaceTopBar
        slug={slug}
        businessName={space.business.name}
        view="floor"
        live={space.settings.live}
        onToggleLive={toggleLive}
        members={members}
        floorMemberId={floorMemberId}
        onChooseMember={chooseFloorMember}
        onOpenChatInterface={() => setChatInterfaceOpen(true)}
        onOpenPreChat={() => setPreChatOpen(true)}
        chatEndImageCount={space.settings.chatEndImages?.length ?? 0}
      />

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
              openAtBottom={openAtBottom}
              onOpenAtBottomDone={() => setOpenAtBottom(false)}
              pendingIds={pendingIds}
              failedIds={failedIds}
              floorMemberName={
                floorMemberId !== "all"
                  ? members.find((m) => m.id === floorMemberId)?.name
                  : undefined
              }
              floorMemberId={
                floorMemberId !== "all" ? floorMemberId : undefined
              }
              artifacts={artifacts}
              windows={space.settings.windows ?? []}
              responseNote={space.settings.responseNote ?? ""}
              shortcuts={space.settings.shortcuts ?? []}
              replyTo={replyTo}
              onDraftChange={setDraft}
              onSend={sendText}
              onSendImage={sendImage}
              onConfirmPending={confirmPendingArtifact}
              onDismissPending={dismissPendingArtifact}
              onEndChat={endChat}
              onCopyForwardLink={() => void copyForwardLink()}
              forwardCopied={forwardCopied}
              onOpenTool={openTool}
              onStageArtifact={stageArtifact}
              onEditShortcuts={openShortcutSettings}
              onReplyTo={startReply}
              onClearReply={() => setReplyTo(null)}
              onReact={reactToMessage}
            />
          ) : (
            <div className="thread thread-empty-floor">
              <h2>Waiting for clients</h2>
              <p>
                Share your link from Dashboard. Each person gets their own chat
                URL.
              </p>
              <code>{clientUrl || `/${slug}`}</code>
            </div>
          )}
        </main>

        <aside
          className={`pane pane-library ${mobilePane === "library" ? "is-mobile-show" : ""}`}
        >
          <RightPane
            tab={rightTab}
            onTabChange={(tab) => {
              setRightTab(tab);
              setMobilePane("library");
            }}
            categories={categories}
            artifacts={artifacts}
            filter={libraryFilter}
            onFilterChange={setLibraryFilter}
            onStageArtifact={stageArtifact}
            onToggleArtifactShortcut={toggleArtifactShortcut}
            shortcutArtifactIds={(space.settings.shortcuts ?? [])
              .filter(
                (sc): sc is Extract<ComposerShortcut, { kind: "artifact" }> =>
                  sc.kind === "artifact",
              )
              .map((sc) => sc.artifactId)}
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
            receiptPayments={space.receiptPayments ?? []}
            receiptProducts={space.receiptProducts ?? []}
            onChangeReceiptPayments={updateReceiptPayments}
            onChangeReceiptProducts={updateReceiptProducts}
            onSendReceipt={sendReceipt}
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

      <CornerTools />
    </div>
  );
}
