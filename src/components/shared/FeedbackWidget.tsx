"use client";

import { useEffect, useId, useState, type FormEvent } from "react";
import { IconFeedback, IconX } from "@/components/shared/Icons";

export function FeedbackWidget() {
  const titleId = useId();
  const [open, setOpen] = useState(false);
  const [message, setMessage] = useState("");
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch("/api/auth/me", { cache: "no-store" });
        const data = (await res.json()) as {
          user?: { email?: string } | null;
        };
        const next = data.user?.email?.trim() || "";
        if (!cancelled && next) setEmail((prev) => prev || next);
      } catch {
        // ignore
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  function close() {
    setOpen(false);
    setError(null);
    setBusy(false);
    if (sent) {
      setSent(false);
      setMessage("");
    }
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    const body = message.trim();
    if (!body) {
      setError("Write a short note.");
      return;
    }
    setBusy(true);
    try {
      const res = await fetch("/api/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: body,
          email: email.trim() || undefined,
          page:
            typeof window !== "undefined" ? window.location.pathname : undefined,
        }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        throw new Error(data.error || "Could not send feedback.");
      }
      setSent(true);
      setMessage("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not send feedback.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <button
        type="button"
        className="feedback-fab"
        onClick={() => {
          setOpen(true);
          setSent(false);
          setError(null);
        }}
        aria-label="Send feedback"
      >
        <IconFeedback size={18} />
        <span className="feedback-fab-label" aria-hidden="true">
          Feedback
        </span>
      </button>

      {open ? (
        <div className="feedback-backdrop" onClick={close}>
          <div
            className="feedback-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby={titleId}
            onClick={(e) => e.stopPropagation()}
          >
            <header className="feedback-head">
              <div>
                <h2 id={titleId}>Feedback</h2>
                <p>Bugs, ideas, or anything unclear — send it over.</p>
              </div>
              <button
                type="button"
                className="btn-ghost icon-btn"
                onClick={close}
                aria-label="Close"
                title="Close"
              >
                <IconX />
              </button>
            </header>

            {sent ? (
              <div className="feedback-done">
                <p>Thanks — we got it.</p>
                <button type="button" className="btn-solid" onClick={close}>
                  Close
                </button>
              </div>
            ) : (
              <form
                className="feedback-form"
                onSubmit={(e) => void onSubmit(e)}
              >
                <label>
                  <span>Message</span>
                  <textarea
                    value={message}
                    onChange={(e) => setMessage(e.target.value)}
                    placeholder="What’s on your mind?"
                    rows={5}
                    required
                    autoFocus
                  />
                </label>
                <label>
                  <span>Email (optional)</span>
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="you@email.com"
                    autoComplete="email"
                  />
                </label>
                {error ? <p className="space-auth-error">{error}</p> : null}
                <button type="submit" className="btn-solid" disabled={busy}>
                  {busy ? "Sending…" : "Send feedback"}
                </button>
              </form>
            )}
          </div>
        </div>
      ) : null}
    </>
  );
}
