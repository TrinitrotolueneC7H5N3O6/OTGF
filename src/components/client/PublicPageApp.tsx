"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { IconX } from "@/components/shared/Icons";
import { LinkSheetProvider } from "@/components/shared/LinkSheet";
import {
  createChatId,
  recallChatHistory,
  rememberChat,
  type RememberedChat,
} from "@/lib/chatMemory";
import { EmbedChat } from "./EmbedChat";
import { PreChatPage } from "./PreChatPage";
import { StoriesBrowseApp } from "./StoriesBrowseApp";

interface PublicPageAppProps {
  slug: string;
}

const OVERLAY_KEY = "otgfPublicOverlay";
type PublicOverlay = "chat" | "stories";

export function PublicPageApp({ slug }: PublicPageAppProps) {
  const [chatMounted, setChatMounted] = useState(false);
  const [chatOpen, setChatOpen] = useState(false);
  const [storiesMounted, setStoriesMounted] = useState(false);
  const [storiesOpen, setStoriesOpen] = useState(false);
  const [chatOpenSignal, setChatOpenSignal] = useState(0);
  const [requestedChatId, setRequestedChatId] = useState<string | null>(null);
  const [chatHistory, setChatHistory] = useState<RememberedChat[]>([]);
  const [historyOpen, setHistoryOpen] = useState(false);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const storiesDialogRef = useRef<HTMLDialogElement>(null);
  const historyRef = useRef<HTMLDivElement>(null);

  const applyOverlay = useCallback((kind: PublicOverlay | null) => {
    setHistoryOpen(false);
    setChatOpen(kind === "chat");
    setStoriesOpen(kind === "stories");
    if (kind === "chat") {
      setChatMounted(true);
      setChatOpenSignal((signal) => signal + 1);
    }
    if (kind === "stories") setStoriesMounted(true);
  }, []);

  const pushOverlay = useCallback((kind: PublicOverlay) => {
    const current = window.history.state?.[OVERLAY_KEY] as PublicOverlay | undefined;
    const next = { ...window.history.state, [OVERLAY_KEY]: kind };
    if (current) {
      window.history.replaceState(next, "", window.location.href);
    } else {
      window.history.pushState(next, "", window.location.href);
    }
  }, []);

  const closeOverlay = useCallback(() => {
    setHistoryOpen(false);
    setChatOpen(false);
    setStoriesOpen(false);
    if (window.history.state?.[OVERLAY_KEY]) {
      window.history.back();
    }
  }, []);

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

  const openChat = useCallback(() => {
    applyOverlay("chat");
    pushOverlay("chat");
  }, [applyOverlay, pushOverlay]);

  const openStories = useCallback(() => {
    applyOverlay("stories");
    pushOverlay("stories");
  }, [applyOverlay, pushOverlay]);

  useEffect(() => {
    function onPopState(event: PopStateEvent) {
      const kind = event.state?.[OVERLAY_KEY] as PublicOverlay | undefined;
      applyOverlay(kind === "chat" || kind === "stories" ? kind : null);
    }

    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, [applyOverlay]);

  useEffect(() => {
    const chatDialog = dialogRef.current;
    const storiesDialog = storiesDialogRef.current;
    if (chatDialog && !chatOpen && chatDialog.open) chatDialog.close();
    if (storiesDialog && !storiesOpen && storiesDialog.open) storiesDialog.close();
    if (chatDialog && chatOpen && !chatDialog.open) chatDialog.showModal();
    if (storiesDialog && storiesOpen && !storiesDialog.open) storiesDialog.showModal();
  }, [chatOpen, chatMounted, storiesOpen, storiesMounted]);

  useEffect(() => {
    if (!historyOpen) return;

    function onPointerDown(event: PointerEvent) {
      if (!historyRef.current?.contains(event.target as Node)) {
        setHistoryOpen(false);
      }
    }

    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [historyOpen]);

  return (
    <LinkSheetProvider>
      <div className="public-page-app">
        <PreChatPage slug={slug} onOpenChat={openChat} onOpenStories={openStories} modalChat />

        {chatMounted ? (
          <dialog
            ref={dialogRef}
            className="public-chat-dialog"
            aria-label="Live chat"
            onCancel={(event) => {
              event.preventDefault();
              if (historyOpen) {
                setHistoryOpen(false);
                return;
              }
              closeOverlay();
            }}
            onClick={(event) => {
              if (event.target === event.currentTarget) closeOverlay();
            }}
          >
            <header className="public-chat-dialog-toolbar">
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
                  onClick={startNewChat}
                  aria-label="Start a new chat"
                  title="New chat"
                >
                  <span className="public-chat-plus" aria-hidden>+</span>
                </button>
                <button
                  type="button"
                  onClick={closeOverlay}
                  aria-label="Minimize live chat"
                  title="Minimize"
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
            <div className="public-chat-dialog-body">
              <EmbedChat
                slug={slug}
                openSignal={chatOpenSignal}
                requestedChatId={requestedChatId}
                onChatOpened={handleChatOpened}
              />
            </div>
          </dialog>
        ) : null}

        {storiesMounted ? (
          <dialog
            ref={storiesDialogRef}
            className="public-chat-dialog public-stories-dialog"
            aria-label="Our work"
            onCancel={(event) => {
              event.preventDefault();
              closeOverlay();
            }}
            onClick={(event) => {
              if (event.target === event.currentTarget) closeOverlay();
            }}
          >
            <header className="public-chat-dialog-toolbar">
              <strong>Our work</strong>
              <div className="public-chat-dialog-actions">
                <button
                  type="button"
                  onClick={closeOverlay}
                  aria-label="Close our work"
                  title="Close"
                >
                  <IconX size={16} />
                </button>
              </div>
            </header>
            <div className="public-chat-dialog-body">
              <StoriesBrowseApp slug={slug} embedded />
            </div>
          </dialog>
        ) : null}
      </div>
    </LinkSheetProvider>
  );
}
