"use client";

import { useEffect, useState } from "react";

type DbTarget = "local" | "supabase";

type Status = {
  enabled: boolean;
  target: DbTarget;
  localConfigured: boolean;
  supabaseConfigured: boolean;
};

export function DbToggle() {
  const [status, setStatus] = useState<Status | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch("/api/dev/db", { cache: "no-store" });
        if (res.status === 404) return;
        const data = (await res.json()) as Status;
        if (!cancelled && data.enabled) setStatus(data);
      } catch {
        // ignore
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (!status?.enabled) return null;

  async function switchTo(target: DbTarget) {
    if (busy || target === status?.target) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/dev/db", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ target }),
      });
      const data = (await res.json().catch(() => ({}))) as Status & {
        error?: string;
      };
      if (!res.ok) {
        throw new Error(data.error || "Could not switch database.");
      }
      setStatus({
        enabled: true,
        target: data.target,
        localConfigured: data.localConfigured,
        supabaseConfigured: data.supabaseConfigured,
      });
      window.location.reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Switch failed");
      setBusy(false);
    }
  }

  const localOn = status.target === "local";

  return (
    <div className="db-toggle-wrap">
      <div
        className="db-toggle"
        role="group"
        aria-label="Database target"
        title={
          localOn
            ? "Using local Postgres (Prisma). Click Supabase when you want the cloud DB."
            : "Using Supabase. Switch to local to avoid cloud usage."
        }
      >
        <button
          type="button"
          className={localOn ? "is-on" : ""}
          disabled={busy || !status.localConfigured}
          onClick={() => void switchTo("local")}
        >
          Local
        </button>
        <button
          type="button"
          className={!localOn ? "is-on" : ""}
          disabled={busy || !status.supabaseConfigured}
          onClick={() => void switchTo("supabase")}
        >
          Supabase
        </button>
      </div>
      {error ? <p className="db-toggle-error">{error}</p> : null}
      {!status.localConfigured ? (
        <p className="db-toggle-hint">Set LOCAL_DATABASE_URL</p>
      ) : null}
    </div>
  );
}
