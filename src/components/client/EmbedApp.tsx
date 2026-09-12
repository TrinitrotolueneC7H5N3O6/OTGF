"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { IconArrowUpRight, IconX } from "@/components/shared/Icons";
import type { BusinessSpace } from "@/lib/types";
import { getSpace, subscribeSpace } from "@/lib/store";
import { defaultPreChat } from "@/lib/spaceNormalize";
import { preChatHref, widgetPreChatLinks } from "@/lib/preChat";
import {
  isPublicActionEnabled,
  isPublicWidgetEnabled,
} from "@/lib/toolPublic";
import {
  createChatId,
  recallChatHistory,
  rememberChat,
  type RememberedChat,
} from "@/lib/chatMemory";
import { EmbedChat } from "./EmbedChat";
import { PreChatPage } from "./PreChatPage";
import { StoriesBrowseApp } from "./StoriesBrowseApp";
import { QuickContactModal } from "./QuickContactModal";
import { QuickBuildModal } from "./QuickBuildModal";
import { formShare, quickBuildConfigForLink } from "@/lib/quickBuilds";

interface EmbedAppProps {
  slug: string;
  start: "page" | "chat";
  widget?: boolean;
  actionId?: string;
}

export function EmbedApp({ slug, start, widget = false, actionId }: EmbedAppProps) {
  const [view, setView] = useState<"page" | "chat" | "stories">(start);
  const [requestedChatId, setRequestedChatId] = useState<string | null>(null);
  const [chatHistory, setChatHistory] = useState<RememberedChat[]>([]);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [chatOpenSignal, setChatOpenSignal] = useState(0);
  const [space, setSpace] = useState<BusinessSpace | null>(null);
  const historyRef = useRef<HTMLDivElement>(null);
  const openChat = useCallback(() => setView("chat"), []);
  const widgetOn = Boolean(space && isPublicWidgetEnabled(space.settings));
  const liveChatOn = Boolean(
    widgetOn &&
      space &&
      isPublicActionEnabled(space.settings, "chat") &&
      (space.settings.preChat ?? defaultPreChat()).links.some(
        (link) =>
          (link.kind === "chat" || link.id === "pre-live-chat") &&
          link.showInWidget,
      ),
  );
  const widgetActions = useMemo(
    () =>
      widgetOn && space
        ? widgetPreChatLinks(
            space.settings.preChat ?? defaultPreChat(),
            space.settings,
          )
        : [],
    [space, widgetOn],
  );
  const actionLink = (() => {
    if (!actionId || !space) return null;
    const links = space.settings.preChat ?? defaultPreChat();
    const found = links.links.find((link) => link.id === actionId) ?? null;
    if (!found) return null;
    const config = quickBuildConfigForLink(found);
    if (config?.type === "form") {
      const fromWidget = widgetActions.some((item) => item.id === found.id);
      if (
        !isPublicActionEnabled(space.settings, "form") ||
        (!formShare(found).embed && !fromWidget)
      ) {
        return null;
      }
    }
    if (config?.type === "scheduler") {
      const fromWidget = widgetActions.some((item) => item.id === found.id);
      if (!isPublicActionEnabled(space.settings, "scheduler") || (config.shareEmbed === false && !fromWidget)) return null;
    }
    return found;
  })();

  useEffect(() => {
    if (!widget && !actionId) return;
    let cancelled = false;
    void getSpace(slug).then((next) => {
      if (!cancelled && next) setSpace(next);
    });
    const unsubscribe = subscribeSpace(slug, (next) => {
      if (next) setSpace(next);
    });
    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, [slug, widget, actionId]);

  useEffect(() => {
    if (!widget || !space) return;
    window.parent.postMessage(
      {
        type: "otgf:widget-actions",
        liveChat: liveChatOn,
        actions: widgetActions.map((link) => ({
          id: link.id,
          kind: link.kind,
          label: link.label,
          href: preChatHref(link, slug),
          quickBuild: Boolean(quickBuildConfigForLink(link)),
        })),
      },
      "*",
    );
  }, [slug, space, widget, widgetActions, liveChatOn]);

  const refreshChatHistory = useCallback(() => {
    setChatHistory(recallChatHistory(slug));
  }, [slug]);

  const handleChatOpened = useCallback(
    (chatId: string) => {
      setRequestedChatId(chatId);
      refreshChatHistory();
    },
    [refreshChatHistory],
  );

  const startNewChat = useCallback(() => {
    const chatId = createChatId();
    rememberChat(slug, chatId);
    setRequestedChatId(chatId);
    setChatOpenSignal((signal) => signal + 1);
    setHistoryOpen(false);
    refreshChatHistory();
  }, [refreshChatHistory, slug]);

  const openPreviousChat = useCallback(
    (chatId: string) => {
      rememberChat(slug, chatId);
      setRequestedChatId(chatId);
      setChatOpenSignal((signal) => signal + 1);
      setHistoryOpen(false);
      refreshChatHistory();
    },
    [refreshChatHistory, slug],
  );

  const closeWidget = useCallback(() => {
    setHistoryOpen(false);
    window.parent.postMessage({ type: "otgf:close-widget" }, "*");
  }, []);

  const closeActionModal = useCallback(() => {
    window.parent.postMessage({ type: "otgf:close-action-modal" }, "*");
  }, []);

  const openChatInNewTab = useCallback(() => {
    const path = requestedChatId
      ? `/${encodeURIComponent(slug)}/c/${encodeURIComponent(requestedChatId)}`
      : `/${encodeURIComponent(slug)}/chat`;
    window.open(path, "_blank", "noopener,noreferrer");
  }, [requestedChatId, slug]);

  useEffect(() => {
    if (!historyOpen) return;

    function onPointerDown(event: PointerEvent) {
      if (!historyRef.current?.contains(event.target as Node)) {
        setHistoryOpen(false);
      }
    }

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setHistoryOpen(false);
    }

    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [historyOpen]);

  useEffect(() => {
    if (!actionId) return;
    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape") {
        window.parent.postMessage({ type: "otgf:close-action-modal" }, "*");
      }
    }
    document.addEventListener("keydown", closeOnEscape);
    return () => document.removeEventListener("keydown", closeOnEscape);
  }, [actionId]);

  useEffect(() => {
    if (!actionId || !space) return;
    window.parent.postMessage(
      { type: "otgf:action-ready", id: actionId },
      "*",
    );
  }, [actionId, space]);

  if (actionId) {
    if (!space) {
      return (
        <div className="otgf-action-embed-root otgf-action-embed-loading">
          Loading…
        </div>
      );
    }
    if (!actionLink) {
      return (
        <div className="otgf-action-embed-root"><div className="client-missing">
          <p>This option is no longer available.</p>
          <button type="button" className="btn-solid" onClick={closeActionModal}>Close</button>
        </div></div>
      );
    }
    return (
      <div className="otgf-action-embed-root">
        {quickBuildConfigForLink(actionLink) ? (
          <QuickBuildModal link={actionLink} slug={slug} embedded onClose={closeActionModal} />
        ) : (
          <QuickContactModal link={actionLink} slug={slug} onClose={closeActionModal} />
        )}
      </div>
    );
  }

  return (
    <div className="otgf-embed-root">
      {view === "page" ? (
        <PreChatPage slug={slug} embedded onOpenChat={openChat} onOpenStories={() => setView("stories")} />
      ) : view === "stories" ? (
        <>
          <header className="public-chat-dialog-toolbar otgf-widget-toolbar">
            <strong>Our work</strong>
            <div className="public-chat-dialog-actions">
              <button
                type="button"
                onClick={() => setView("page")}
                aria-label="Close our work"
                title="Close"
              >
                <IconX size={16} />
              </button>
            </div>
          </header>
          <div className="otgf-widget-chat-body">
            <StoriesBrowseApp slug={slug} embedded />
          </div>
        </>
      ) : widget ? (
        <>
          <header className="public-chat-dialog-toolbar otgf-widget-toolbar">
            <strong>Live chat</strong>
            <div className="public-chat-dialog-actions" ref={historyRef}>
              <button
                type="button"
                className="public-chat-more-button"
                onClick={() => {
                  refreshChatHistory();
                  setHistoryOpen((open) => !open);
                }}
                aria-label="Open chat history"
                aria-haspopup="menu"
                aria-expanded={historyOpen}
                title="Chat history"
              >
                <span aria-hidden>•••</span>
              </button>
              <button
                type="button"
                onClick={openChatInNewTab}
                aria-label="Open this chat in a new tab"
                title="Open in new tab"
              >
                <IconArrowUpRight size={16} />
              </button>
              <button
                type="button"
                onClick={startNewChat}
                aria-label="Start a new chat"
                title="New chat"
              >
                <span className="public-chat-plus" aria-hidden>+</span>
              </button>
              <button
                type="button"
                onClick={closeWidget}
                aria-label="Close live chat"
                title="Close"
              >
                <IconX size={16} />
              </button>

              {historyOpen ? (
                <div className="public-chat-history-menu" role="menu">
                  <div className="public-chat-history-heading">Your chats</div>
                  {chatHistory.length ? (
                    chatHistory.map((chat) => {
                      const current = chat.id === requestedChatId;
                      const opened = new Intl.DateTimeFormat(undefined, {
                        month: "short",
                        day: "numeric",
                        hour: "numeric",
                        minute: "2-digit",
                      }).format(chat.createdAt);
                      return (
                        <button
                          key={chat.id}
                          type="button"
                          className={`public-chat-history-item${current ? " is-current" : ""}`}
                          role="menuitem"
                          aria-current={current ? "true" : undefined}
                          onClick={() => openPreviousChat(chat.id)}
                        >
                          <span>{current ? "Current chat" : "Previous chat"}</span>
                          <small>{opened}</small>
                        </button>
                      );
                    })
                  ) : (
                    <p className="public-chat-history-empty">No previous chats yet</p>
                  )}
                </div>
              ) : null}
            </div>
          </header>
          <div className="otgf-widget-chat-body">
            <EmbedChat
              slug={slug}
              openSignal={chatOpenSignal}
              requestedChatId={requestedChatId}
              onChatOpened={handleChatOpened}
            />
          </div>
        </>
      ) : (
        <EmbedChat slug={slug} />
      )}
    </div>
  );
}
