"use client";

import {
  useEffect,
  useRef,
  useState,
  type FormEvent,
  type KeyboardEvent,
} from "react";
import type { Client, Message } from "@/lib/types";
import {
  ASSIST_BEHAVIOR_MAX,
  DEFAULT_ASSIST_BEHAVIOR,
  type AssistPace,
  type AssistStance,
} from "@/lib/assistBehavior";
import { IconArrowSend, IconPencil, IconX } from "@/components/shared/Icons";

const ASSIST_ENABLED_KEY = "otgf-assist-enabled";

type ThoughtStep = {
  label: string;
  detail: string;
};

type AssistMove = {
  title: string;
  detail: string;
};

type AssistReply = {
  title: string;
  text: string;
};

type AssistRisk = {
  label: string;
  detail: string;
};

type ChatTurn = {
  id: string;
  role: "user" | "assistant";
  content: string;
};

type CoachPayload = {
  stance?: AssistStance;
  risks?: AssistRisk[];
  pace?: AssistPace | null;
  paceNote?: string;
  thoughts?: ThoughtStep[];
  moves?: AssistMove[];
  replies?: AssistReply[];
  nudge?: string;
  reply?: string;
  error?: string;
};

interface AssistPaneProps {
  client?: Client;
  messages: Message[];
  businessName: string;
  trade: string;
  behavior: string;
  onChangeBehavior: (behavior: string) => void;
  onUseSuggestion: (text: string) => void;
}

function readAssistEnabled() {
  if (typeof window === "undefined") return true;
  try {
    const raw = window.localStorage.getItem(ASSIST_ENABLED_KEY);
    if (raw === null) return true;
    return raw === "1" || raw === "true";
  } catch {
    return true;
  }
}

function stanceLabel(stance: AssistStance) {
  return stance.charAt(0).toUpperCase() + stance.slice(1);
}

function paceLabel(pace: AssistPace) {
  const map: Record<AssistPace, string> = {
    hold: "Hold",
    probe: "Probe",
    advance: "Advance",
    close: "Close",
  };
  return map[pace];
}

export function AssistPane({
  client,
  messages,
  businessName,
  trade,
  behavior,
  onChangeBehavior,
  onUseSuggestion,
}: AssistPaneProps) {
  const [enabled, setEnabled] = useState(true);
  const [behaviorOpen, setBehaviorOpen] = useState(false);
  const [behaviorDraft, setBehaviorDraft] = useState(behavior);
  const [stance, setStance] = useState<AssistStance | null>(null);
  const [risks, setRisks] = useState<AssistRisk[]>([]);
  const [pace, setPace] = useState<AssistPace | null>(null);
  const [paceNote, setPaceNote] = useState("");
  const [nudge, setNudge] = useState("");
  const [thoughts, setThoughts] = useState<ThoughtStep[]>([]);
  const [visibleThoughtCount, setVisibleThoughtCount] = useState(0);
  const [thoughtsOpen, setThoughtsOpen] = useState(false);
  const [moves, setMoves] = useState<AssistMove[]>([]);
  const [replies, setReplies] = useState<AssistReply[]>([]);
  const [chat, setChat] = useState<ChatTurn[]>([]);
  const [draft, setDraft] = useState("");
  const [loading, setLoading] = useState(false);
  const [coachLoading, setCoachLoading] = useState(false);
  const [chatting, setChatting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [thoughtMs, setThoughtMs] = useState<number | null>(null);
  const requestIdRef = useRef(0);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const clientIdRef = useRef<string | undefined>(undefined);

  function clearCoachChannels() {
    setStance(null);
    setRisks([]);
    setPace(null);
    setPaceNote("");
    setNudge("");
    setThoughts([]);
    setVisibleThoughtCount(0);
    setMoves([]);
    setReplies([]);
    setThoughtMs(null);
  }

  function applyWhisper(data: CoachPayload) {
    if (data.stance) setStance(data.stance);
    setRisks(data.risks ?? []);
    setPace(data.pace ?? null);
    setPaceNote(data.paceNote ?? "");
    setNudge(data.nudge ?? "");
  }

  function applyCoach(data: CoachPayload, expandThoughts = false) {
    if (data.thoughts) {
      setThoughts(data.thoughts);
      setVisibleThoughtCount(0);
      if (expandThoughts) setThoughtsOpen(true);
    }
    if (data.moves) setMoves(data.moves);
    if (data.replies) setReplies(data.replies);
  }

  function applyCoachChannels(data: CoachPayload, expandThoughts = false) {
    applyWhisper(data);
    applyCoach(data, expandThoughts);
  }

  useEffect(() => {
    setEnabled(readAssistEnabled());
  }, []);

  useEffect(() => {
    if (!behaviorOpen) {
      setBehaviorDraft(behavior.trim() || DEFAULT_ASSIST_BEHAVIOR);
    }
  }, [behavior, behaviorOpen]);

  useEffect(() => {
    if (!behaviorOpen) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setBehaviorOpen(false);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [behaviorOpen]);

  function setAssistEnabled(next: boolean) {
    setEnabled(next);
    try {
      window.localStorage.setItem(ASSIST_ENABLED_KEY, next ? "1" : "0");
    } catch {
      // ignore
    }
    if (!next) {
      requestIdRef.current += 1;
      setLoading(false);
      setCoachLoading(false);
      setChatting(false);
      clearCoachChannels();
      setError(null);
    }
  }

  function openBehaviorEditor() {
    setBehaviorDraft(behavior.trim() || DEFAULT_ASSIST_BEHAVIOR);
    setBehaviorOpen(true);
  }

  function saveBehavior() {
    const next = behaviorDraft.trim().slice(0, ASSIST_BEHAVIOR_MAX);
    onChangeBehavior(next === DEFAULT_ASSIST_BEHAVIOR.trim() ? "" : next);
    setBehaviorOpen(false);
  }

  function resetBehaviorDraft() {
    setBehaviorDraft(DEFAULT_ASSIST_BEHAVIOR);
  }

  useEffect(() => {
    if (visibleThoughtCount >= thoughts.length) return;
    const timer = window.setTimeout(() => {
      setVisibleThoughtCount((n) => Math.min(n + 1, thoughts.length));
    }, 140);
    return () => window.clearTimeout(timer);
  }, [thoughts, visibleThoughtCount]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [chat, chatting]);

  function threadPayload() {
    return messages.slice(-20).map((m) => ({
      from: m.from,
      body: m.body,
      kind: m.kind,
    }));
  }

  async function observe(signal?: AbortSignal) {
    if (!enabled || !client) {
      clearCoachChannels();
      setError(null);
      return;
    }

    const id = ++requestIdRef.current;
    const started = Date.now();
    setLoading(true);
    setCoachLoading(true);
    setError(null);
    clearCoachChannels();
    setThoughtsOpen(false);

    const baseBody = {
      clientName: client.name,
      businessName,
      trade,
      behavior,
      messages: threadPayload(),
    };

    async function loadWhisper() {
      const res = await fetch("/api/ai/suggest", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal,
        body: JSON.stringify({ ...baseBody, mode: "whisper" }),
      });
      const data = (await res.json()) as CoachPayload;
      if (requestIdRef.current !== id) return;
      if (!res.ok) throw new Error(data.error || "Could not read the room.");
      applyWhisper(data);
      setLoading(false);
      setThoughtMs(Date.now() - started);
    }

    async function loadCoach() {
      const res = await fetch("/api/ai/suggest", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal,
        body: JSON.stringify({ ...baseBody, mode: "coach" }),
      });
      const data = (await res.json()) as CoachPayload;
      if (requestIdRef.current !== id) return;
      if (!res.ok) throw new Error(data.error || "Could not coach the thread.");
      applyCoach(data);
      setThoughtMs(Date.now() - started);
    }

    try {
      const results = await Promise.allSettled([loadWhisper(), loadCoach()]);
      if (requestIdRef.current !== id) return;

      const failed = results.filter((r) => r.status === "rejected");
      if (failed.length === results.length) {
        const reason = failed[0];
        const message =
          reason.status === "rejected" && reason.reason instanceof Error
            ? reason.reason.message
            : "Could not analyze chat.";
        setError(message);
      } else if (failed.length > 0) {
        // Whispers or coach may still have landed; soft-fail the rest.
        const reason = failed[0];
        if (reason.status === "rejected" && reason.reason instanceof Error) {
          console.warn("Assist partial failure:", reason.reason.message);
        }
      }
    } catch (err) {
      if (signal?.aborted) return;
      if (requestIdRef.current !== id) return;
      setError(err instanceof Error ? err.message : "Could not analyze chat.");
    } finally {
      if (requestIdRef.current === id) {
        setLoading(false);
        setCoachLoading(false);
      }
    }
  }

  async function askAssist(e?: FormEvent) {
    e?.preventDefault();
    if (!enabled || !client || !draft.trim() || chatting) return;

    const question = draft.trim();
    const userTurn: ChatTurn = {
      id: `u-${Date.now()}`,
      role: "user",
      content: question,
    };
    const nextChat = [...chat, userTurn];
    setChat(nextChat);
    setDraft("");
    setChatting(true);
    setError(null);

    try {
      const res = await fetch("/api/ai/suggest", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mode: "chat",
          clientName: client.name,
          businessName,
          trade,
          behavior,
          messages: threadPayload(),
          question,
          chat: nextChat.map((t) => ({
            role: t.role,
            content: t.content,
          })),
        }),
      });

      const data = (await res.json()) as CoachPayload;

      if (!res.ok) throw new Error(data.error || "Could not reply.");

      applyCoachChannels(data, true);

      setChat((prev) => [
        ...prev,
        {
          id: `a-${Date.now()}`,
          role: "assistant",
          content: data.reply?.trim() || "…",
        },
      ]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not reply.");
    } finally {
      setChatting(false);
    }
  }

  function onComposerKey(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      void askAssist();
    }
  }

  useEffect(() => {
    if (!enabled || !client) {
      if (!client) {
        clearCoachChannels();
        setChat([]);
        setError(null);
        setLoading(false);
      }
      return;
    }

    if (clientIdRef.current !== client.id) {
      clientIdRef.current = client.id;
      setChat([]);
    }

    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      void observe(controller.signal);
    }, 280);

    return () => {
      controller.abort();
      window.clearTimeout(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, client?.id, messages.at(-1)?.id, businessName, trade, behavior]);

  const headCopy = !client
    ? "Open a chat to think along with the thread."
    : enabled
      ? `Reading ${client.name}'s chat out loud`
      : "Assist is off for this floor.";

  const headActions = (
    <div className="assist-head-actions">
      {enabled && client ? (
        <button
          type="button"
          className="assist-refresh"
          onClick={() => void observe()}
          disabled={loading || coachLoading}
        >
          {loading ? "…" : "Check me"}
        </button>
      ) : null}
      <button
        type="button"
        className="btn-ghost icon-btn assist-edit-btn"
        onClick={openBehaviorEditor}
        aria-label="Edit Assist behavior"
        title="Edit Assist behavior"
      >
        <IconPencil size={14} />
      </button>
      <button
        type="button"
        className={`assist-power${enabled ? " is-on" : ""}`}
        role="switch"
        aria-checked={enabled}
        aria-label={enabled ? "Turn Assist off" : "Turn Assist on"}
        title={enabled ? "Assist on" : "Assist off"}
        onClick={() => setAssistEnabled(!enabled)}
      >
        <span className="assist-power-track" aria-hidden>
          <span className="assist-power-thumb" />
        </span>
      </button>
    </div>
  );

  const behaviorModal = behaviorOpen ? (
    <div
      className="assist-behavior-backdrop"
      onClick={() => setBehaviorOpen(false)}
    >
      <div
        className="assist-behavior-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="assist-behavior-title"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="assist-behavior-head">
          <div>
            <h2 id="assist-behavior-title">Assist behavior</h2>
            <p>
              Mode-switching coach instructions — read the room, catch
              mistakes, pace, then coach.
            </p>
          </div>
          <button
            type="button"
            className="btn-ghost icon-btn"
            onClick={() => setBehaviorOpen(false)}
            aria-label="Close"
            title="Close"
          >
            <IconX />
          </button>
        </header>
        <div className="assist-behavior-body">
          <label>
            <span>Instructions</span>
            <textarea
              value={behaviorDraft}
              onChange={(e) =>
                setBehaviorDraft(e.target.value.slice(0, ASSIST_BEHAVIOR_MAX))
              }
              rows={14}
              autoFocus
            />
          </label>
          <p className="assist-behavior-hint">
            Edit any section. Reset restores the current default coach style.
          </p>
          <div className="assist-behavior-actions">
            <button
              type="button"
              className="btn-ghost"
              onClick={resetBehaviorDraft}
            >
              Reset to default
            </button>
            <div className="assist-behavior-actions-end">
              <button
                type="button"
                className="btn-ghost"
                onClick={() => setBehaviorOpen(false)}
              >
                Cancel
              </button>
              <button type="button" className="btn-solid" onClick={saveBehavior}>
                Save
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  ) : null;

  if (!client) {
    return (
      <div className={`assist${!enabled ? " is-off" : ""}`}>
        <div className="assist-head">
          <div className="assist-head-row">
            <div>
              <h2>Assist</h2>
              <p>{headCopy}</p>
            </div>
            {headActions}
          </div>
        </div>
        <div className="assist-empty">
          <p>
            {enabled
              ? "Stance, risks, and pace cues appear once a conversation is open."
              : "Turn Assist on to think along with customer chats."}
          </p>
        </div>
        {behaviorModal}
      </div>
    );
  }

  if (!enabled) {
    return (
      <div className="assist is-off">
        <div className="assist-head">
          <div className="assist-head-row">
            <div>
              <h2>Assist</h2>
              <p>{headCopy}</p>
            </div>
            {headActions}
          </div>
        </div>
        <div className="assist-empty">
          <p>Assist is off. Flip the switch to start reading this thread.</p>
        </div>
        {behaviorModal}
      </div>
    );
  }

  const shownThoughts = thoughts.slice(0, visibleThoughtCount);
  const thinkingLabel = loading
    ? "Reading the room…"
    : coachLoading
      ? "Coaching next moves…"
      : thoughtMs != null
        ? `Thought trail · ${Math.max(1, Math.round(thoughtMs / 1000))}s`
        : "Thought trail";
  const hasWhisper = Boolean(stance || pace || risks.length || nudge);
  const hasBody =
    hasWhisper ||
    moves.length > 0 ||
    replies.length > 0 ||
    thoughts.length > 0 ||
    loading ||
    coachLoading;

  return (
    <div className="assist">
      <div className="assist-head">
        <div className="assist-head-row">
          <div>
            <h2>Assist</h2>
            <p>{headCopy}</p>
          </div>
          {headActions}
        </div>
      </div>

      <div className="assist-body">
        {error ? (
          <div className="assist-error" role="alert">
            <p>{error}</p>
            <button
              type="button"
              className="assist-refresh"
              onClick={() => void observe()}
            >
              Try again
            </button>
          </div>
        ) : null}

        {loading && !hasWhisper ? (
          <div className="assist-whisper is-pending">
            <p>Scanning for stance, risks, and pace…</p>
          </div>
        ) : null}

        {hasWhisper ? (
          <section className="assist-whisper" aria-label="Coach whispers">
            <div className="assist-whisper-pills">
              {stance ? (
                <span className={`assist-pill assist-pill-stance is-${stance}`}>
                  {stanceLabel(stance)}
                </span>
              ) : null}
              {pace ? (
                <span className={`assist-pill assist-pill-pace is-${pace}`}>
                  {paceLabel(pace)}
                  {paceNote ? ` · ${paceNote}` : ""}
                </span>
              ) : null}
            </div>

            {risks.length > 0 ? (
              <ul className="assist-risk-list">
                {risks.map((risk, index) => (
                  <li key={`${risk.label}-${index}`}>
                    <span className="assist-risk-label">
                      {risk.label || "Watch"}
                    </span>
                    {risk.detail ? <p>{risk.detail}</p> : null}
                  </li>
                ))}
              </ul>
            ) : null}

            {nudge ? (
              <p className="assist-nudge">
                <span>Ask yourself</span>
                {nudge}
              </p>
            ) : null}
          </section>
        ) : null}

        {moves.length > 0 ? (
          <section className="assist-moves">
            <h3>Try this</h3>
            <ul>
              {moves.map((move, index) => (
                <li key={`${move.title}-${index}`}>
                  <article className="assist-move-card">
                    <p className="assist-move-title">{move.title}</p>
                    <p className="assist-move-detail">{move.detail}</p>
                  </article>
                </li>
              ))}
            </ul>
          </section>
        ) : coachLoading ? (
          <section className="assist-moves is-pending">
            <h3>Try this</h3>
            <p className="assist-coach-pending">Working up next moves…</p>
          </section>
        ) : null}

        {replies.length > 0 ? (
          <section className="assist-moves">
            <h3>Draft replies</h3>
            <ul className="assist-list">
              {replies.map((item, index) => (
                <li key={`${item.title}-${index}`}>
                  <article className="assist-card">
                    <div className="assist-card-copy">
                      <p className="assist-card-title">
                        {item.title || "Reply"}
                      </p>
                      <p className="assist-card-text">{item.text}</p>
                    </div>
                    <button
                      type="button"
                      className="assist-use"
                      onClick={() => onUseSuggestion(item.text)}
                      aria-label="Use suggestion"
                      title="Use in composer"
                    >
                      →
                    </button>
                  </article>
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        <section className="assist-thoughts">
          <button
            type="button"
            className="assist-thoughts-toggle"
            onClick={() => setThoughtsOpen((v) => !v)}
            aria-expanded={thoughtsOpen}
          >
            <span className="assist-thoughts-pulse" aria-hidden />
            <span>{thinkingLabel}</span>
            <span className="assist-thoughts-caret" aria-hidden>
              {thoughtsOpen ? "▾" : "▸"}
            </span>
          </button>

          {thoughtsOpen ? (
            <ol className="assist-thought-trail">
              {loading && shownThoughts.length === 0 ? (
                <li className="assist-thought-step is-pending">
                  <span className="assist-thought-label">Scanning thread</span>
                  <p>
                    Noticing stance, risks, and what to do in the next minute…
                  </p>
                </li>
              ) : null}
              {shownThoughts.map((step, index) => (
                <li
                  key={`${step.label}-${index}`}
                  className="assist-thought-step"
                >
                  <span className="assist-thought-label">
                    {step.label || `Step ${index + 1}`}
                  </span>
                  {step.detail ? <p>{step.detail}</p> : null}
                </li>
              ))}
              {!loading && thoughts.length === 0 ? (
                <li className="assist-thought-step">
                  <p>No extra trail this time — whispers above are the signal.</p>
                </li>
              ) : null}
            </ol>
          ) : null}
        </section>

        {!loading && !error && !hasBody ? (
          <div className="assist-empty">
            <p>No read yet. Hit Check me to walk the thread.</p>
          </div>
        ) : null}
      </div>

      <div className="assist-chat">
        <div className="assist-chat-stream">
          {chat.length === 0 ? (
            <p className="assist-chat-hint">
              Ask anything about this chat — tone, next move, what to avoid…
            </p>
          ) : (
            chat.map((turn) => (
              <div
                key={turn.id}
                className={`assist-chat-bubble assist-chat-${turn.role}`}
              >
                <p>{turn.content}</p>
              </div>
            ))
          )}
          {chatting ? (
            <div className="assist-chat-bubble assist-chat-assistant is-pending">
              <p>Thinking…</p>
            </div>
          ) : null}
          <div ref={chatEndRef} />
        </div>
        <form
          className="assist-chat-composer"
          onSubmit={(e) => void askAssist(e)}
        >
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={onComposerKey}
            placeholder="Ask Assist…"
            rows={2}
            disabled={chatting}
          />
          <button
            type="submit"
            className="assist-use"
            aria-label="Send"
            disabled={chatting || !draft.trim()}
          >
            <IconArrowSend size={14} />
          </button>
        </form>
      </div>
      {behaviorModal}
    </div>
  );
}
