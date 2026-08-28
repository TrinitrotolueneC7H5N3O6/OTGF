"use client";

import Link from "next/link";
import { useEffect, useMemo, useState, type FormEvent } from "react";
import type { Business } from "@/lib/types";
import { createBusiness, listBusinesses } from "@/lib/store";
import { IconChevronDown } from "@/components/shared/Icons";
import { HOW_STEPS, HowDemoFrame } from "./HowDemo";
import { SpaceAuthForm } from "./SpaceAuthForm";

type Step = "loading" | "form" | "auth" | "login" | "ready" | "owned";

function possessive(name: string) {
  return name.endsWith("s") || name.endsWith("S") ? `${name}'` : `${name}'s`;
}

export function HomeSetup() {
  const [name, setName] = useState("");
  const [created, setCreated] = useState<Business | null>(null);
  const [owned, setOwned] = useState<Business | null>(null);
  const [step, setStep] = useState<Step>("loading");
  const [copied, setCopied] = useState(false);
  const [origin, setOrigin] = useState("");
  const [howStep, setHowStep] = useState(0);
  const [howStarted, setHowStarted] = useState(false);
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  useEffect(() => {
    setOrigin(window.location.origin);
    void (async () => {
      try {
        const res = await fetch("/api/auth/me", { cache: "no-store" });
        const data = (await res.json()) as { user?: { id: string } | null };
        if (data.user) {
          const spaces = await listBusinesses();
          if (spaces[0]) {
            setOwned(spaces[0]);
            setStep("owned");
            return;
          }
        }
      } catch {
        // fall through
      }
      setStep("form");
    })();
  }, []);

  const clientUrl = useMemo(() => {
    if (!created) return "";
    return `${origin}/${created.slug}`;
  }, [created, origin]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setCreateError(null);
    setCreating(true);
    try {
      const space = await createBusiness(name, "salon");
      setCreated(space.business);
      setCopied(false);
      try {
        const res = await fetch("/api/auth/me", { cache: "no-store" });
        const data = (await res.json()) as { user?: { id: string } | null };
        if (data.user) {
          setOwned(space.business);
          setStep("ready");
          return;
        }
      } catch {
        // fall through to auth
      }
      setStep("auth");
    } catch (err) {
      setCreateError(
        err instanceof Error ? err.message : "Could not create space.",
      );
    } finally {
      setCreating(false);
    }
  }

  async function onAuthenticated() {
    const spaces = await listBusinesses();
    const primary = created ?? spaces[0] ?? null;
    if (created && step === "auth") {
      setOwned(created);
      setStep("ready");
      return;
    }
    if (primary) {
      setOwned(primary);
      setCreated(null);
      setStep("owned");
      return;
    }
    setStep("form");
    setCreated(null);
  }

  async function copyUrl() {
    if (!clientUrl) return;
    await navigator.clipboard.writeText(clientUrl);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1600);
  }

  function advanceHow() {
    if (!howStarted) {
      setHowStarted(true);
      setHowStep(0);
      return;
    }
    if (howStep >= HOW_STEPS.length - 1) {
      setHowStarted(false);
      setHowStep(0);
      window.requestAnimationFrame(() => {
        window.scrollTo({ top: 0, behavior: "smooth" });
        document.querySelector(".home-hero")?.scrollTo({ top: 0 });
      });
      return;
    }
    setHowStep((n) => n + 1);
  }

  const howLabel = !howStarted
    ? "Tap to see how it works"
    : howStep === HOW_STEPS.length - 1
      ? "Tap to go back"
      : "Tap for next step";

  const howLabelShort = !howStarted
    ? "See how it works"
    : howStep === HOW_STEPS.length - 1
      ? "Back"
      : "Next";

  const showMarketing = step === "form" || step === "login" || step === "auth";

  return (
    <div className={`home${howStarted ? " is-howing" : ""}`}>
      <header className="home-top">
        <div className="brand-lockup">
          <span className="brand-mark" aria-hidden>
            <span />
            <span />
            <span />
          </span>
          <p className="brand-name">OTGF</p>
        </div>
      </header>

      <div className="home-stage">
        <main className="home-hero">
          {showMarketing ? (
            <>
              <h1 className="home-title">
                One layer for all your customer service conversations.
              </h1>
              <p className="home-lede">
                Create a space. Share one link on your website, Google Maps,
                Yelp, Instagram, and anywhere else customers find you. Each
                customer opens that link and starts a private chat. You see every
                chat in one place and reply from there.
              </p>
            </>
          ) : null}

          {step === "loading" ? (
            <p className="home-lede">Loading…</p>
          ) : null}

          {step === "form" ? (
            <form className="setup-form" onSubmit={(e) => void onSubmit(e)}>
              <label>
                <span>Business Name</span>
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. River Street Salon"
                  autoFocus
                  required
                />
              </label>
              <button type="submit" className="setup-go" disabled={creating}>
                {creating ? "Creating…" : "Create chat space"}
              </button>
              <button
                type="button"
                className="btn-ghost setup-login-btn"
                onClick={() => setStep("login")}
              >
                Log in to space
              </button>
              {createError ? (
                <p className="space-auth-error">{createError}</p>
              ) : null}
            </form>
          ) : null}

          {step === "auth" && created ? (
            <SpaceAuthForm
              spaceName={created.name}
              claimSlug={created.slug}
              onAuthenticated={() => void onAuthenticated()}
            />
          ) : null}

          {step === "login" ? (
            <SpaceAuthForm
              bare
              initialMode="signin"
              onAuthenticated={() => void onAuthenticated()}
              onCancel={() => setStep("form")}
            />
          ) : null}

          {step === "owned" && owned ? (
            <div className="setup-done home-owned">
              <Link
                href={`/${owned.slug}/floor`}
                className="btn-solid setup-go home-access-floor"
              >
                Access {possessive(owned.name)} Floor
              </Link>
            </div>
          ) : null}

          {step === "ready" && created ? (
            <div className="setup-done">
              <h2>{created.name}</h2>
              <p className="setup-done-copy">
                Share this entry link. Anyone who opens it gets a unique chat
                URL.
              </p>
              <div className="url-bar">
                <code>{clientUrl}</code>
                <button type="button" onClick={copyUrl}>
                  {copied ? "Copied" : "Copy"}
                </button>
              </div>
              <div className="setup-actions">
                <Link href={`/${created.slug}/floor`} className="btn-solid">
                  Access {possessive(created.name)} Floor
                </Link>
                <Link href={`/${created.slug}`} className="btn-ghost">
                  Preview chat
                </Link>
              </div>
            </div>
          ) : null}
        </main>

        <aside className="home-demo-pane" aria-live="polite">
          {howStarted ? (
            <HowDemoFrame key={howStep} stepIndex={howStep} />
          ) : (
            <div className="home-demo-idle" aria-hidden>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                className="home-ascii-idle"
                src="/ascii-dutch-houses.png"
                alt=""
              />
            </div>
          )}
        </aside>
      </div>

      <button
        type="button"
        className="home-how-btn"
        onClick={advanceHow}
        aria-label={howLabel}
      >
        <span className="home-how-label-full">{howLabel}</span>
        <span className="home-how-label-short">{howLabelShort}</span>
        <IconChevronDown size={20} />
      </button>
    </div>
  );
}
