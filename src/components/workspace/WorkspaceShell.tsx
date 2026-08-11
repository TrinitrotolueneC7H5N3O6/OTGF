"use client";

import Link from "next/link";
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
} from "@/lib/types";
import { forgetChat } from "@/lib/chatMemory";
import { forgetThreadScroll, threadScrollKey } from "@/lib/threadScroll";
import {
  buildReplyRef,
  toggleMessageReaction,
  type ReactionActor,
} from "@/lib/messageSocial";
import {
  appendMessage,
  applySpaceOp,
  applySpaceOpToSpace,
  ensureSpace,
  messageTimeStamp,
  readMediaFile,
  requestSpaceRefresh,
  subscribeSpace,
  toggleReaction,
} from "@/lib/store";
import type { SpaceOp } from "@/lib/spaceOps";
import {
  markSendAck,
  markSendPaint,
  markSendStart,
  noteIncomingMessages,
} from "@/lib/chatLatency";
import { ClientRail } from "./ClientRail";
import { FloorSettingsPanel } from "./FloorSettingsPanel";
import { ThreadPane } from "./ThreadPane";
import { RightPane, type RightTab } from "./RightPane";
import { FeedbackWidget } from "@/components/shared/FeedbackWidget";
import {
  IconCheck,
  IconCode,
  IconEye,
  IconGear,
  IconLink,
  IconX,
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
  const [widgetOpen, setWidgetOpen] = useState(false);
  const [widgetCopied, setWidgetCopied] = useState(false);
  const [clientUrl, setClientUrl] = useState("");
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);
  const [floorMemberId, setFloorMemberId] = useState<string>("all");
  const [rightTab, setRightTab] = useState<RightTab>("artifacts");
  const [replyTo, setReplyTo] = useState<MessageReplyRef | null>(null);
  const [pendingIds, setPendingIds] = useState<Set<string>>(() => new Set());
  const [failedIds, setFailedIds] = useState<Set<string>>(() => new Set());
  const localSentIds = useRef<Set<string>>(new Set());
  const opsInFlight = useRef(0);
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
      noteIncomingMessages(next.messages, localSentIds.current);
      setSpace((current) => {
        if (opsInFlight.current > 0 && current) {
          return { ...next, settings: current.settings };
        }
        return next;
      });

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
        if (opsInFlight.current === 0) requestSpaceRefresh(slug);
      });
  }

  function selectClient(client: Client) {
    startTransition(() => {
      setActiveId(client.id);
      setReplyTo(null);
      setMobilePane("thread");
    });
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
    setPendingArtifacts((prev) => {
      const next = { ...prev };
      delete next[clientId];
      return next;
    });
    forgetChat(slug, clientId);
    if (activeId === clientId) {
      setActiveId(
        (space?.clients.find((c) => c.id !== clientId)?.id ?? "") || "",
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
    const clientId = active.id;
    const speaker = speakerStamp(active, members);
    const reply = replyTo;
    const nextMsg: Message = {
      id: `m-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      clientId,
      from: "business",
      kind: "text",
      body,
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
          body: item.title || "",
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
    runOp({
      type: "setLibrary",
      categories: next.categories,
      artifacts: next.artifacts,
    });
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

  async function copyClientUrl() {
    await navigator.clipboard.writeText(clientUrl);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1600);
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
          {members.length > 0 ? (
            <label className="floor-member-select">
              <span className="sr-only">Working as</span>
              <select
                value={
                  members.some((m) => m.id === floorMemberId)
                    ? floorMemberId
                    : members[0].id
                }
                onChange={(e) => chooseFloorMember(e.target.value)}
                aria-label="Working as"
                title="Who is using the floor right now"
              >
                {members.map((member) => (
                  <option key={member.id} value={member.id}>
                    {member.name}
                  </option>
                ))}
              </select>
            </label>
          ) : null}
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
            title="Preview customer chat"
          >
            <IconEye />
          </Link>
          <button
            type="button"
            className="icon-btn"
            onClick={() => {
              setWidgetOpen(true);
              setWidgetCopied(false);
            }}
            aria-label="Website widget"
            title="Website widget"
          >
            <IconCode />
          </button>
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
              banners={space.settings.banners ?? []}
              replyTo={replyTo}
              onDraftChange={setDraft}
              onSend={sendText}
              onSendImage={sendImage}
              onConfirmPending={confirmPendingArtifact}
              onDismissPending={dismissPendingArtifact}
              onEndChat={endChat}
              onOpenTool={openTool}
              onStageArtifact={stageArtifact}
              onReplyTo={startReply}
              onClearReply={() => setReplyTo(null)}
              onReact={reactToMessage}
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
            notifyEmails: space.settings.notifyEmails ?? [],
            assistBehavior: space.settings.assistBehavior ?? "",
          }}
          members={space.members ?? []}
          onChangeSettings={updateSettings}
          onChangeMembers={updateMembers}
          onClose={() => setSettingsOpen(false)}
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
              <p className="widget-snippet-hint">
                Optional:{" "}
                <code>data-position=&quot;left&quot;</code>,{" "}
                <code>data-label=&quot;Chat with us&quot;</code>,{" "}
                <code>data-color=&quot;#111111&quot;</code>
              </p>
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

      <FeedbackWidget />
    </div>
  );
}
