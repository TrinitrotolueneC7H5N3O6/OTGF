"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import type { Client, DepartmentAttachment, DepartmentContent, FloorSettings, Message } from "@/lib/types";
import { rememberChat } from "@/lib/chatMemory";
import {
  beatPresence,
  formatResponseWindows,
  getSpace,
  nextGuestName,
  patchSpace,
  readAttachmentFile,
  readMediaFile,
  subscribeSpace,
  messageTimeStamp,
} from "@/lib/store";
import {
  departmentHasContent,
  MAX_DEPARTMENT_ATTACHMENTS,
  normalizeDepartments,
} from "@/lib/spaceNormalize";
import { MessageMedia } from "@/components/shared/MessageMedia";
import { ChatBannerView } from "@/components/shared/ChatBannerView";
import {
  IconArrowSend,
  IconPaperclip,
} from "@/components/shared/Icons";
import { SwipeTimeStream } from "./SwipeTimeStream";
import { ChatMarketingCarousel } from "./ChatMarketingCarousel";
import {
  appendCustomerMessageWithAutoReply,
  ensureWelcomeMessages,
  isReconnectMessage,
  isSpecialtiesMessage,
} from "@/lib/customerAutoReply";

interface ClientChatProps {
  slug: string;
  chatId: string;
  embedded?: boolean;
}

function isGuestName(name: string) {
  return /^Guest(\s+\d+)?$/i.test(name.trim());
}

export function ClientChat({ slug, chatId, embedded = false }: ClientChatProps) {
  const [space, setSpace] = useState<Awaited<
    ReturnType<typeof getSpace>
  > | null>(null);
  const [displayName, setDisplayName] = useState("");
  const [draft, setDraft] = useState("");
  const [emailDraft, setEmailDraft] = useState("");
  const [emailSaved, setEmailSaved] = useState(false);
  const [recordingSaved, setRecordingSaved] = useState(false);
  const [ready, setReady] = useState(false);
  const [attaching, setAttaching] = useState(false);
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
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
  const scrollRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const departmentImageRef = useRef<HTMLInputElement>(null);
  const departmentDocRef = useRef<HTMLInputElement>(null);
  const numberMenuRef = useRef<HTMLDivElement>(null);
  const specialtiesMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
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
  }, [slug, chatId]);

  const welcomeEnsured = useRef(false);
  useEffect(() => {
    welcomeEnsured.current = false;
  }, [chatId]);

  useEffect(() => {
    if (!space || welcomeEnsured.current) return;
    const hasCustomer = space.messages.some(
      (m) => m.clientId === chatId && m.from === "client",
    );
    if (!hasCustomer) return;

    const messages = ensureWelcomeMessages(
      space.messages,
      chatId,
      space.business.name,
      slug,
    );
    welcomeEnsured.current = true;
    if (messages === space.messages) return;

    setSpace({ ...space, messages });
    void patchSpace(slug, (latest) => {
      const nextMessages = ensureWelcomeMessages(
        latest.messages,
        chatId,
        latest.business.name,
        slug,
      );
      if (nextMessages === latest.messages) return latest;
      return { ...latest, messages: nextMessages };
    })
      .then((next) => setSpace(next))
      .catch(() => {
        welcomeEnsured.current = false;
      });
  }, [space, slug, chatId]);

  const client = space?.clients.find((c) => c.id === chatId);

  const thread = useMemo(() => {
    if (!space) return [];
    return space.messages.filter((m) => m.clientId === chatId);
  }, [space, chatId]);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [thread.length]);

  useEffect(() => {
    if (!numberMenuOpen && !specialtiesMenuOpen) return;

    function onPointerDown(event: PointerEvent) {
      const target = event.target as Node;
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

  // Tell the floor when this customer tab is open / interacting.
  useEffect(() => {
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
  }, [slug, chatId]);

  const guestLabel = client?.name ?? "Guest";

  async function send(e: FormEvent) {
    e.preventDefault();
    if (sending) return;
    if (!draft.trim()) return;
    if (client?.chatEndedAt) return;
    if (!space) return;

    const body = draft.trim();
    const name = displayName.trim();
    const presentAt = new Date().toISOString();
    setSendError(null);
    setSending(true);

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
          name: name || existing.name,
          status: existing.status === "client" ? "client" : "unknown",
          preview: body,
          lastActive: "Just now",
          unread: existing.unread + 1,
          presentAt,
        }
      : {
          id: chatId,
          name: name || nextGuestName(space.clients),
          status: "unknown",
          channel: "web",
          preview: body,
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
      ),
    });
    setDraft("");

    try {
      const next = await patchSpace(slug, (latest) => {
        const latestExisting = latest.clients.find((c) => c.id === chatId);
        const savedClient: Client = latestExisting
          ? {
              ...latestExisting,
              name: name || latestExisting.name,
              status:
                latestExisting.status === "client" ? "client" : "unknown",
              preview: body,
              lastActive: "Just now",
              unread: latestExisting.unread + 1,
              presentAt,
            }
          : nextClient;

        return {
          ...latest,
          deletedClientIds: (latest.deletedClientIds ?? []).filter(
            (id) => id !== chatId,
          ),
          clients: latestExisting
            ? [savedClient, ...latest.clients.filter((c) => c.id !== chatId)]
            : [savedClient, ...latest.clients],
          messages: appendCustomerMessageWithAutoReply(
            latest.messages,
            chatId,
            message,
            latest.business.name,
            latest.business.slug,
          ),
        };
      });
      setSpace(next);
    } catch (err) {
      setSendError(
        err instanceof Error ? err.message : "Could not send. Try again.",
      );
    } finally {
      setSending(false);
    }
  }

  async function sendImage(file: File) {
    if (client?.chatEndedAt || sending) return;
    setAttaching(true);
    setSendError(null);
    try {
      const media = await readMediaFile(file);
      if (media.kind !== "photo") {
        throw new Error("Pick an image file.");
      }

      const caption = draft.trim();
      const name = displayName.trim();
      const presentAt = new Date().toISOString();
      setSending(true);

      const message: Message = {
        id: `m-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        clientId: chatId,
        from: "client",
        kind: "image",
        body: caption,
        imageUrl: media.url,
        ...messageTimeStamp(),
      };

      const next = await patchSpace(slug, (latest) => {
        const existing = latest.clients.find((c) => c.id === chatId);
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
              name: name || nextGuestName(latest.clients),
              status: "unknown",
              channel: "web",
              preview,
              unread: 1,
              trade: latest.business.trade,
              lastActive: "Just now",
              note: "Unique chat link",
              presentAt,
            };

        return {
          ...latest,
          deletedClientIds: (latest.deletedClientIds ?? []).filter(
            (id) => id !== chatId,
          ),
          clients: existing
            ? [nextClient, ...latest.clients.filter((c) => c.id !== chatId)]
            : [nextClient, ...latest.clients],
          messages: appendCustomerMessageWithAutoReply(
            latest.messages,
            chatId,
            message,
            latest.business.name,
            latest.business.slug,
          ),
        };
      });

      setSpace(next);
      setDraft("");
    } catch (err) {
      setSendError(
        err instanceof Error ? err.message : "Could not send photo.",
      );
    } finally {
      setAttaching(false);
      setSending(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  async function requestLive() {
    const next = await patchSpace(slug, (latest) => {
      const existing = latest.clients.find((c) => c.id === chatId);
      const body = "Looking for a live response";
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
            preview: body,
            lastActive: "Just now",
            unread: existing.unread + 1,
            note: existing.note?.includes("Live")
              ? existing.note
              : "Live request",
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
            note: "Live request",
          };

      return {
        ...latest,
        deletedClientIds: (latest.deletedClientIds ?? []).filter(
          (id) => id !== chatId,
        ),
        clients: existing
          ? latest.clients.map((c) => (c.id === chatId ? nextClient : c))
          : [nextClient, ...latest.clients],
        messages: appendCustomerMessageWithAutoReply(
          latest.messages,
          chatId,
          message,
          latest.business.name,
          latest.business.slug,
        ),
      };
    });
    setSpace(next);
  }

  async function requestConsultation() {
    await sendQuickRequest(
      "I'd like to book an in-person consultation.",
      "Consultation request",
    );
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

  async function emailReturnLink(e: FormEvent, path: string) {
    e.preventDefault();
    const email = emailDraft.trim();
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return;

    const url = path.startsWith("http")
      ? path
      : `${window.location.origin}${path}`;
    const mailto = `mailto:${encodeURIComponent(email)}?subject=${encodeURIComponent(
      "Your chat link",
    )}&body=${encodeURIComponent(
      `Use this link to return to your chat with ${space?.business.name ?? "us"}:\n\n${url}`,
    )}`;

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
      setLinkEmailSent(true);
    } catch {
      // still offer the mail draft if save fails
    }

    const mail = document.createElement("a");
    mail.href = mailto;
    mail.click();
  }

  function pickDepartment(n: number, closeMenu: () => void) {
    const department = currentDepartments(space?.settings)[n - 1];
    setSelectedNumber(n);
    setDepartmentDraft(department.message);
    setDepartmentDraftAttachments(department.attachments);
    closeMenu();
    if (departmentHasContent(department)) {
      void sendDepartmentContent(n, department);
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
  ) {
    if (client?.chatEndedAt || sending) return;
    const text = content.message.trim();
    if (!text && content.attachments.length === 0) return;

    setSending(true);
    setSendError(null);
    try {
      const next = await patchSpace(slug, (latest) => {
        const stamp = messageTimeStamp();
        const outgoing: Message[] = [];
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
          `Department ${departmentNumber}`;
        const existing = latest.clients.find((c) => c.id === chatId);
        const nextClient: Client = existing
          ? {
              ...existing,
              name: displayName.trim() || existing.name,
              preview,
              lastActive: "Just now",
              unread: existing.unread + outgoing.length,
              note: existing.note?.includes(`Department ${departmentNumber}`)
                ? existing.note
                : `Department ${departmentNumber}`,
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
              note: `Department ${departmentNumber}`,
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
    if (client?.chatEndedAt || sending) return;
    setSending(true);
    setSendError(null);
    try {
      const next = await patchSpace(slug, (latest) => {
        const existing = latest.clients.find((c) => c.id === chatId);
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
              name: displayName.trim() || nextGuestName(latest.clients),
              status: "unknown",
              channel: "web",
              preview: body,
              unread: 1,
              trade: latest.business.trade,
              lastActive: "Just now",
              note,
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
          messages: appendCustomerMessageWithAutoReply(
            latest.messages,
            chatId,
            message,
            latest.business.name,
            latest.business.slug,
          ),
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

  async function saveRecordingEmail(e: FormEvent) {
    e.preventDefault();
    const email = emailDraft.trim();
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return;

    const next = await patchSpace(slug, (latest) => {
      const existing = latest.clients.find((c) => c.id === chatId);
      const body = `Recording email: ${email}`;
      const alreadyNoted = latest.messages.some(
        (m) =>
          m.clientId === chatId &&
          m.from === "client" &&
          m.body.startsWith("Recording email:"),
      );

      const noteBase = existing?.note?.toLowerCase().includes("recording")
        ? existing.note
        : [existing?.note, "Wants recording"].filter(Boolean).join(" · ");

      const nextClient: Client = existing
        ? {
            ...existing,
            email,
            note: noteBase || "Wants recording",
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
            note: "Wants recording",
            email,
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
        messages: alreadyNoted
          ? latest.messages.map((m) =>
              m.clientId === chatId &&
              m.from === "client" &&
              m.body.startsWith("Recording email:")
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
    setEmailSaved(true);
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
  const banners = settings.banners.filter((b) => b.enabled && b.text.trim());
  const hoursLabel = formatResponseWindows(settings.windows);
  const chatEndImages = (settings.chatEndImages ?? []).slice(0, 6);
  const chatEnded = Boolean(client?.chatEndedAt);
  const isAway = !settings.live && !chatEnded;
  const awayCopy =
    settings.awayMessage?.trim() ||
    "We're not available right now. Leave your email and we'll reply to your question.";
  const recordingCopy =
    "If you would like a recording of this, please enter your email and one will be emailed to you.";
  const savedEmail = client?.email ?? (emailSaved || recordingSaved ? emailDraft.trim() : "");
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
        {chattingWith || hoursLabel || settings.responseNote ? (
          <p className="client-chat-sub">
            {chattingWith ? (
              <>
                With <strong>{chattingWith}</strong>
              </>
            ) : null}
            {chattingWith && (hoursLabel || settings.responseNote)
              ? " · "
              : null}
            {hoursLabel || null}
            {settings.responseNote
              ? `${hoursLabel ? " · " : ""}${settings.responseNote}`
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

  return (
    <div className={`client-chat${embedded ? " is-embedded" : ""}`}>
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

        {chatEnded ? (
          <div className="client-away-panel client-ended-panel" role="status">
            <p className="client-away-copy">{recordingCopy}</p>
            {recordingSaved && savedEmail ? (
              <p className="client-away-saved">
                Got it — we&apos;ll email a recording to{" "}
                <strong>{savedEmail}</strong>
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
                onSubmit={(e) => void saveRecordingEmail(e)}
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
                  Email recording
                </button>
              </form>
            )}
          </div>
        ) : isAway ? (
          <div className="client-away-panel" role="status">
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
            <div className="client-away-actions">
              <button
                type="button"
                className="client-book-consult-btn"
                onClick={() => void requestConsultation()}
                disabled={sending}
              >
                Book in-person consultation
              </button>
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
                          {n === 1 ? (
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
            </div>
            {selectedNumber != null ? (
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
                        <span className="client-department-file-name">
                          {file.name}
                        </span>
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
                    onChange={(e) =>
                      void addDepartmentFiles(e.target.files)
                    }
                  />
                  <input
                    ref={departmentDocRef}
                    type="file"
                    accept=".pdf,.doc,.docx,.txt,.rtf,application/pdf,text/plain"
                    multiple
                    className="sr-only"
                    id="department-attach-doc"
                    onChange={(e) =>
                      void addDepartmentFiles(e.target.files)
                    }
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
        ) : null}

        {banners.length > 0 ? (
          <div className="client-chat-banners">
            {banners.map((banner) => (
              <ChatBannerView key={banner.id} banner={banner} />
            ))}
          </div>
        ) : null}
      </div>

      <SwipeTimeStream
        ref={scrollRef}
        isEmpty={thread.length === 0}
        empty={
          <div className="client-chat-empty">
            <p>Send a message to get started.</p>
          </div>
        }
      >
        {thread.map((message) => {
          const fromCustomer = message.from === "client";
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
          return (
            <div key={message.id} className="chat-row">
              <div className="chat-row-main">
                <article
                  className={`bubble bubble-${fromCustomer ? "business" : "client"} ${
                    reconnect ? "bubble-reconnect" : `bubble-${message.kind}`
                  }`}
                >
                  {staffName ? (
                    <span className="bubble-speaker">{staffName}</span>
                  ) : null}
                  {specialties ? (
                    <div
                      className="client-number-dropdown client-specialties-dropdown"
                      ref={specialtiesMenuRef}
                    >
                      <button
                        type="button"
                        className="client-book-consult-btn client-number-dropdown-trigger"
                        aria-haspopup="listbox"
                        aria-expanded={specialtiesMenuOpen}
                        onClick={() =>
                          setSpecialtiesMenuOpen((open) => !open)
                        }
                      >
                        Specialties
                      </button>
                      {specialtiesMenuOpen ? (
                        <ul
                          className="client-number-dropdown-list"
                          role="listbox"
                        >
                          {Array.from({ length: 20 }, (_, i) => i + 1).map(
                            (n) => {
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
                                    {n}
                                  </button>
                                  {n === 1 ? (
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
                      {linkEmailSent && emailDraft.trim() ? (
                        <p className="client-reconnect-sent">
                          We&apos;ll email this chat link to{" "}
                          <strong>{emailDraft.trim()}</strong>
                          <button
                            type="button"
                            className="client-away-edit"
                            onClick={() => setLinkEmailSent(false)}
                          >
                            Change
                          </button>
                        </p>
                      ) : (
                        <form
                          className="client-away-form client-reconnect-form"
                          onSubmit={(e) => void emailReturnLink(e, reconnectPath)}
                        >
                          <label className="composer-field">
                            <span className="sr-only">Email this chat link</span>
                            <input
                              type="email"
                              value={emailDraft ?? ""}
                              onChange={(e) => setEmailDraft(e.target.value)}
                              placeholder="you@email.com"
                              required
                              autoComplete="email"
                            />
                          </label>
                          <button
                            type="submit"
                            className="btn-solid client-away-submit"
                          >
                            Email link
                          </button>
                        </form>
                      )}
                    </div>
                  ) : (
                    <>
                      <MessageMedia message={message} />
                      {message.body && message.kind !== "link" ? (
                        <p>{message.body}</p>
                      ) : null}
                    </>
                  )}
                </article>
              </div>
              <time className="chat-row-time" dateTime={message.at}>
                <span className="chat-row-time-inner">
                  {message.at.replace(", ", "\n")}
                </span>
              </time>
            </div>
          );
        })}
      </SwipeTimeStream>

      <div className="client-chat-end-wrap">
        <ChatMarketingCarousel images={chatEndImages} />
        {chatEnded ? (
          <div className="client-composer client-composer-ended" role="status">
            <p>Chat ended</p>
          </div>
        ) : (
          <form className="client-composer" onSubmit={(e) => void send(e)}>
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
            <div className="client-composer-row">
              <input
                ref={fileRef}
                type="file"
                accept="image/*"
                className="sr-only"
                id="client-attach-image"
                onChange={(e) => {
                  const file = e.target.files?.[0] ?? null;
                  if (file) void sendImage(file);
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
              <label className="composer-field">
                <span className="sr-only">Message</span>
                <input
                  value={draft ?? ""}
                  onChange={(e) => {
                    setDraft(e.target.value);
                    if (sendError) setSendError(null);
                  }}
                  placeholder="Message…"
                  autoFocus
                  disabled={sending}
                />
              </label>
              <button
                type="submit"
                className="composer-send"
                aria-label="Send"
                disabled={sending || !draft.trim()}
              >
                <IconArrowSend />
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
