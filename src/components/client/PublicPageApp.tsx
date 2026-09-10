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

interface PublicPageAppProps {
  slug: string;
}

const CHAT_HISTORY_KEY = "otgfChatOverlay";

export function PublicPageApp({ slug }: PublicPageAppProps) {
  const [chatMounted, setChatMounted] = useState(false);
  const [chatOpen, setChatOpen] = useState(false);
  const [chatOpenSignal, setChatOpenSignal] = useState(0);
  const [requestedChatId, setRequestedChatId] = useState<string | null>(null);
  const [chatHistory, setChatHistory] = useState<RememberedChat[]>([]);
  const [historyOpen, setHistoryOpen] = useState(false);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const historyRef = useRef<HTMLDivElement>(null);

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
    setChatMounted(true);
    setChatOpen(true);
    setChatOpenSignal((signal) => signal + 1);
    if (!window.history.state?.[CHAT_HISTORY_KEY]) {
      window.history.pushState(
        { ...window.history.state, [CHAT_HISTORY_KEY]: true },
        "",
        window.location.href,
      );
    }
  }, []);

  const closeChat = useCallback(() => {
    setHistoryOpen(false);
    setChatOpen(false);
    if (window.history.state?.[CHAT_HISTORY_KEY]) {
      window.history.back();
    }
  }, []);

  useEffect(() => {
    function onPopState(event: PopStateEvent) {
      const nextOpen = Boolean(event.state?.[CHAT_HISTORY_KEY]);
      if (nextOpen) setChatMounted(true);
      if (nextOpen) setChatOpenSignal((signal) => signal + 1);
      setChatOpen(nextOpen);
    }

    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, []);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (chatOpen && !dialog.open) dialog.showModal();
    if (!chatOpen && dialog.open) dialog.close();
  }, [chatOpen, chatMounted]);

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
        <PreChatPage slug={slug} onOpenChat={openChat} modalChat />

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
              closeChat();
            }}
            onClick={(event) => {
              if (event.target === event.currentTarget) closeChat();
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
                  onClick={closeChat}
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
      </div>
    </LinkSheetProvider>
  );
}
