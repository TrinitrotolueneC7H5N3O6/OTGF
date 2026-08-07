"use client";

import Link from "next/link";
import { useEffect, useState, type FormEvent, type ReactNode } from "react";

type Mode = "create" | "signin";

interface SpaceAuthFormProps {
  spaceName?: string;
  claimSlug?: string;
  initialMode?: Mode;
  /** Hide title, copy, and mode tabs — use under an existing page headline. */
  bare?: boolean;
  onAuthenticated: () => void;
  onCancel?: () => void;
}

export function SpaceAuthForm({
  spaceName,
  claimSlug,
  initialMode = "create",
  bare = false,
  onAuthenticated,
  onCancel,
}: SpaceAuthFormProps) {
  const [mode, setMode] = useState<Mode>(initialMode);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setMode(initialMode);
  }, [initialMode]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const path = mode === "create" ? "/api/auth/register" : "/api/auth/login";
      const res = await fetch(path, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email,
          password,
          name: mode === "create" ? name : undefined,
          claimSlug: claimSlug || undefined,
        }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        throw new Error(data.error || "Something went wrong.");
      }
      onAuthenticated();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setBusy(false);
    }
  }

  const title =
    spaceName ||
    (mode === "create" ? "Create account" : "Log in to your space");
  const copy = spaceName
    ? mode === "create"
      ? "Create an account to own this space and open your floor."
      : "Sign in to claim this space and open your floor."
    : mode === "create"
      ? "Create an account to manage your floors."
      : "Sign in to open the floors you own.";

  return (
    <div className={`setup-done space-auth${bare ? " is-bare" : ""}`}>
      {!bare ? (
        <>
          <h2>{title}</h2>
          <p className="setup-done-copy">{copy}</p>

          <div className="space-auth-tabs" role="tablist" aria-label="Account">
            <button
              type="button"
              role="tab"
              aria-selected={mode === "create"}
              className={mode === "create" ? "is-active" : undefined}
              onClick={() => {
                setMode("create");
                setError(null);
              }}
            >
              Create account
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={mode === "signin"}
              className={mode === "signin" ? "is-active" : undefined}
              onClick={() => {
                setMode("signin");
                setError(null);
              }}
            >
              Sign in
            </button>
          </div>
        </>
      ) : null}

      <form
        className="setup-form space-auth-form"
        onSubmit={(e) => void onSubmit(e)}
      >
        {mode === "create" ? (
          <label>
            <span>Your name</span>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Optional"
              autoComplete="name"
            />
          </label>
        ) : null}
        <label>
          <span>Email</span>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@email.com"
            required
            autoComplete="email"
            autoFocus
          />
        </label>
        <label>
          <span>Password</span>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder={
              mode === "create" ? "At least 8 characters" : "Your password"
            }
            required
            minLength={8}
            autoComplete={
              mode === "create" ? "new-password" : "current-password"
            }
          />
        </label>
        {error ? <p className="space-auth-error">{error}</p> : null}
        <button type="submit" className="setup-go" disabled={busy}>
          {busy
            ? "Working…"
            : mode === "create"
              ? "Create account"
              : "Sign in"}
        </button>
        {onCancel ? (
          <button
            type="button"
            className="setup-again"
            onClick={onCancel}
            disabled={busy}
          >
            Back
          </button>
        ) : null}
      </form>
    </div>
  );
}

interface FloorAuthGateProps {
  slug: string;
  children: ReactNode;
}

export function FloorAuthGate({ slug, children }: FloorAuthGateProps) {
  const [state, setState] = useState<"loading" | "ok" | "denied">("loading");

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch(
          `/api/spaces/${encodeURIComponent(slug)}/access`,
          { cache: "no-store" },
        );
        const data = (await res.json()) as { owns?: boolean };
        if (!cancelled) setState(data.owns ? "ok" : "denied");
      } catch {
        if (!cancelled) setState("denied");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [slug]);

  if (state === "loading") {
    return <div className="client-chat-loading">Checking access…</div>;
  }

  if (state === "denied") {
    return (
      <div className="client-missing">
        <p className="brand-name">OTGF</p>
        <h1>Sign in required</h1>
        <p>Only the account that owns this space can open the floor.</p>
        <Link href="/">Go to home</Link>
      </div>
    );
  }

  return <>{children}</>;
}
