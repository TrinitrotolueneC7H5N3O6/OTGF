"use client";

import Link from "next/link";
import { createPortal } from "react-dom";
import {
  Fragment,
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
  type PointerEvent as ReactPointerEvent,
} from "react";
import type { BusinessSpace, Client, DepartmentAttachment, DepartmentContent, FloorSettings, Message, MessageReplyRef, Offering } from "@/lib/types";
import { rememberChat } from "@/lib/chatMemory";
import {
  beatPresence,
  formatResponseWindows,
  getSpace,
  nextGuestName,
  patchSpace,
  appendMessage,
  readAttachmentFile,
  readMediaFile,
  sendSpaceEmail,
  subscribeSpace,
  toggleReaction,
  messageTimeStamp,
} from "@/lib/store";
import {
  departmentHasContent,
  MAX_DEPARTMENT_ATTACHMENTS,
  normalizeDepartments,
} from "@/lib/spaceNormalize";
import { MessageMedia } from "@/components/shared/MessageMedia";
import { ChatBannerView } from "@/components/shared/ChatBannerView";
import { MessageReactions } from "@/components/shared/MessageReactions";
import { MessageActionBar } from "@/components/shared/MessageActionBar";
import { MessageReplyQuote } from "@/components/shared/MessageReplyQuote";
import {
  buildReplyRef,
  reactorKey,
  toggleMessageReaction,
} from "@/lib/messageSocial";
import { clusterClassName, messageCluster } from "@/lib/messageCluster";
import {
  IconArrowSend,
  IconCamera,
  IconMic,
  IconPaperclip,
  IconPhoto,
  IconPlusCircle,
  IconThumbUp,
  IconX,
} from "@/components/shared/Icons";
import { SwipeTimeStream } from "./SwipeTimeStream";
import { ChatMarketingCarousel } from "./ChatMarketingCarousel";
import { MessageBodyText } from "@/components/shared/MessageBodyText";
import { InAppLink, LinkSheetProvider } from "@/components/shared/LinkSheet";
import {
  appendCustomerMessageWithAutoReply,
  ensureWelcomeMessages,
  isReconnectMessage,
  isSpecialtiesMessage,
} from "@/lib/customerAutoReply";
import { resolveChatIntroMessages } from "@/lib/chatIntroMessages";
import { isSolutionEnabled } from "@/lib/setupSolutions";
import { inquireMessageBody, inquireMessageId } from "@/lib/offerings";
import { SpeechToTextModal } from "./SpeechToTextModal";

interface ClientChatProps {
  slug: string;
  chatId: string;
  embedded?: boolean;
  /** Dashboard live preview — no network, no real chat. */
  preview?: boolean;
  previewEnded?: boolean;
  previewSpace?: BusinessSpace;
  inquireOfferingId?: string;
  /** Changing this value forces a retained embedded chat back to its newest message. */
  scrollToLatestSignal?: number;
}

type StaffOutIntakeStep = "contact" | "request" | "followup";

const CUSTOMER_FAQS = [
  "What services do you offer?",
  "How much does a consultation cost?",
  "What are your available appointment times?",
  "Do you offer virtual consultations?",
  "Where are you located?",
  "What should I prepare before my visit?",
];

function isThumbsUpOnly(message: Message) {
  return message.kind === "text" && message.body.trim() === "👍";
}

function isGuestName(name: string) {
  return /^Guest(?:\s+(?:\d+|[A-Z0-9]{4}))?$/i.test(name.trim());
}

function messageDate(message: Message) {
  const value = message.createdAt || message.at;
  const date = new Date(value);
  if (!Number.isNaN(date.getTime())) return date;

  const fallback = new Date(message.at);
  return Number.isNaN(fallback.getTime()) ? null : fallback;
}

function messageDayKey(message: Message) {
  const date = messageDate(message);
  if (!date) return message.at.split(/\s+at\s+|,\s*/i)[0] || message.at;
  return `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
}

function formatMessageDay(message: Message) {
  const date = messageDate(message);
  if (!date) return message.at.split(/\s+at\s+|,\s*/i)[0] || message.at;
  return date.toLocaleDateString([], {
    month: "long",
    day: "numeric",
  });
}

function formatSwipeTime(message: Message) {
  const date = messageDate(message);
  if (date) {
    return date.toLocaleTimeString([], {
      hour: "numeric",
      minute: "2-digit",
    });
  }
  const parts = message.at.split(/\s+at\s+|,\s*/i);
  return parts[1] || message.at;
}

function externalHref(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return "";
  return /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
}

export function ClientChat({
  slug,
  chatId,
  embedded = false,
  preview = false,
  previewEnded = false,
  previewSpace,
  inquireOfferingId,
  scrollToLatestSignal,
}: ClientChatProps) {
  const [space, setSpace] = useState<Awaited<
    ReturnType<typeof getSpace>
  > | null>(previewSpace ?? null);
  const [displayName, setDisplayName] = useState("");
  const [draft, setDraft] = useState("");
  const [sendAnimationMessageId, setSendAnimationMessageId] = useState<
    string | null
  >(null);
  const [emailDraft, setEmailDraft] = useState("");
  const [contactNameDraft, setContactNameDraft] = useState("");
  const [contactEmailDraft, setContactEmailDraft] = useState("");
  const [contactPhoneDraft, setContactPhoneDraft] = useState("");
  const [intakeReasonDraft, setIntakeReasonDraft] = useState("");
  const [intakeDetailsDraft, setIntakeDetailsDraft] = useState("");
  const [intakePhoneDraft, setIntakePhoneDraft] = useState("");
  const [intakeUrgency, setIntakeUrgency] = useState<"low" | "normal" | "high">("normal");
  const [intakePreferredContact, setIntakePreferredContact] = useState<"email" | "phone" | "chat">("chat");
  const [intakeConsent, setIntakeConsent] = useState(false);
  const [intakeSaved, setIntakeSaved] = useState(false);
  const [intakeStep, setIntakeStep] = useState(0);
  const [awaySurfaceRoot, setAwaySurfaceRoot] =
    useState<HTMLDivElement | null>(null);
  const [emailSaved, setEmailSaved] = useState(false);
  const [recordingSaved, setRecordingSaved] = useState(false);
  const [ready, setReady] = useState(() => Boolean(preview && previewSpace));
  const [attaching, setAttaching] = useState(false);
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const [mobileComposerExpanded, setMobileComposerExpanded] = useState(false);
  const [plusMenuOpen, setPlusMenuOpen] = useState(false);
  const [faqOpen, setFaqOpen] = useState(false);
  const [newMessageCount, setNewMessageCount] = useState(0);
  const [numberMenuOpen, setNumberMenuOpen] = useState(false);
  const [specialtiesMenuOpen, setSpecialtiesMenuOpen] = useState(false);
  const [selectedNumber, setSelectedNumber] = useState<number | null>(null);
  const [departmentDraft, setDepartmentDraft] = useState("");
  const [departmentDraftAttachments, setDepartmentDraftAttachments] = useState<
    DepartmentAttachment[]
  >([]);
  const [departmentSaving, setDepartmentSaving] = useState(false);
  const [copiedReturnLink, setCopiedReturnLink] = useState(false);
  const [linkEmailSent, setLinkEmailSent] = useState(false);
  const [linkEmailSending, setLinkEmailSending] = useState(false);
  const [linkEmailError, setLinkEmailError] = useState<string | null>(null);
  const [replyTo, setReplyTo] = useState<MessageReplyRef | null>(null);
  const [contactReason, setContactReason] = useState<string | null>(null);
  const [actionsFor, setActionsFor] = useState<string | null>(null);
  const [speechModalOpen, setSpeechModalOpen] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const composerWrapRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const cameraRef = useRef<HTMLInputElement>(null);
  const messageInputRef = useRef<HTMLInputElement>(null);
  const departmentImageRef = useRef<HTMLInputElement>(null);
  const departmentDocRef = useRef<HTMLInputElement>(null);
  const numberMenuRef = useRef<HTMLDivElement>(null);
  const specialtiesMenuRef = useRef<HTMLDivElement>(null);
  const inquireSent = useRef(false);
  const longPressTimerRef = useRef<number | null>(null);
  const longPressStartRef = useRef({ x: 0, y: 0 });
  const longPressOpenedRef = useRef(false);
  const actionsForRef = useRef<string | null>(null);
  const focusDismissPointerRef = useRef<{
    x: number;
    y: number;
    until: number;
  } | null>(null);
  const lastMessagePointerRef = useRef<string | null>(null);
  const scrollDismissStartRef = useRef<{ x: number; y: number } | null>(null);
  const actionFocusTouchStartRef = useRef<{ x: number; y: number } | null>(null);
  const isNearLatestRef = useRef(true);
  const previousThreadRef = useRef({ length: 0, latestId: "" });
  const pendingSendScrollRef = useRef(false);

  actionsForRef.current = actionsFor;

  function isMobileClientChat() {
    return !embedded && !preview && window.matchMedia("(max-width: 640px)").matches;
  }

  function isMobileComposerSession() {
    return !preview && window.matchMedia("(max-width: 640px)").matches;
  }

  function clampMobileOverscrollGap() {
    if (!isMobileClientChat()) return;
    const page = document.documentElement;
    const viewportHeight = page.clientHeight || window.innerHeight;
    const maxTop = Math.max(0, page.scrollHeight - viewportHeight);
    if (window.scrollY > maxTop) {
      window.scrollTo({ top: maxTop, behavior: "auto" });
    }
  }

  function settleMobileOverscrollGap() {
    if (!isMobileClientChat()) return;
    window.requestAnimationFrame(clampMobileOverscrollGap);
    window.setTimeout(clampMobileOverscrollGap, 60);
    window.setTimeout(clampMobileOverscrollGap, 160);
    window.setTimeout(clampMobileOverscrollGap, 320);
  }

  useEffect(() => {
    if (preview) {
      if (previewSpace) {
        setSpace(previewSpace);
        setReady(true);
      }
      return;
    }

    let cancelled = false;

    async function boot() {
      const loaded = await getSpace(slug, chatId, { threadOnly: true });
      if (cancelled) return;
      if (!loaded) {
        setReady(true);
        return;
      }

      // Don't create a floor inbox row on open — only after they message.
      const client = loaded.clients.find((c) => c.id === chatId);
      setSpace(loaded);
      rememberChat(slug, chatId);
      if (client && !isGuestName(client.name)) setDisplayName(client.name);
      if (client?.staffOutIntake) {
        setDisplayName(client.staffOutIntake.name);
        setEmailDraft(client.staffOutIntake.email ?? client.email ?? "");
        setIntakePhoneDraft(client.staffOutIntake.phone ?? "");
        setIntakeReasonDraft(client.staffOutIntake.reason ?? "");
        setIntakeDetailsDraft(client.staffOutIntake.details ?? "");
        setIntakeUrgency(client.staffOutIntake.urgency ?? "normal");
        setIntakePreferredContact(client.staffOutIntake.preferredContact ?? "chat");
        setIntakeConsent(client.staffOutIntake.consent);
        setIntakeSaved(true);
      }
      if (client?.contactInfo) {
        setContactNameDraft(client.contactInfo.name);
        setContactEmailDraft(client.contactInfo.email ?? "");
        setContactPhoneDraft(client.contactInfo.phone ?? "");
        setRecordingSaved(true);
      }
      if (client?.email) {
        setEmailDraft(client.email);
        setEmailSaved(true);
        if (
          client.note?.toLowerCase().includes("recording") ||
          loaded.messages.some(
            (m) =>
              m.clientId === chatId &&
              m.from === "client" &&
              m.body.startsWith("Recording email:"),
          )
        ) {
          setRecordingSaved(true);
        }
      }
      setReady(true);
    }

    void boot();
    const unsubscribe = subscribeSpace(
      slug,
      (next) => {
        if (!next) return;
        setSpace((prev) => {
          if (!prev) return next;
          // Keep optimistic messages until the server snapshot includes them.
          const ids = new Set(next.messages.map((m) => m.id));
          const extras = prev.messages.filter(
            (m) => m.clientId === chatId && !ids.has(m.id),
          );
          if (extras.length === 0) return next;
          const clientIds = new Set(next.clients.map((c) => c.id));
          const extraClients = prev.clients.filter(
            (c) => c.id === chatId && !clientIds.has(c.id),
          );
          return {
            ...next,
            clients: extraClients.length
              ? [...extraClients, ...next.clients]
              : next.clients,
            messages: [...next.messages, ...extras],
            deletedClientIds: (next.deletedClientIds ?? []).filter(
              (id) => id !== chatId,
            ),
          };
        });
      },
      {
        getChatId: () => chatId,
        threadOnly: true,
      },
    );

    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, [slug, chatId, preview, previewSpace]);

  const introMessages = useMemo(
    () => (space ? resolveChatIntroMessages(space.settings) : null),
    [space?.settings],
  );

  const thread = useMemo(() => {
    if (!space || !introMessages) return [];
    const stored = space.messages.filter((m) => m.clientId === chatId);
    if (!isSolutionEnabled(space.settings, "intro")) return stored;
    return ensureWelcomeMessages(
      stored,
      chatId,
      space.business.name,
      slug,
      introMessages,
    );
  }, [space, chatId, slug, introMessages]);
  const latestMessageId = thread.at(-1)?.id ?? "";

  const storedClient = space?.clients.find((c) => c.id === chatId);
  const client =
    preview && previewEnded
      ? {
          id: chatId,
          name: "Preview guest",
          status: "unknown" as const,
          channel: "web" as const,
          preview: "Chat ended",
          unread: 0,
          trade: space?.business.trade ?? "salon",
          lastActive: "Just now",
          chatEndedAt: new Date(0).toISOString(),
        }
      : storedClient;

  function isNearLatestMessage() {
    if (typeof window === "undefined") return true;
    if (isMobileClientChat()) {
      const doc = document.scrollingElement ?? document.documentElement;
      return doc.scrollHeight - window.scrollY - window.innerHeight < 140;
    }

    const el = scrollRef.current;
    if (!el) return true;
    return el.scrollHeight - el.scrollTop - el.clientHeight < 120;
  }

  function scrollToLatestMessages(behavior: ScrollBehavior = "smooth") {
    if (typeof window === "undefined") return;
    if (isMobileClientChat()) {
      window.scrollTo({
        top: document.documentElement.scrollHeight,
        behavior,
      });
      return;
    }

    const el = scrollRef.current;
    if (!el) return;
    el.scrollTo({ top: el.scrollHeight, behavior });
  }

  function scrollLatestMessageAboveComposer(behavior: ScrollBehavior = "smooth") {
    if (typeof window === "undefined") return;
    const rows = document.querySelectorAll<HTMLElement>(".chat-row[data-message-id]");
    const latestRow = rows[rows.length - 1];
    if (!latestRow) {
      scrollToLatestMessages(behavior);
      return;
    }

    const composerHeight = composerWrapRef.current?.getBoundingClientRect().height ?? 0;
    const visualViewportHeight = window.visualViewport?.height ?? window.innerHeight;
    const rowBottom = latestRow.getBoundingClientRect().bottom + window.scrollY;
    const targetTop = Math.max(
      0,
      rowBottom - visualViewportHeight + composerHeight + 14,
    );
    window.scrollTo({ top: targetTop, behavior });
  }

  function jumpToLatestMessages() {
    scrollToLatestMessages("smooth");
    isNearLatestRef.current = true;
    setNewMessageCount(0);
  }

  useEffect(() => {
    if (!ready || scrollToLatestSignal == null) return;

    let secondFrame = 0;
    const revealLatest = () => {
      const el = scrollRef.current;
      if (!el) return;
      el.scrollTo({ top: el.scrollHeight, behavior: "auto" });
      isNearLatestRef.current = true;
      setNewMessageCount(0);
    };
    const firstFrame = window.requestAnimationFrame(() => {
      revealLatest();
      secondFrame = window.requestAnimationFrame(revealLatest);
    });

    return () => {
      window.cancelAnimationFrame(firstFrame);
      if (secondFrame) window.cancelAnimationFrame(secondFrame);
    };
  }, [ready, scrollToLatestSignal]);

  useEffect(() => {
    let frame = 0;
    function updateNearLatest() {
      frame = 0;
      const near = isNearLatestMessage();
      isNearLatestRef.current = near;
      if (near) setNewMessageCount(0);
    }

    function scheduleUpdate() {
      if (frame) return;
      frame = window.requestAnimationFrame(updateNearLatest);
    }

    updateNearLatest();
    const el = scrollRef.current;
    el?.addEventListener("scroll", scheduleUpdate, { passive: true });
    window.addEventListener("scroll", scheduleUpdate, { passive: true });
    window.addEventListener("resize", scheduleUpdate, { passive: true });

    return () => {
      el?.removeEventListener("scroll", scheduleUpdate);
      window.removeEventListener("scroll", scheduleUpdate);
      window.removeEventListener("resize", scheduleUpdate);
      if (frame) window.cancelAnimationFrame(frame);
    };
  }, [embedded, preview]);

  useEffect(() => {
    const previous = previousThreadRef.current;
    const added = Math.max(0, thread.length - previous.length);
    const grew = added > 0 && latestMessageId !== previous.latestId;
    const firstLoad = previous.length === 0;
    previousThreadRef.current = { length: thread.length, latestId: latestMessageId };

    if (!thread.length) {
      setNewMessageCount(0);
      return;
    }

    if (pendingSendScrollRef.current && isMobileClientChat()) {
      pendingSendScrollRef.current = false;
      isNearLatestRef.current = true;
      setNewMessageCount(0);
      window.requestAnimationFrame(() => {
        scrollLatestMessageAboveComposer("smooth");
        window.setTimeout(() => scrollLatestMessageAboveComposer("auto"), 120);
      });
      return;
    }

    if (
      firstLoad ||
      (isNearLatestRef.current &&
        !(isMobileClientChat() && document.activeElement === messageInputRef.current))
    ) {
      window.requestAnimationFrame(() => scrollToLatestMessages("auto"));
      setNewMessageCount(0);
      return;
    }

    if (grew) {
      setNewMessageCount((count) => Math.min(99, count + added));
    }
  }, [latestMessageId, thread.length]);

  useEffect(() => {
    if (embedded || preview) return;

    function onTouchStart(event: TouchEvent) {
      if (!isMobileClientChat()) return;
      if (document.activeElement !== messageInputRef.current) return;
      const touch = event.touches[0];
      if (!touch) return;
      scrollDismissStartRef.current = { x: touch.clientX, y: touch.clientY };
    }

    function onTouchMove(event: TouchEvent) {
      const start = scrollDismissStartRef.current;
      if (!start || document.activeElement !== messageInputRef.current) return;
      const touch = event.touches[0];
      if (!touch) return;
      const dx = touch.clientX - start.x;
      const dy = touch.clientY - start.y;
      if (Math.abs(dy) <= 10 || Math.abs(dy) <= Math.abs(dx)) return;
      messageInputRef.current?.blur();
      scrollDismissStartRef.current = null;
    }

    function onTouchEnd() {
      scrollDismissStartRef.current = null;
    }

    document.addEventListener("touchstart", onTouchStart, { passive: true });
    document.addEventListener("touchmove", onTouchMove, { passive: true });
    document.addEventListener("touchend", onTouchEnd, { passive: true });
    document.addEventListener("touchcancel", onTouchEnd, { passive: true });

    return () => {
      document.removeEventListener("touchstart", onTouchStart);
      document.removeEventListener("touchmove", onTouchMove);
      document.removeEventListener("touchend", onTouchEnd);
      document.removeEventListener("touchcancel", onTouchEnd);
    };
  }, [embedded, preview]);

  useEffect(() => {
    function onFocusedImagePointerDown(event: PointerEvent) {
      const focusedId = actionsForRef.current;
      const target = event.target;
      if (!focusedId || !(target instanceof Element)) return;

      const focusedRow = target.closest(".chat-row[data-message-id]");
      const insideFocusedRow =
        focusedRow?.getAttribute("data-message-id") === focusedId;
      const onFocusedPhoto =
        insideFocusedRow &&
        Boolean(target.closest(".bubble-image-open, .bubble-fan-open"));
      const onFocusedActions =
        insideFocusedRow && Boolean(target.closest(".msg-action-bar"));
      if (onFocusedPhoto || onFocusedActions) return;

      focusDismissPointerRef.current = {
        x: event.clientX,
        y: event.clientY,
        until: Date.now() + 800,
      };
      clearLongPressTimer();
      setActionsFor(null);
      event.preventDefault();
      event.stopPropagation();
    }

    function onFocusedImageClick(event: globalThis.MouseEvent) {
      const dismissPointer = focusDismissPointerRef.current;
      focusDismissPointerRef.current = null;
      if (!dismissPointer || Date.now() > dismissPointer.until) return;
      const sameGesture =
        Math.hypot(
          event.clientX - dismissPointer.x,
          event.clientY - dismissPointer.y,
        ) < 12;
      if (!sameGesture) return;
      event.preventDefault();
      event.stopPropagation();
    }

    document.addEventListener("pointerdown", onFocusedImagePointerDown, true);
    document.addEventListener("click", onFocusedImageClick, true);
    return () => {
      document.removeEventListener("pointerdown", onFocusedImagePointerDown, true);
      document.removeEventListener("click", onFocusedImageClick, true);
    };
  }, []);

  useEffect(() => {
    if (!numberMenuOpen && !specialtiesMenuOpen) return;

    function onPointerDown(event: PointerEvent) {
      const target = event.target;
      if (!(target instanceof Node)) return;
      if (!numberMenuRef.current?.contains(target)) {
        setNumberMenuOpen(false);
      }
      if (!specialtiesMenuRef.current?.contains(target)) {
        setSpecialtiesMenuOpen(false);
      }
    }

    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [numberMenuOpen, specialtiesMenuOpen]);

  useEffect(() => {
    if (!actionsFor || !mobileActionsOnly()) return;
    const focusedMessage = thread.find((message) => message.id === actionsFor);
    const imageFocused =
      focusedMessage?.kind === "image" ||
      Boolean(focusedMessage?.imageUrl || focusedMessage?.imageUrls?.length);
    if (!imageFocused) return;

    function onTouchStart(event: TouchEvent) {
      const touch = event.touches[0];
      if (!touch) return;
      actionFocusTouchStartRef.current = { x: touch.clientX, y: touch.clientY };
    }

    function onTouchMove(event: TouchEvent) {
      const touch = event.touches[0];
      const start = actionFocusTouchStartRef.current;
      event.preventDefault();
      if (!touch || !start) return;

      const dx = touch.clientX - start.x;
      const dy = touch.clientY - start.y;
      if (dy > 18 && Math.abs(dy) > Math.abs(dx)) {
        actionFocusTouchStartRef.current = null;
        setActionsFor(null);
      }
    }

    function onTouchEnd() {
      actionFocusTouchStartRef.current = null;
    }

    document.addEventListener("touchstart", onTouchStart, { passive: true });
    document.addEventListener("touchmove", onTouchMove, { passive: false });
    document.addEventListener("touchend", onTouchEnd, { passive: true });
    document.addEventListener("touchcancel", onTouchEnd, { passive: true });

    return () => {
      document.removeEventListener("touchstart", onTouchStart);
      document.removeEventListener("touchmove", onTouchMove);
      document.removeEventListener("touchend", onTouchEnd);
      document.removeEventListener("touchcancel", onTouchEnd);
    };
  }, [actionsFor, thread]);

  // Tell the floor when this customer tab is open / interacting.
  useEffect(() => {
    if (preview) return;
    let cancelled = false;
    let timer: number | undefined;

    async function beat() {
      if (cancelled || document.visibilityState !== "visible") return;
      try {
        await beatPresence(slug, chatId);
      } catch {
        // ignore transient presence failures
      }
    }

    function schedule() {
      void beat();
      window.clearInterval(timer);
      timer = window.setInterval(() => void beat(), 15_000);
    }

    function onVisibility() {
      if (document.visibilityState === "visible") schedule();
      else window.clearInterval(timer);
    }

    schedule();
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("focus", schedule);

    return () => {
      cancelled = true;
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("focus", schedule);
    };
  }, [slug, chatId, preview]);

  useEffect(() => clearLongPressTimer, []);

  const guestLabel = client?.name ?? "Guest";

  async function sendInquiry(offering: Offering) {
    if (preview) return;
    const body = inquireMessageBody(offering);
    const msgId = inquireMessageId(chatId, offering.id);
    const presentAt = new Date().toISOString();
    const existing = space?.clients.find((c) => c.id === chatId);
    const nextClient: Client = existing
      ? {
          ...existing,
          preview: body,
          lastActive: "Just now",
          unread: existing.unread + 1,
          presentAt,
        }
      : {
          id: chatId,
          name: nextGuestName(space?.clients ?? []),
          status: "unknown",
          channel: "web",
          preview: body,
          unread: 1,
          trade: space?.business.trade ?? "salon",
          lastActive: "Just now",
          note: `Asked about ${offering.title}`,
          presentAt,
        };

    const message: Message = {
      id: msgId,
      clientId: chatId,
      from: "client",
      kind: "item",
      body,
      offeringId: offering.id,
      ...(offering.imageUrl ? { imageUrl: offering.imageUrl } : {}),
      ...messageTimeStamp(),
    };

    setSpace((current) => {
      if (!current) return current;
      const already = current.messages.some((m) => m.id === msgId);
      if (already) return current;
      const latestExisting = current.clients.find((c) => c.id === chatId);
      return {
        ...current,
        deletedClientIds: (current.deletedClientIds ?? []).filter(
          (id) => id !== chatId,
        ),
        clients: latestExisting
          ? [nextClient, ...current.clients.filter((c) => c.id !== chatId)]
          : [nextClient, ...current.clients],
        messages: [...current.messages, message],
      };
    });

    try {
      await appendMessage(slug, { message, client: nextClient });
      window.history.replaceState(null, "", `/${slug}/c/${chatId}`);
    } catch (err) {
      setSpace((current) => {
        if (!current) return current;
        return {
          ...current,
          messages: current.messages.filter((m) => m.id !== msgId),
        };
      });
      setSendError(
        err instanceof Error ? err.message : "Could not send. Try again.",
      );
    }
  }

  useEffect(() => {
    if (preview || inquireSent.current) return;
    if (!ready || !space || !inquireOfferingId) return;
    const offering = (space.offerings ?? []).find(
      (item) => item.id === inquireOfferingId,
    );
    if (!offering) {
      inquireSent.current = true;
      setSendError("This product or service isn’t listed anymore.");
      window.history.replaceState(null, "", `/${slug}/c/${chatId}`);
      return;
    }
    const msgId = inquireMessageId(chatId, offering.id);
    if (space.messages.some((m) => m.id === msgId)) {
      inquireSent.current = true;
      window.history.replaceState(null, "", `/${slug}/c/${chatId}`);
      return;
    }
    inquireSent.current = true;
    void sendInquiry(offering);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, space, inquireOfferingId, chatId, preview]);

  async function sendTextMessage(body: string, keepKeyboard = false) {
    if (preview) return;
    if (sending) return;
    if (!body.trim()) return;
    if (client?.chatEndedAt) return;
    if (!space) return;

    const trimmedBody = body.trim();
    const name = displayName.trim();
    const presentAt = new Date().toISOString();
    const selectedReason = contactReason?.trim() || "";
    setSendError(null);
    setSending(true);

    const message: Message = {
      id: `m-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      clientId: chatId,
      from: "client",
      kind: "text",
      body: trimmedBody,
      ...(replyTo
        ? { replyTo }
        : selectedReason
          ? {
              replyTo: {
                id: `contact-reason-${chatId}`,
                from: "client",
                kind: "text",
                preview: `Contact reason: ${selectedReason}`,
              },
            }
          : {}),
      ...messageTimeStamp(),
    };

    if (keepKeyboard) setSendAnimationMessageId(message.id);

    const existing = space.clients.find((c) => c.id === chatId);
    const nextClient: Client = existing
      ? {
          ...existing,
          name: name || existing.name,
          status: existing.status === "client" ? "client" : "unknown",
          preview: trimmedBody,
          lastActive: "Just now",
          unread: existing.unread + 1,
          presentAt,
        }
      : {
          id: chatId,
          name: name || nextGuestName(space.clients),
          status: "unknown",
          channel: "web",
          preview: trimmedBody,
          unread: 1,
          trade: space.business.trade,
          lastActive: "Just now",
          note: "Unique chat link",
          presentAt,
        };

    // Show instantly — don't wait on the network round-trip.
    setSpace({
      ...space,
      deletedClientIds: (space.deletedClientIds ?? []).filter(
        (id) => id !== chatId,
      ),
      clients: existing
        ? [nextClient, ...space.clients.filter((c) => c.id !== chatId)]
        : [nextClient, ...space.clients],
      messages: appendCustomerMessageWithAutoReply(
        space.messages,
        chatId,
        message,
        space.business.name,
        slug,
        introMessages!,
      ),
    });
    setDraft("");
    setReplyTo(null);
    setContactReason(null);
    if (keepKeyboard && isMobileComposerSession()) {
      pendingSendScrollRef.current = isMobileClientChat();
      setMobileComposerExpanded(true);
      requestAnimationFrame(() => messageInputRef.current?.focus());
    } else {
      setMobileComposerExpanded(false);
      messageInputRef.current?.blur();
    }

    try {
      await appendMessage(slug, {
        message,
        client: nextClient,
        clearDeleted: true,
      });
    } catch (err) {
      setSendError(
        err instanceof Error ? err.message : "Could not send. Try again.",
      );
    } finally {
      setSending(false);
    }
  }

  async function send(e: FormEvent) {
    e.preventDefault();
    await sendTextMessage(draft, true);
  }

  async function sendFaqQuestion(question: string) {
    setPlusMenuOpen(false);
    setFaqOpen(false);
    await sendTextMessage(question);
  }

  async function sendImage(file: File, source: "upload" | "camera" = "upload") {
    if (client?.chatEndedAt || sending) return;
    setAttaching(true);
    setSendError(null);
    try {
      const media =
        source === "camera"
          ? await readMediaFile(file, { imageMaxSize: 960, imageQuality: 0.58 })
          : await readMediaFile(file);
      if (media.kind !== "photo") {
        throw new Error("Pick an image file.");
      }

      const caption = draft.trim();
      const name = displayName.trim();
      const presentAt = new Date().toISOString();
      const selectedReason = contactReason?.trim() || "";
      setSending(true);

      const message: Message = {
        id: `m-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        clientId: chatId,
        from: "client",
        kind: "image",
        body: caption,
        imageUrl: media.url,
        ...(replyTo
          ? { replyTo }
          : selectedReason
            ? {
                replyTo: {
                  id: `contact-reason-${chatId}`,
                  from: "client",
                  kind: "text",
                  preview: `Contact reason: ${selectedReason}`,
                },
              }
            : {}),
        ...messageTimeStamp(),
      };

      const existing = space?.clients.find((c) => c.id === chatId);
      const preview = caption || "Photo";
      const nextClient: Client = existing
        ? {
            ...existing,
            name: name || existing.name,
            status: existing.status === "client" ? "client" : "unknown",
            preview,
            lastActive: "Just now",
            unread: existing.unread + 1,
            presentAt,
          }
        : {
            id: chatId,
            name: name || nextGuestName(space?.clients ?? []),
            status: "unknown",
            channel: "web",
            preview,
            unread: 1,
            trade: space?.business.trade ?? "salon",
            lastActive: "Just now",
            note: "Unique chat link",
            presentAt,
          };

      setSpace((current) =>
        current
          ? {
              ...current,
              deletedClientIds: (current.deletedClientIds ?? []).filter(
                (id) => id !== chatId,
              ),
              clients: current.clients.some((c) => c.id === chatId)
                ? [
                    nextClient,
                    ...current.clients.filter((c) => c.id !== chatId),
                  ]
                : [nextClient, ...current.clients],
              messages: appendCustomerMessageWithAutoReply(
                current.messages,
                chatId,
                message,
                current.business.name,
                current.business.slug,
                resolveChatIntroMessages(current.settings),
              ),
            }
          : current,
      );

      await appendMessage(slug, {
        message,
        client: nextClient,
        clearDeleted: true,
      });
      setDraft("");
      setReplyTo(null);
      setContactReason(null);
    } catch (err) {
      setSendError(
        err instanceof Error ? err.message : "Could not send photo.",
      );
    } finally {
      setAttaching(false);
      setSending(false);
      if (fileRef.current) fileRef.current.value = "";
      if (cameraRef.current) cameraRef.current.value = "";
    }
  }

  function reactToMessage(messageId: string, emoji: string) {
    if (client?.chatEndedAt || !space) return;
    const actor = { from: "client" as const };
    const prev = space.messages.find((m) => m.id === messageId)?.reactions;
    const nextReactions = toggleMessageReaction(prev, emoji, actor);
    setSpace({
      ...space,
      messages: space.messages.map((m) =>
        m.id === messageId ? { ...m, reactions: nextReactions } : m,
      ),
    });
    void toggleReaction(slug, { messageId, emoji, actor }).catch(() => {
      setSpace((cur) =>
        cur
          ? {
              ...cur,
              messages: cur.messages.map((m) =>
                m.id === messageId ? { ...m, reactions: prev } : m,
              ),
            }
          : cur,
      );
    });
  }

  function clearLongPressTimer() {
    if (longPressTimerRef.current == null) return;
    window.clearTimeout(longPressTimerRef.current);
    longPressTimerRef.current = null;
  }

  function mobileActionsOnly() {
    return window.matchMedia("(max-width: 640px) and ((hover: none) or (pointer: coarse))").matches;
  }

  function startMessageLongPress(
    e: ReactPointerEvent,
    messageId: string,
    interactive: boolean,
  ) {
    if (client?.chatEndedAt || !interactive) return;
    lastMessagePointerRef.current = e.pointerType;
    if (!mobileActionsOnly()) return;
    const target = e.target;
    if (
      target instanceof Element &&
      target.closest("a, button, input, textarea, select") &&
      !target.closest(".bubble-image-open, .bubble-fan-open")
    ) {
      return;
    }
    clearLongPressTimer();
    longPressOpenedRef.current = false;
    longPressStartRef.current = { x: e.clientX, y: e.clientY };
    longPressTimerRef.current = window.setTimeout(() => {
      longPressTimerRef.current = null;
      longPressOpenedRef.current = true;
      setActionsFor(messageId);
      navigator.vibrate?.(8);
    }, 430);
  }

  function moveMessageLongPress(e: ReactPointerEvent) {
    if (longPressTimerRef.current == null) return;
    const dx = Math.abs(e.clientX - longPressStartRef.current.x);
    const dy = Math.abs(e.clientY - longPressStartRef.current.y);
    if (dx > 10 || dy > 10) clearLongPressTimer();
  }

  async function requestLive() {
    if (!space || sending) return;
    const body = "Looking for a live response";
    const message: Message = {
      id: `m-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      clientId: chatId,
      from: "client",
      kind: "text",
      body,
      ...messageTimeStamp(),
    };
    const existing = space.clients.find((c) => c.id === chatId);
    const nextClient: Client = existing
      ? {
          ...existing,
          preview: body,
          lastActive: "Just now",
          unread: existing.unread + 1,
          note: existing.note?.includes("Live")
            ? existing.note
            : "Live request",
          presentAt: new Date().toISOString(),
        }
      : {
          id: chatId,
          name: displayName.trim() || nextGuestName(space.clients),
          status: "unknown",
          channel: "web",
          preview: body,
          unread: 1,
          trade: space.business.trade,
          lastActive: "Just now",
          note: "Live request",
          presentAt: new Date().toISOString(),
        };

    setSpace({
      ...space,
      deletedClientIds: (space.deletedClientIds ?? []).filter(
        (id) => id !== chatId,
      ),
      clients: existing
        ? [nextClient, ...space.clients.filter((c) => c.id !== chatId)]
        : [nextClient, ...space.clients],
      messages: appendCustomerMessageWithAutoReply(
        space.messages,
        chatId,
        message,
        space.business.name,
        space.business.slug,
        resolveChatIntroMessages(space.settings),
      ),
    });

    try {
      await appendMessage(slug, {
        message,
        client: nextClient,
        clearDeleted: true,
      });
    } catch (err) {
      setSendError(
        err instanceof Error ? err.message : "Could not send request.",
      );
    }
  }

  async function requestPromo() {
    setNumberMenuOpen(false);
    setSpecialtiesMenuOpen(false);
    await sendQuickRequest(
      "I'd like to see today's promotions.",
      "Promo request",
    );
  }

  async function copyReturnLink(path: string) {
    const url = path.startsWith("http")
      ? path
      : `${window.location.origin}${path}`;
    try {
      await navigator.clipboard.writeText(url);
      setCopiedReturnLink(true);
      window.setTimeout(() => setCopiedReturnLink(false), 1600);
    } catch {
      // ignore
    }
  }

  async function emailReturnLink(e: FormEvent) {
    e.preventDefault();
    const email = emailDraft.trim();
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return;
    setLinkEmailError(null);
    setLinkEmailSending(true);

    try {
      const next = await patchSpace(slug, (latest) => {
        const existing = latest.clients.find((c) => c.id === chatId);
        const body = `Email this chat link to me: ${email}`;
        const alreadyNoted = latest.messages.some(
          (m) =>
            m.clientId === chatId &&
            m.from === "client" &&
            m.body.startsWith("Email this chat link to me:"),
        );
        const noteBase = existing?.note?.includes("Chat link email")
          ? existing.note
          : [existing?.note, "Chat link email"].filter(Boolean).join(" · ");
        const nextClient: Client = existing
          ? {
              ...existing,
              email,
              note: noteBase || "Chat link email",
              preview: body,
              lastActive: "Just now",
              unread: alreadyNoted ? existing.unread : existing.unread + 1,
            }
          : {
              id: chatId,
              name: displayName.trim() || nextGuestName(latest.clients),
              status: "unknown",
              channel: "web",
              preview: body,
              unread: 1,
              trade: latest.business.trade,
              lastActive: "Just now",
              note: "Chat link email",
              email,
            };

        return {
          ...latest,
          deletedClientIds: (latest.deletedClientIds ?? []).filter(
            (id) => id !== chatId,
          ),
          clients: existing
            ? latest.clients.map((c) => (c.id === chatId ? nextClient : c))
            : [nextClient, ...latest.clients],
          messages: alreadyNoted
            ? latest.messages.map((m) =>
                m.clientId === chatId &&
                m.from === "client" &&
                m.body.startsWith("Email this chat link to me:")
                  ? { ...m, body, ...messageTimeStamp() }
                  : m,
              )
            : [
                ...latest.messages,
                {
                  id: `m-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
                  clientId: chatId,
                  from: "client" as const,
                  kind: "text" as const,
                  body,
                  ...messageTimeStamp(),
                },
              ],
        };
      });
      setSpace(next);
      setEmailSaved(true);
      await sendSpaceEmail(slug, {
        kind: "chat_link",
        chatId,
        email,
        origin: window.location.origin,
      });
      setLinkEmailSent(true);
    } catch (err) {
      setLinkEmailError(
        err instanceof Error ? err.message : "Could not send that email.",
      );
    } finally {
      setLinkEmailSending(false);
    }
  }

  function pickDepartment(n: number, closeMenu: () => void) {
    const department = currentDepartments(space?.settings)[n - 1];
    const selectedReason =
      introMessages?.contactReasonOptions[n - 1]?.trim() || `Option ${n}`;
    setSelectedNumber(n);
    setContactReason(selectedReason);
    setDepartmentDraft(department.message);
    setDepartmentDraftAttachments(department.attachments);
    if (!draft.trim()) {
      setDraft("Here are a few more details: ");
    }
    if (sendError) setSendError(null);
    closeMenu();
    if (departmentHasContent(department)) {
      void sendDepartmentContent(n, department, selectedReason, {
        includeReason: false,
      });
    }
  }

  function currentDepartments(spaceSettings?: FloorSettings) {
    return normalizeDepartments(
      spaceSettings?.departments,
      spaceSettings?.departmentMessages,
    );
  }

  async function attachDepartmentMessage() {
    if (selectedNumber == null || departmentSaving) return;
    setDepartmentSaving(true);
    setSendError(null);
    try {
      const next = await patchSpace(slug, (latest) => {
        const departments = currentDepartments(latest.settings);
        departments[selectedNumber - 1] = {
          message: departmentDraft.trim(),
          attachments: departmentDraftAttachments,
        };
        return {
          ...latest,
          settings: {
            ...latest.settings,
            departments,
            departmentMessages: departments.map((d) => d.message),
          },
        };
      });
      setSpace(next);
    } catch (err) {
      setSendError(
        err instanceof Error ? err.message : "Could not attach message.",
      );
    } finally {
      setDepartmentSaving(false);
    }
  }

  async function addDepartmentFiles(fileList: FileList | null) {
    if (!fileList?.length || selectedNumber == null) return;
    const remaining =
      MAX_DEPARTMENT_ATTACHMENTS - departmentDraftAttachments.length;
    if (remaining <= 0) {
      setSendError(`You can add up to ${MAX_DEPARTMENT_ATTACHMENTS} files.`);
      return;
    }
    setDepartmentSaving(true);
    setSendError(null);
    try {
      const added: DepartmentAttachment[] = [];
      for (const file of Array.from(fileList).slice(0, remaining)) {
        const media = await readAttachmentFile(file);
        added.push({
          id: `att-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
          kind: media.kind,
          name: media.name,
          url: media.url,
        });
      }
      setDepartmentDraftAttachments((prev) => [...prev, ...added]);
    } catch (err) {
      setSendError(
        err instanceof Error ? err.message : "Could not add file.",
      );
    } finally {
      setDepartmentSaving(false);
      if (departmentImageRef.current) departmentImageRef.current.value = "";
      if (departmentDocRef.current) departmentDocRef.current.value = "";
    }
  }

  async function sendDepartmentContent(
    departmentNumber: number,
    content: DepartmentContent,
    reasonLabel?: string,
    options: { includeReason?: boolean } = {},
  ) {
    if (client?.chatEndedAt || sending) return;
    const contactReason =
      reasonLabel?.trim() || `Option ${departmentNumber}`;
    const text = content.message.trim();
    const includeReason = options.includeReason ?? true;
    if (!includeReason && !text && content.attachments.length === 0) return;

    setSending(true);
    setSendError(null);
    try {
      const next = await patchSpace(slug, (latest) => {
        const stamp = messageTimeStamp();
        const outgoing: Message[] = [];
        if (includeReason) {
          outgoing.push({
            id: `m-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
            clientId: chatId,
            from: "client",
            kind: "text",
            body: `I’m reaching out for: ${contactReason}`,
            ...stamp,
          });
        }
        if (text) {
          outgoing.push({
            id: `m-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
            clientId: chatId,
            from: "client",
            kind: "text",
            body: text,
            ...stamp,
          });
        }
        for (const attachment of content.attachments) {
          outgoing.push(
            attachment.kind === "image"
              ? {
                  id: `m-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
                  clientId: chatId,
                  from: "client",
                  kind: "image",
                  body: attachment.name,
                  imageUrl: attachment.url,
                  ...stamp,
                }
              : {
                  id: `m-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
                  clientId: chatId,
                  from: "client",
                  kind: "link",
                  body: attachment.name,
                  linkUrl: attachment.url,
                  ...stamp,
                },
          );
        }

        const preview =
          text ||
          content.attachments[0]?.name ||
          contactReason;
        const existing = latest.clients.find((c) => c.id === chatId);
        const nextClient: Client = existing
          ? {
              ...existing,
              name: displayName.trim() || existing.name,
              preview,
              lastActive: "Just now",
              unread: existing.unread + outgoing.length,
              note: existing.note?.includes(contactReason)
                ? existing.note
                : contactReason,
              presentAt: new Date().toISOString(),
            }
          : {
              id: chatId,
              name: displayName.trim() || nextGuestName(latest.clients),
              status: "unknown",
              channel: "web",
              preview,
              unread: outgoing.length,
              trade: latest.business.trade,
              lastActive: "Just now",
              note: contactReason,
              presentAt: new Date().toISOString(),
            };

        let messages = latest.messages;
        for (const message of outgoing) {
          messages = appendCustomerMessageWithAutoReply(
            messages,
            chatId,
            message,
            latest.business.name,
            latest.business.slug,
            resolveChatIntroMessages(latest.settings),
          );
        }

        return {
          ...latest,
          deletedClientIds: (latest.deletedClientIds ?? []).filter(
            (id) => id !== chatId,
          ),
          clients: existing
            ? latest.clients.map((c) => (c.id === chatId ? nextClient : c))
            : [nextClient, ...latest.clients],
          messages,
        };
      });
      setSpace(next);
    } catch (err) {
      setSendError(
        err instanceof Error ? err.message : "Could not send request.",
      );
    } finally {
      setSending(false);
    }
  }

  async function sendQuickRequest(body: string, note: string) {
    if (client?.chatEndedAt || sending || !space) return;
    setSending(true);
    setSendError(null);
    try {
      const existing = space.clients.find((c) => c.id === chatId);
      const message: Message = {
        id: `m-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        clientId: chatId,
        from: "client",
        kind: "text",
        body,
        ...messageTimeStamp(),
      };
      const nextClient: Client = existing
        ? {
            ...existing,
            name: displayName.trim() || existing.name,
            preview: body,
            lastActive: "Just now",
            unread: existing.unread + 1,
            note: existing.note?.includes(note) ? existing.note : note,
            presentAt: new Date().toISOString(),
          }
        : {
            id: chatId,
            name: displayName.trim() || nextGuestName(space.clients),
            status: "unknown",
            channel: "web",
            preview: body,
            unread: 1,
            trade: space.business.trade,
            lastActive: "Just now",
            note,
            presentAt: new Date().toISOString(),
          };

      setSpace({
        ...space,
        deletedClientIds: (space.deletedClientIds ?? []).filter(
          (id) => id !== chatId,
        ),
        clients: existing
          ? [nextClient, ...space.clients.filter((c) => c.id !== chatId)]
          : [nextClient, ...space.clients],
        messages: appendCustomerMessageWithAutoReply(
          space.messages,
          chatId,
          message,
          space.business.name,
          space.business.slug,
          resolveChatIntroMessages(space.settings),
        ),
      });

      await appendMessage(slug, {
        message,
        client: nextClient,
        clearDeleted: true,
      });
    } catch (err) {
      setSendError(
        err instanceof Error ? err.message : "Could not send request.",
      );
    } finally {
      setSending(false);
    }
  }

  async function saveEmail(e: FormEvent) {
    e.preventDefault();
    const email = emailDraft.trim();
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return;

    const next = await patchSpace(slug, (latest) => {
      const existing = latest.clients.find((c) => c.id === chatId);
      const body = `Email for reply: ${email}`;
      const alreadyNoted = latest.messages.some(
        (m) =>
          m.clientId === chatId &&
          m.from === "client" &&
          m.body.startsWith("Email for reply:"),
      );

      const noteBase = existing?.note?.includes("Email")
        ? existing.note
        : [existing?.note, "Left email"].filter(Boolean).join(" · ");

      const nextClient: Client = existing
        ? {
            ...existing,
            email,
            note: noteBase || "Left email",
            preview: body,
            lastActive: "Just now",
            unread: alreadyNoted ? existing.unread : existing.unread + 1,
          }
        : {
            id: chatId,
            name: displayName.trim() || nextGuestName(latest.clients),
            status: "unknown",
            channel: "web",
            preview: body,
            unread: 1,
            trade: latest.business.trade,
            lastActive: "Just now",
            note: "Left email",
            email,
          };

      return {
        ...latest,
        deletedClientIds: (latest.deletedClientIds ?? []).filter(
          (id) => id !== chatId,
        ),
        clients: existing
          ? latest.clients.map((c) => (c.id === chatId ? nextClient : c))
          : [nextClient, ...latest.clients],
        messages: alreadyNoted
          ? latest.messages.map((m) =>
              m.clientId === chatId &&
              m.from === "client" &&
              m.body.startsWith("Email for reply:")
                ? { ...m, body, ...messageTimeStamp() }
                : m,
            )
          : [
              ...latest.messages,
              {
                id: `m-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
                clientId: chatId,
                from: "client" as const,
                kind: "text" as const,
                body,
                ...messageTimeStamp(),
              },
            ],
      };
    });

    setSpace(next);
    setEmailSaved(true);
  }

  async function saveStaffOutIntake(e: FormEvent) {
    e.preventDefault();
    const name = displayName.trim();
    const email = emailDraft.trim();
    const phone = intakePhoneDraft.trim();
    const reason = intakeReasonDraft.trim();
    const details = intakeDetailsDraft.trim();
    if (!name || (!email && !phone)) return;
    if (staffOutIntake.askReason && !reason) return;
    if (staffOutIntake.askDetails && !details) return;
    if (staffOutIntake.askConsent && !intakeConsent) return;

    const contactParts = [
      `Name: ${name}`,
      email ? `Email: ${email}` : "",
      phone ? `Phone: ${phone}` : "",
      staffOutIntake.askPreferredContact
        ? `Prefers: ${intakePreferredContact}`
        : "",
      staffOutIntake.askUrgency ? `Urgency: ${intakeUrgency}` : "",
      reason ? `Reason: ${reason}` : "",
      details ? `Details: ${details}` : "",
      staffOutIntake.askConsent ? "Consented to follow-up" : "",
    ].filter(Boolean);
    const body = `Staff-out intake: ${contactParts.join(" · ")}`;

    const next = await patchSpace(slug, (latest) => {
      const existing = latest.clients.find((c) => c.id === chatId);
      const alreadyNoted = latest.messages.some(
        (m) =>
          m.clientId === chatId &&
          m.from === "client" &&
          m.body.startsWith("Staff-out intake:"),
      );
      const noteBase = existing?.note?.toLowerCase().includes("staff-out intake")
        ? existing.note
        : [existing?.note, "Staff-out intake"].filter(Boolean).join(" · ");
      const staffOutIntakePayload = {
        name,
        ...(email ? { email } : {}),
        ...(phone ? { phone } : {}),
        ...(reason ? { reason } : {}),
        ...(staffOutIntake.askUrgency ? { urgency: intakeUrgency } : {}),
        ...(staffOutIntake.askPreferredContact
          ? { preferredContact: intakePreferredContact }
          : {}),
        ...(details ? { details } : {}),
        consent: staffOutIntake.askConsent ? intakeConsent : true,
        source: "staff_out" as const,
        collectedAt: new Date().toISOString(),
      };
      const collectedContact = {
        id: `staff_out:${chatId}`,
        chatId,
        chatName: name,
        name,
        ...(email ? { email } : {}),
        ...(phone ? { phone } : {}),
        source: "staff_out" as const,
        ...(existing?.caseId ? { caseId: existing.caseId } : {}),
        collectedAt: staffOutIntakePayload.collectedAt,
      };

      const nextClient: Client = existing
        ? {
            ...existing,
            name,
            ...(email ? { email } : {}),
            staffOutIntake: staffOutIntakePayload,
            contactInfo: {
              name,
              ...(email ? { email } : {}),
              ...(phone ? { phone } : {}),
              source: "staff_out",
              collectedAt: staffOutIntakePayload.collectedAt,
            },
            note: noteBase || "Staff-out intake",
            preview: body,
            lastActive: "Just now",
            unread: alreadyNoted ? existing.unread : existing.unread + 1,
            presentAt: new Date().toISOString(),
          }
        : {
            id: chatId,
            name,
            status: "unknown",
            channel: "web",
            preview: body,
            unread: 1,
            trade: latest.business.trade,
            lastActive: "Just now",
            note: "Staff-out intake",
            ...(email ? { email } : {}),
            staffOutIntake: staffOutIntakePayload,
            contactInfo: {
              name,
              ...(email ? { email } : {}),
              ...(phone ? { phone } : {}),
              source: "staff_out",
              collectedAt: staffOutIntakePayload.collectedAt,
            },
            presentAt: new Date().toISOString(),
          };

      return {
        ...latest,
        deletedClientIds: (latest.deletedClientIds ?? []).filter(
          (id) => id !== chatId,
        ),
        clients: existing
          ? latest.clients.map((c) => (c.id === chatId ? nextClient : c))
          : [nextClient, ...latest.clients],
        collectedContacts: [
          ...(latest.collectedContacts ?? []).filter(
            (contact) => contact.id !== collectedContact.id,
          ),
          collectedContact,
        ],
        messages: alreadyNoted
          ? latest.messages.map((m) =>
              m.clientId === chatId &&
              m.from === "client" &&
              m.body.startsWith("Staff-out intake:")
                ? { ...m, body, ...messageTimeStamp() }
                : m,
            )
          : [
              ...latest.messages,
              {
                id: `m-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
                clientId: chatId,
                from: "client" as const,
                kind: "text" as const,
                body,
                ...messageTimeStamp(),
              },
            ],
      };
    });

    setSpace(next);
    setIntakeSaved(true);
    if (email) setEmailSaved(true);
  }

  async function saveEndScreenContact(e: FormEvent) {
    e.preventDefault();
    const name = contactNameDraft.trim();
    const email = contactEmailDraft.trim();
    const phone = contactPhoneDraft.trim();
    if (!name) return;
    if (endScreen.collectEmail && !email) return;
    if (endScreen.collectPhone && !phone) return;
    const contactParts = [
      `Name: ${name}`,
      email ? `Email: ${email}` : "",
      phone ? `Phone: ${phone}` : "",
    ].filter(Boolean);

    const next = await patchSpace(slug, (latest) => {
      const existing = latest.clients.find((c) => c.id === chatId);
      const body = `End screen contact: ${contactParts.join(" · ")}`;
      const alreadyNoted = latest.messages.some(
        (m) =>
          m.clientId === chatId &&
          m.from === "client" &&
          m.body.startsWith("End screen contact:"),
      );

      const noteBase = existing?.note?.toLowerCase().includes("end screen contact")
        ? existing.note
        : [existing?.note, "End screen contact"].filter(Boolean).join(" · ");
      const collectedAt = new Date().toISOString();
      const collectedContact = {
        id: `end_screen:${chatId}`,
        chatId,
        chatName: (existing?.name ?? displayName.trim()) || name,
        name,
        ...(email ? { email } : {}),
        ...(phone ? { phone } : {}),
        source: "end_screen" as const,
        ...(existing?.caseId ? { caseId: existing.caseId } : {}),
        collectedAt,
      };

      const nextClient: Client = existing
        ? {
            ...existing,
            ...(email ? { email } : {}),
            contactInfo: {
              name,
              ...(email ? { email } : {}),
              ...(phone ? { phone } : {}),
              source: "end_screen",
              collectedAt,
            },
            note: noteBase || "End screen contact",
            preview: body,
            lastActive: "Just now",
            unread: alreadyNoted ? existing.unread : existing.unread + 1,
          }
        : {
            id: chatId,
            name: displayName.trim() || nextGuestName(latest.clients),
            status: "unknown",
            channel: "web",
            preview: body,
            unread: 1,
            trade: latest.business.trade,
            lastActive: "Just now",
            note: "End screen contact",
            ...(email ? { email } : {}),
            contactInfo: {
              name,
              ...(email ? { email } : {}),
              ...(phone ? { phone } : {}),
              source: "end_screen",
              collectedAt,
            },
            chatEndedAt: new Date().toISOString(),
          };

      return {
        ...latest,
        deletedClientIds: (latest.deletedClientIds ?? []).filter(
          (id) => id !== chatId,
        ),
        clients: existing
          ? latest.clients.map((c) => (c.id === chatId ? nextClient : c))
          : [nextClient, ...latest.clients],
        collectedContacts: [
          ...(latest.collectedContacts ?? []).filter(
            (contact) => contact.id !== collectedContact.id,
          ),
          collectedContact,
        ],
        messages: alreadyNoted
          ? latest.messages.map((m) =>
              m.clientId === chatId &&
              m.from === "client" &&
              m.body.startsWith("End screen contact:")
                ? { ...m, body, ...messageTimeStamp() }
                : m,
            )
          : [
              ...latest.messages,
              {
                id: `m-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
                clientId: chatId,
                from: "client" as const,
                kind: "text" as const,
                body,
                ...messageTimeStamp(),
              },
            ],
      };
    });

    setSpace(next);
    setRecordingSaved(true);
    setEmailDraft(email);
    if (email) setEmailSaved(true);
  }

  if (!ready) {
    return <div className="client-chat-loading">Loading…</div>;
  }

  if (!space) {
    return (
      <div className="client-missing">
        <p className="brand-name">OTGF</p>
        <h1>Nothing here</h1>
        <p>This chat link isn&apos;t set up yet.</p>
        <Link href="/">Create a space</Link>
      </div>
    );
  }

  const settings = space.settings;
  const banners = isSolutionEnabled(settings, "shoutouts")
    ? settings.banners.filter((b) => b.enabled && b.text.trim())
    : [];
  const hoursLabel = isSolutionEnabled(settings, "hours")
    ? formatResponseWindows(settings.windows)
    : "";
  const hoursNote = isSolutionEnabled(settings, "hours")
    ? settings.responseNote
    : "";
  const chatEndImages = isSolutionEnabled(settings, "chatInterface")
    ? (settings.chatEndImages ?? []).slice(0, 6)
    : [];
  const endScreen = settings.endScreenBehavior;
  const staffOutIntake = settings.staffOutIntake;
  const intakeSteps: StaffOutIntakeStep[] = ["contact"];
  if (staffOutIntake.askReason || staffOutIntake.askDetails) {
    intakeSteps.push("request");
  }
  if (
    staffOutIntake.askUrgency ||
    staffOutIntake.askPreferredContact ||
    staffOutIntake.askConsent
  ) {
    intakeSteps.push("followup");
  }
  const intakeStepIndex = Math.min(intakeStep, intakeSteps.length - 1);
  const currentIntakeStep = intakeSteps[intakeStepIndex];
  const intakeContactComplete = Boolean(
    displayName.trim() && (emailDraft.trim() || intakePhoneDraft.trim()),
  );
  const introText = isSolutionEnabled(settings, "intro")
    ? (settings.intro ?? "").trim()
    : "";
  const profileLinks = (settings.profileLinks ?? []).filter(
    (link) => link.label.trim() && link.url.trim(),
  );
  const showSpecialties = isSolutionEnabled(settings, "specialties");
  const showPromos = isSolutionEnabled(settings, "promos");
  const showDepartmentActions =
    showSpecialties && currentDepartments(settings).some(departmentHasContent);
  const showPromoActions = showPromos && banners.length > 0;
  const chatEnded = Boolean(client?.chatEndedAt);
  const isAway = !settings.live && !chatEnded;
  const chatLinkEmailOn = settings.emailAlerts?.customerChatLink !== false;
  const awayCopy =
    settings.awayMessage?.trim() ||
    "We're not available right now. Leave your email and we'll reply to your question.";
  const savedEmail = client?.email ?? (emailSaved ? emailDraft.trim() : "");
  const savedIntakeName = intakeSaved
    ? client?.staffOutIntake?.name || displayName.trim()
    : "";
  const savedContact =
    client?.contactInfo?.name ||
    client?.email ||
    (recordingSaved
      ? contactNameDraft.trim() ||
        contactEmailDraft.trim() ||
        contactPhoneDraft.trim()
      : "");
  const endScreenCtaHref = externalHref(endScreen.ctaUrl);
  const staffOutNextStepHref = externalHref(staffOutIntake.nextStepUrl);
  const members = space.members ?? [];
  const soleMember = members.length === 1 ? members[0] : undefined;
  const chatOwner = client?.ownerMemberId
    ? members.find((m) => m.id === client.ownerMemberId)
    : soleMember;
  const latestStaff = [...thread]
    .reverse()
    .find((m) => m.from === "business" && (m.fromName || m.fromMemberId));
  const chattingWith =
    (latestStaff?.fromName?.trim() ||
      (latestStaff?.fromMemberId
        ? members.find((m) => m.id === latestStaff.fromMemberId)?.name
        : undefined) ||
      chatOwner?.name ||
      "") || "";

  const head = (
    <header className="client-chat-head">
      <div className="client-chat-head-main">
        <div className="client-chat-title-row">
          {settings.logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={settings.logoUrl}
              alt=""
              className="client-brand-logo"
            />
          ) : null}
          <h1>{space.business.name}</h1>
        </div>
        {chattingWith || hoursLabel || hoursNote ? (
          <p className="client-chat-sub">
            {chattingWith ? (
              <>
                With <strong>{chattingWith}</strong>
              </>
            ) : null}
            {chattingWith && (hoursLabel || hoursNote)
              ? " · "
              : null}
            {hoursLabel || null}
            {hoursNote
              ? `${hoursLabel ? " · " : ""}${hoursNote}`
              : null}
          </p>
        ) : null}
      </div>
      <div className="client-chat-head-actions">
        {settings.live ? (
          <button
            type="button"
            className="client-live-btn is-live"
            onClick={() => void requestLive()}
          >
            <span className="floor-live-dot" aria-hidden />
            Live
          </button>
        ) : (
          <span className="client-away-badge">Away</span>
        )}
      </div>
    </header>
  );

  const profileBlock = introText || profileLinks.length > 0 ? (
    <div className="client-profile-block">
      {introText ? <p className="client-chat-intro">{introText}</p> : null}
      {profileLinks.length > 0 ? (
        <nav className="client-profile-links" aria-label="Links">
          {profileLinks.map((link) =>
            preview ? (
              <span key={link.id} className="client-profile-link">
                {link.label}
              </span>
            ) : (
              <InAppLink
                key={link.id}
                className="client-profile-link"
                href={link.url}
              >
                {link.label}
              </InAppLink>
            ),
          )}
        </nav>
      ) : null}
    </div>
  ) : null;

  const quickActions = !chatEnded && (showDepartmentActions || showPromoActions) ? (
    <div className="client-quick-actions">
      <div className="client-away-actions">
        {showDepartmentActions ? (
        <div className="client-number-dropdown" ref={numberMenuRef}>
          <button
            type="button"
            className="client-book-consult-btn client-number-dropdown-trigger"
            aria-haspopup="listbox"
            aria-expanded={numberMenuOpen}
            onClick={() => setNumberMenuOpen((open) => !open)}
          >
            {selectedNumber != null
              ? `Department ${selectedNumber}`
              : "Departments"}
          </button>
          {numberMenuOpen ? (
            <ul className="client-number-dropdown-list" role="listbox">
              {Array.from({ length: 20 }, (_, i) => i + 1).map((n) => {
                const department = currentDepartments(settings)[n - 1];
                const attached = departmentHasContent(department);
                return (
                  <li
                    key={n}
                    role="none"
                    className={n === 1 ? "client-number-row" : undefined}
                  >
                    <button
                      type="button"
                      role="option"
                      aria-selected={selectedNumber === n}
                      className={
                        [
                          selectedNumber === n ? "is-selected" : "",
                          attached ? "has-message" : "",
                        ]
                          .filter(Boolean)
                          .join(" ") || undefined
                      }
                      onClick={() =>
                        pickDepartment(n, () => setNumberMenuOpen(false))
                      }
                    >
                      {n}
                    </button>
                    {n === 1 && showPromoActions ? (
                      <button
                        type="button"
                        className="client-promo-btn"
                        onClick={() => void requestPromo()}
                        disabled={sending}
                      >
                        Promo
                      </button>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          ) : null}
        </div>
        ) : null}
        {showPromoActions && !showDepartmentActions ? (
          <button
            type="button"
            className="client-book-consult-btn"
            onClick={() => void requestPromo()}
            disabled={sending}
          >
            Today&apos;s promotions
          </button>
        ) : null}
      </div>
      {showDepartmentActions && selectedNumber != null ? (
        <form
          className="client-department-attach"
          onSubmit={(e) => {
            e.preventDefault();
            void attachDepartmentMessage();
          }}
        >
          <label className="composer-field">
            <span className="sr-only">
              Message for department {selectedNumber}
            </span>
            <textarea
              value={departmentDraft}
              onChange={(e) => setDepartmentDraft(e.target.value)}
              placeholder={`Attach a message to department ${selectedNumber}…`}
              rows={3}
            />
          </label>
          {departmentDraftAttachments.length > 0 ? (
            <ul className="client-department-files">
              {departmentDraftAttachments.map((file) => (
                <li key={file.id} className="client-department-file">
                  {file.kind === "image" ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={file.url} alt="" />
                  ) : (
                    <span className="client-department-file-doc">PDF</span>
                  )}
                  <span className="client-department-file-name">{file.name}</span>
                  <button
                    type="button"
                    className="client-department-file-remove"
                    aria-label={`Remove ${file.name}`}
                    onClick={() =>
                      setDepartmentDraftAttachments((prev) =>
                        prev.filter((item) => item.id !== file.id),
                      )
                    }
                  >
                    ×
                  </button>
                </li>
              ))}
            </ul>
          ) : null}
          <div className="client-department-attach-actions">
            <input
              ref={departmentImageRef}
              type="file"
              accept="image/*"
              multiple
              className="sr-only"
              id="department-attach-image"
              onChange={(e) => void addDepartmentFiles(e.target.files)}
            />
            <input
              ref={departmentDocRef}
              type="file"
              accept=".pdf,.doc,.docx,.txt,.rtf,application/pdf,text/plain"
              multiple
              className="sr-only"
              id="department-attach-doc"
              onChange={(e) => void addDepartmentFiles(e.target.files)}
            />
            <label
              htmlFor="department-attach-image"
              className="client-department-file-btn"
            >
              Add images
            </label>
            <label
              htmlFor="department-attach-doc"
              className="client-department-file-btn"
            >
              Add documents
            </label>
            <button
              type="submit"
              className="btn-solid client-away-submit"
              disabled={departmentSaving}
            >
              {departmentSaving ? "Saving…" : "Attach"}
            </button>
          </div>
        </form>
      ) : null}
    </div>
  ) : null;

  return (
    <LinkSheetProvider>
    <div
      className={`client-chat${embedded || preview ? " is-embedded" : ""}${
        preview ? " is-preview" : ""
      }${actionsFor ? " has-message-focus" : ""}${isAway ? " is-away" : ""}`}
    >
      <div
        className={`client-chat-top ${settings.brandBannerUrl ? "has-brand-banner" : ""}`}
      >
        {settings.brandBannerUrl ? (
          <div className="client-brand-hero">
            <div className="client-brand-banner" aria-hidden>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={settings.brandBannerUrl} alt="" />
            </div>
            {head}
          </div>
        ) : (
          head
        )}

        {chatEnded && endScreen.kind !== "none" ? (
          <div className="client-away-panel client-ended-panel" role="status">
            <p className="client-away-title">{endScreen.title}</p>
            <p className="client-away-copy">{endScreen.body}</p>
            {endScreen.kind === "record_contact" ? (
              recordingSaved && savedContact ? (
                <p className="client-away-saved">
                  Got it — we saved <strong>{savedContact}</strong>
                  <button
                    type="button"
                    className="client-away-edit"
                    onClick={() => setRecordingSaved(false)}
                  >
                    Change
                  </button>
                </p>
              ) : (
                <form
                  className="client-away-form"
                  onSubmit={(e) => void saveEndScreenContact(e)}
                >
                  <label className="composer-field">
                    <span className="sr-only">Name</span>
                    <input
                      type="text"
                      value={contactNameDraft}
                      onChange={(e) => setContactNameDraft(e.target.value)}
                      placeholder="Name"
                      required
                      autoComplete="name"
                    />
                  </label>
                  {endScreen.collectEmail ? (
                    <label className="composer-field">
                      <span className="sr-only">Email</span>
                      <input
                        type="email"
                        value={contactEmailDraft}
                        onChange={(e) => setContactEmailDraft(e.target.value)}
                        placeholder="Email"
                        required
                        autoComplete="email"
                      />
                    </label>
                  ) : null}
                  {endScreen.collectPhone ? (
                    <label className="composer-field">
                      <span className="sr-only">Phone</span>
                      <input
                        type="tel"
                        value={contactPhoneDraft}
                        onChange={(e) => setContactPhoneDraft(e.target.value)}
                        placeholder="Phone number"
                        required
                        autoComplete="tel"
                      />
                    </label>
                  ) : null}
                  <button type="submit" className="btn-solid client-away-submit">
                    {endScreen.submitLabel}
                  </button>
                </form>
              )
            ) : null}
            {endScreen.kind === "offer" && endScreen.offerCode ? (
              <div className="client-end-offer-code">
                <span>Code</span>
                <strong>{endScreen.offerCode}</strong>
              </div>
            ) : null}
            {(endScreen.kind === "offer" ||
              endScreen.kind === "book_follow_up" ||
              endScreen.kind === "review") &&
            endScreenCtaHref ? (
              <InAppLink
                className="btn-solid client-end-cta"
                href={endScreenCtaHref}
              >
                {endScreen.ctaLabel}
              </InAppLink>
            ) : null}
          </div>
        ) : isAway && awaySurfaceRoot ? createPortal(
          <section
            className={`client-away-panel${staffOutIntake.enabled ? " is-intake-flow" : ""}`}
            aria-label="Away message"
          >
            {staffOutIntake.enabled ? (
              <>
                <h2 className="client-away-title">{staffOutIntake.title}</h2>
                <p className="client-away-copy">{staffOutIntake.reassurance}</p>
                {staffOutIntake.responseTime ? (
                  <p className="client-away-meta">{staffOutIntake.responseTime}</p>
                ) : null}
                {savedIntakeName ? (
                  <p className="client-away-saved">
                    Got it — we saved your details, <strong>{savedIntakeName}</strong>
                    <button
                      type="button"
                      className="client-away-edit"
                      onClick={() => {
                        setIntakeStep(0);
                        setIntakeSaved(false);
                      }}
                    >
                      Change
                    </button>
                  </p>
                ) : (
                  <form
                    className="client-away-form client-intake-form"
                    onSubmit={(event) => {
                      if (intakeStepIndex < intakeSteps.length - 1) {
                        event.preventDefault();
                        setIntakeStep((step) =>
                          Math.min(step + 1, intakeSteps.length - 1),
                        );
                        return;
                      }
                      void saveStaffOutIntake(event);
                    }}
                  >
                    <div
                      className="client-intake-progress"
                      aria-label={`Step ${intakeStepIndex + 1} of ${intakeSteps.length}`}
                    >
                      <span>
                        Step {intakeStepIndex + 1} of {intakeSteps.length}
                      </span>
                      <div aria-hidden>
                        {intakeSteps.map((step, index) => (
                          <i
                            key={step}
                            className={index <= intakeStepIndex ? "is-active" : ""}
                          />
                        ))}
                      </div>
                    </div>

                    {currentIntakeStep === "contact" ? (
                      <div className="client-intake-step">
                        <div className="client-intake-step-head">
                          <h3>How can we reach you?</h3>
                          <p>Start with your name and one way to follow up.</p>
                        </div>
                        <label className="composer-field client-intake-field">
                          <span>Name</span>
                          <input
                            type="text"
                            value={displayName}
                            onChange={(e) => setDisplayName(e.target.value)}
                            placeholder="Your name"
                            required
                            autoComplete="name"
                          />
                        </label>
                        <div className="client-intake-contact-row">
                          <label className="composer-field client-intake-field">
                            <span>Email</span>
                            <input
                              type="email"
                              value={emailDraft ?? ""}
                              onChange={(e) => setEmailDraft(e.target.value)}
                              placeholder="you@example.com"
                              autoComplete="email"
                            />
                          </label>
                          <label className="composer-field client-intake-field">
                            <span>Phone</span>
                            <input
                              type="tel"
                              value={intakePhoneDraft}
                              onChange={(e) => setIntakePhoneDraft(e.target.value)}
                              placeholder="(555) 000-0000"
                              autoComplete="tel"
                            />
                          </label>
                        </div>
                        <p className="client-away-mini">
                          Only one contact method is needed.
                        </p>
                      </div>
                    ) : null}

                    {currentIntakeStep === "request" ? (
                      <div className="client-intake-step">
                        <div className="client-intake-step-head">
                          <h3>What can we help with?</h3>
                          <p>A little context helps the team respond usefully.</p>
                        </div>
                        {staffOutIntake.askReason ? (
                          <label className="composer-field client-intake-field">
                            <span>Topic</span>
                            <input
                              type="text"
                              value={intakeReasonDraft}
                              onChange={(e) => setIntakeReasonDraft(e.target.value)}
                              placeholder="What are you reaching out about?"
                              required
                              autoFocus
                            />
                          </label>
                        ) : null}
                        {staffOutIntake.askDetails ? (
                          <label className="composer-field client-intake-field">
                            <span>Details</span>
                            <textarea
                              rows={4}
                              value={intakeDetailsDraft}
                              onChange={(e) => setIntakeDetailsDraft(e.target.value)}
                              placeholder="Anything that would help us understand your situation"
                              required
                              autoFocus={!staffOutIntake.askReason}
                            />
                          </label>
                        ) : null}
                      </div>
                    ) : null}

                    {currentIntakeStep === "followup" ? (
                      <div className="client-intake-step">
                        <div className="client-intake-step-head">
                          <h3>Last step</h3>
                          <p>Tell us how you’d like the team to respond.</p>
                        </div>
                        {staffOutIntake.askUrgency ? (
                          <label className="composer-field client-intake-field">
                            <span>Timing</span>
                            <select
                              value={intakeUrgency}
                              onChange={(e) =>
                                setIntakeUrgency(
                                  e.target.value as "low" | "normal" | "high",
                                )
                              }
                            >
                              <option value="normal">Reply when available</option>
                              <option value="high">Please prioritize</option>
                              <option value="low">Just planning ahead</option>
                            </select>
                          </label>
                        ) : null}
                        {staffOutIntake.askPreferredContact ? (
                          <label className="composer-field client-intake-field">
                            <span>Preferred reply</span>
                            <select
                              value={intakePreferredContact}
                              onChange={(e) =>
                                setIntakePreferredContact(
                                  e.target.value as "email" | "phone" | "chat",
                                )
                              }
                            >
                              <option value="email">Email</option>
                              <option value="phone">Phone</option>
                              <option value="chat">This chat</option>
                            </select>
                          </label>
                        ) : null}
                        {staffOutIntake.askConsent ? (
                          <label className="client-intake-consent">
                            <input
                              type="checkbox"
                              checked={intakeConsent}
                              onChange={(e) => setIntakeConsent(e.target.checked)}
                              required
                            />
                            <span>You can contact me about this request.</span>
                          </label>
                        ) : null}
                      </div>
                    ) : null}

                    <div className="client-intake-navigation">
                      {intakeStepIndex > 0 ? (
                        <button
                          type="button"
                          className="btn-ghost client-intake-back"
                          onClick={() =>
                            setIntakeStep((step) => Math.max(0, step - 1))
                          }
                        >
                          Back
                        </button>
                      ) : (
                        <span />
                      )}
                      <button
                        type="submit"
                        className="btn-solid client-away-submit"
                        disabled={
                          currentIntakeStep === "contact" &&
                          !intakeContactComplete
                        }
                      >
                        {intakeStepIndex === intakeSteps.length - 1
                          ? "Send request"
                          : "Continue"}
                      </button>
                    </div>
                  </form>
                )}
                {staffOutIntake.emergencyNote ? (
                  <p className="client-away-warning">{staffOutIntake.emergencyNote}</p>
                ) : null}
                {staffOutNextStepHref ? (
                  <InAppLink
                    className="btn-ghost client-away-secondary"
                    href={staffOutNextStepHref}
                  >
                    {staffOutIntake.nextStepLabel}
                  </InAppLink>
                ) : null}
              </>
            ) : (
              <>
                <p className="client-away-copy">{awayCopy}</p>
                {savedEmail ? (
              <p className="client-away-saved">
                Got it — we&apos;ll reply to <strong>{savedEmail}</strong>
                <button
                  type="button"
                  className="client-away-edit"
                  onClick={() => setEmailSaved(false)}
                >
                  Change
                </button>
              </p>
            ) : (
              <form
                className="client-away-form"
                onSubmit={(e) => void saveEmail(e)}
              >
                <label className="composer-field">
                  <span className="sr-only">Email</span>
                  <input
                    type="email"
                    value={emailDraft ?? ""}
                    onChange={(e) => setEmailDraft(e.target.value)}
                    placeholder="you@email.com"
                    required
                    autoComplete="email"
                  />
                </label>
                <button type="submit" className="btn-solid client-away-submit">
                  Leave email
                </button>
              </form>
                )}
              </>
            )}
          </section>,
          awaySurfaceRoot,
        ) : null}

        {banners.length > 0 ? (
          <div className="client-chat-banners">
            {banners.map((banner) => (
              <ChatBannerView key={banner.id} banner={banner} />
            ))}
          </div>
        ) : null}
      </div>

      {profileBlock}

      {quickActions}

      {isAway ? (
        <div
          ref={setAwaySurfaceRoot}
          className="client-away-surface"
          aria-live="polite"
        />
      ) : null}

      <SwipeTimeStream
        ref={scrollRef}
        isEmpty={thread.length === 0}
        empty={
          <div className="client-chat-empty">
            <p>Send a message to get started.</p>
          </div>
        }
      >
        {thread.map((message, index) => {
          const fromCustomer = message.from === "client";
          const { role, continued } = messageCluster(thread, index);
          const myEmojis = new Set(
            (message.reactions ?? [])
              .filter((r) => reactorKey(r) === "client")
              .map((r) => r.emoji),
          );
          const staffName =
            !fromCustomer
              ? message.fromName?.trim() ||
                (message.fromMemberId
                  ? members.find((m) => m.id === message.fromMemberId)?.name
                  : undefined) ||
                chatOwner?.name ||
                ""
              : "";
          const specialties = isSpecialtiesMessage(message);
          const reconnect = isReconnectMessage(message);
          const reconnectPath = message.linkUrl || `/${slug}/c/${chatId}`;
          const interactive = !specialties && !reconnect;
          const actionsOpen = actionsFor === message.id;
          const thumbsUpOnly = isThumbsUpOnly(message);
          const mediaOnly =
            (message.kind === "image" || message.kind === "video") &&
            !message.body?.trim();
          const dayKey = messageDayKey(message);
          const previousDayKey =
            index > 0 ? messageDayKey(thread[index - 1]) : "";
          const showDaySeparator = dayKey !== previousDayKey;
          return (
            <Fragment key={message.id}>
              {showDaySeparator ? (
                <div className="chat-day-separator">
                  <span>{formatMessageDay(message)}</span>
                </div>
              ) : null}
              <div
                className={`chat-row msg-wrap ${fromCustomer ? "is-mine" : "is-theirs"} ${clusterClassName(role, continued)}${
                  actionsOpen ? " is-actions-open" : ""
                }${
                  sendAnimationMessageId === message.id
                    ? " is-send-animating"
                    : ""
                }`}
                data-message-id={message.id}
                onAnimationEnd={(event) => {
                  if (
                    event.animationName === "messageBubblePop" &&
                    sendAnimationMessageId === message.id
                  ) {
                    setSendAnimationMessageId(null);
                  }
                }}
                onClick={(e) => {
                  if (client?.chatEndedAt || !interactive) return;
                  if (longPressOpenedRef.current) {
                    longPressOpenedRef.current = false;
                    lastMessagePointerRef.current = null;
                    return;
                  }
                  lastMessagePointerRef.current = null;
                }}
                onPointerDown={(e) =>
                  startMessageLongPress(e, message.id, interactive)
                }
                onPointerMove={moveMessageLongPress}
                onPointerUp={clearLongPressTimer}
                onPointerCancel={clearLongPressTimer}
                onContextMenu={(e) => {
                  if (interactive && mobileActionsOnly()) e.preventDefault();
                }}
              >
                <div className="chat-row-main">
                  <article
                    className={`bubble bubble-${fromCustomer ? "business" : "client"} ${
                      reconnect ? "bubble-reconnect" : `bubble-${message.kind}`
                    }${mediaOnly ? " is-media-only" : ""}${thumbsUpOnly ? " bubble-like-only" : ""}`}
                  >
                  {staffName ? (
                    <span className="bubble-speaker">{staffName}</span>
                  ) : null}
                  {message.replyTo ? (
                    <MessageReplyQuote reply={message.replyTo} />
                  ) : null}
                  {specialties ? (
                    <div
                      className={`client-number-dropdown client-specialties-dropdown ${
                        introMessages?.contactReasonDisplay === "list"
                          ? "is-list"
                          : ""
                      }`}
                      ref={specialtiesMenuRef}
                    >
                      {introMessages?.specialtiesPrompt ? (
                        <p className="client-specialties-prompt">
                          {introMessages.specialtiesPrompt}
                        </p>
                      ) : null}
                      {introMessages?.contactReasonDisplay === "list" ? null : (
                        <button
                          type="button"
                          className="client-book-consult-btn client-number-dropdown-trigger"
                          aria-haspopup="listbox"
                          aria-expanded={specialtiesMenuOpen}
                          onClick={() =>
                            setSpecialtiesMenuOpen((open) => !open)
                          }
                        >
                          {message.body}
                        </button>
                      )}
                      {specialtiesMenuOpen ||
                      introMessages?.contactReasonDisplay === "list" ? (
                        <ul
                          className="client-number-dropdown-list"
                          role="listbox"
                        >
                          {(introMessages?.contactReasonOptions ?? []).map(
                            (optionLabel, index) => {
                              const n = index + 1;
                              const department =
                                currentDepartments(settings)[n - 1];
                              const attached =
                                departmentHasContent(department);
                              return (
                                <li
                                  key={n}
                                  role="none"
                                  className={
                                    n === 1 ? "client-number-row" : undefined
                                  }
                                >
                                  <button
                                    type="button"
                                    role="option"
                                    aria-selected={selectedNumber === n}
                                    className={
                                      [
                                        selectedNumber === n
                                          ? "is-selected"
                                          : "",
                                        attached ? "has-message" : "",
                                      ]
                                        .filter(Boolean)
                                        .join(" ") || undefined
                                    }
                                    onClick={() =>
                                      pickDepartment(n, () =>
                                        setSpecialtiesMenuOpen(false),
                                      )
                                    }
                                  >
                                    {optionLabel}
                                  </button>
                                </li>
                              );
                            },
                          )}
                        </ul>
                      ) : null}
                    </div>
                  ) : reconnect ? (
                    <div className="client-reconnect">
                      <p>{message.body}</p>
                      <a className="client-reconnect-link" href={reconnectPath}>
                        {typeof window === "undefined"
                          ? reconnectPath
                          : `${window.location.origin}${reconnectPath}`}
                      </a>
                      <button
                        type="button"
                        className="client-reconnect-copy"
                        onClick={() => void copyReturnLink(reconnectPath)}
                      >
                        {copiedReturnLink ? "Copied" : "Copy link"}
                      </button>
                      {chatLinkEmailOn && !preview ? (
                        linkEmailSent && emailDraft.trim() ? (
                          <p className="client-reconnect-sent">
                            We emailed this chat link to{" "}
                            <strong>{emailDraft.trim()}</strong>
                            <button
                              type="button"
                              className="client-away-edit"
                              onClick={() => {
                                setLinkEmailSent(false);
                                setLinkEmailError(null);
                              }}
                            >
                              Change
                            </button>
                          </p>
                        ) : (
                          <form
                            className="client-away-form client-reconnect-form"
                            onSubmit={(e) => void emailReturnLink(e)}
                          >
                            <label className="composer-field">
                              <span className="sr-only">Email this chat link</span>
                              <input
                                type="email"
                                value={emailDraft ?? ""}
                                onChange={(e) => {
                                  setEmailDraft(e.target.value);
                                  setLinkEmailError(null);
                                }}
                                placeholder="you@email.com"
                                required
                                autoComplete="email"
                                disabled={linkEmailSending}
                              />
                            </label>
                            <button
                              type="submit"
                              className="btn-solid client-away-submit"
                              disabled={linkEmailSending}
                            >
                              {linkEmailSending ? "Sending…" : "Email link"}
                            </button>
                            {linkEmailError ? (
                              <p className="client-reconnect-error">{linkEmailError}</p>
                            ) : null}
                          </form>
                        )
                      ) : null}
                    </div>
                  ) : (
                    <>
                      <MessageMedia
                        message={message}
                        suppressOpen={actionsOpen}
                      />
                      {message.body && message.kind !== "link" ? (
                        <MessageBodyText text={message.body} />
                      ) : null}
                    </>
                  )}
                  <MessageReactions
                    reactions={message.reactions}
                    myEmojis={myEmojis}
                    disabled={Boolean(client?.chatEndedAt)}
                    onToggle={(emoji) => reactToMessage(message.id, emoji)}
                  />
                  </article>
                  {interactive ? (
                    <MessageActionBar
                      align={fromCustomer ? "end" : "start"}
                      disabled={Boolean(client?.chatEndedAt)}
                      onReply={() => setReplyTo(buildReplyRef(message))}
                      onReact={(emoji) => reactToMessage(message.id, emoji)}
                    />
                  ) : null}
                </div>
                <time className="chat-row-time" dateTime={message.createdAt ?? message.at}>
                  <span className="chat-row-time-inner">
                    {formatSwipeTime(message)}
                  </span>
                </time>
              </div>
            </Fragment>
          );
        })}
      </SwipeTimeStream>

      {newMessageCount > 0 ? (
        <div className="client-new-message-wrap">
          <button
            type="button"
            className="client-new-message-pill"
            onClick={jumpToLatestMessages}
          >
            {newMessageCount === 1
              ? "New message"
              : `${newMessageCount} new messages`}{" "}
            ↓
          </button>
        </div>
      ) : null}

      <div className="client-chat-end-wrap" ref={composerWrapRef}>
        {chatEndImages.length > 0 ? (
          <ChatMarketingCarousel images={chatEndImages} />
        ) : null}
        {chatEnded ? (
          <div className="client-composer client-composer-ended" role="status">
            <p>Chat ended</p>
          </div>
        ) : (
          <form
            className={`client-composer ${mobileComposerExpanded ? "is-mobile-expanded" : ""}`}
            onSubmit={(e) => void send(e)}
          >
            {replyTo ? (
              <div className="composer-reply" role="status">
                <div className="composer-reply-body">
                  <span className="composer-reply-label">Replying</span>
                  <span className="composer-reply-text">{replyTo.preview}</span>
                </div>
                <button
                  type="button"
                  className="btn-text icon-btn"
                  onClick={() => setReplyTo(null)}
                  aria-label="Cancel reply"
                >
                  <IconX size={14} />
                </button>
              </div>
            ) : null}
            {!replyTo && contactReason ? (
              <div className="composer-reply composer-reason" role="status">
                <div className="composer-reply-body">
                  <span className="composer-reply-label">Contact reason</span>
                  <span className="composer-reply-text">{contactReason}</span>
                </div>
                <button
                  type="button"
                  className="btn-text icon-btn"
                  onClick={() => setContactReason(null)}
                  aria-label="Clear contact reason"
                >
                  <IconX size={14} />
                </button>
              </div>
            ) : null}
            {thread.length === 0 ? (
              <label className="client-name-field">
                <span className="sr-only">Your name</span>
                <input
                  value={displayName ?? ""}
                  onChange={(e) => setDisplayName(e.target.value)}
                  placeholder={`Your name (optional · ${guestLabel})`}
                />
              </label>
            ) : null}
            {sendError ? (
              <p className="client-send-error" role="alert">
                {sendError}
              </p>
            ) : null}
            {plusMenuOpen || faqOpen ? (
              <div className="client-mobile-plus-panel">
                {plusMenuOpen ? (
                  <div className="client-plus-menu-row">
                    <button
                      type="button"
                      className="client-plus-option"
                      onClick={() => {
                        setPlusMenuOpen(false);
                        setFaqOpen(true);
                      }}
                    >
                      FAQ
                    </button>
                    <button
                      type="button"
                      className="client-plus-menu-close"
                      aria-label="Close options"
                      onClick={() => {
                        setPlusMenuOpen(false);
                        setFaqOpen(false);
                      }}
                    >
                      <IconX size={14} />
                    </button>
                  </div>
                ) : null}
                {faqOpen ? (
                  <div className="client-faq-box" aria-label="Frequently asked questions">
                    <div className="client-faq-box-head">
                      <span>Ask a common question</span>
                      <button
                        type="button"
                        aria-label="Close FAQ"
                        onClick={() => setFaqOpen(false)}
                      >
                        <IconX size={14} />
                      </button>
                    </div>
                    <div className="client-faq-list">
                      {CUSTOMER_FAQS.map((question) => (
                        <button
                          key={question}
                          type="button"
                          disabled={sending || preview}
                          onClick={() => void sendFaqQuestion(question)}
                        >
                          {question}
                        </button>
                      ))}
                    </div>
                  </div>
                ) : null}
              </div>
            ) : null}
            <div className="client-composer-row">
              <div className="client-mobile-composer-icons">
                <button
                  type="button"
                  className="mobile-composer-icon"
                  aria-label="More options"
                  aria-expanded={plusMenuOpen || faqOpen}
                  onClick={() => {
                    setFaqOpen(false);
                    setPlusMenuOpen((open) => !open);
                  }}
                >
                  <IconPlusCircle />
                </button>
                <button
                  type="button"
                  className="mobile-composer-icon"
                  aria-label="Camera"
                  disabled={attaching || sending}
                  onClick={() => cameraRef.current?.click()}
                >
                  <IconCamera />
                </button>
                <button
                  type="button"
                  className="mobile-composer-icon"
                  aria-label="Photo library"
                  disabled={attaching || sending}
                  onClick={() => fileRef.current?.click()}
                >
                  <IconPhoto />
                </button>
                <button
                  type="button"
                  className="mobile-composer-icon"
                  aria-label="Speech to text"
                  disabled={sending || preview}
                  onClick={() => {
                    setPlusMenuOpen(false);
                    setFaqOpen(false);
                    setSpeechModalOpen(true);
                  }}
                >
                  <IconMic />
                </button>
              </div>
              <input
                ref={fileRef}
                type="file"
                accept="image/jpeg,image/png,image/webp,image/heic,image/heif"
                className="sr-only"
                id="client-attach-image"
                onChange={(e) => {
                  const file = e.target.files?.[0] ?? null;
                  if (file) void sendImage(file);
                }}
              />
              <input
                ref={cameraRef}
                type="file"
                accept="image/*"
                capture="environment"
                className="sr-only"
                id="client-capture-image"
                onChange={(e) => {
                  const file = e.target.files?.[0] ?? null;
                  if (file) void sendImage(file, "camera");
                }}
              />
              <label
                htmlFor="client-attach-image"
                className={`composer-attach ${attaching || sending ? "is-busy" : ""}`}
                aria-label="Attach image"
                title="Attach image"
              >
                <IconPaperclip />
              </label>
              <button
                type="button"
                className="mobile-composer-collapse"
                aria-label="Show message actions"
                onPointerDown={(event) => event.preventDefault()}
                onClick={() => {
                  setMobileComposerExpanded(false);
                  requestAnimationFrame(() => messageInputRef.current?.focus());
                }}
              >
                &gt;
              </button>
              <label className="composer-field">
                <span className="sr-only">Message</span>
                <input
                  ref={messageInputRef}
                  value={draft ?? ""}
                  onFocus={() => {
                    setMobileComposerExpanded(true);
                  }}
                  onBlur={() => {
                    setMobileComposerExpanded(false);
                    settleMobileOverscrollGap();
                  }}
                  onChange={(e) => {
                    setDraft(e.target.value);
                    if (sendError) setSendError(null);
                  }}
                  placeholder={
                    replyTo
                      ? "Write a reply…"
                      : contactReason
                        ? "Add details so the team can understand your situation…"
                        : "Message…"
                  }
                  disabled={preview}
                />
              </label>
              <button
                type={draft.trim() ? "submit" : "button"}
                className={`composer-send ${draft.trim() ? "has-message" : "is-empty"}`}
                aria-label={draft.trim() ? "Send" : "Send thumbs up"}
                disabled={sending || preview}
                onPointerDown={(event) => {
                  if (draft.trim()) event.preventDefault();
                }}
                onClick={() => {
                  if (!draft.trim()) void sendTextMessage("👍");
                }}
              >
                <span className="composer-send-icon composer-send-icon-like">
                  <IconThumbUp />
                </span>
                <span className="composer-send-icon composer-send-icon-arrow">
                  <IconArrowSend />
                </span>
              </button>
            </div>
          </form>
        )}
      </div>
      {speechModalOpen ? (
        <SpeechToTextModal
          initialText={draft}
          sending={sending}
          onClose={() => setSpeechModalOpen(false)}
          onSend={async (text) => {
            await sendTextMessage(text);
            setSpeechModalOpen(false);
          }}
        />
      ) : null}
    </div>
    </LinkSheetProvider>
  );
}
