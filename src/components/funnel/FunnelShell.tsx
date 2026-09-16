"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import type { ReactNode } from "react";
import { IconChevronDown } from "@/components/shared/Icons";
import { LEAD_FUNNEL_STEPS, stepIndexForPath } from "@/lib/funnel/steps";

/** Shared page-by-page setup chrome: progress dots, back nav, one focused
 * screen at a time. Reused by every step under /build so funnel *setup*
 * itself feels like modern mobile-app onboarding, not a dashboard. */
export function FunnelShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const isLeadsInbox = pathname === "/build/leads";
  const stepIndex = stepIndexForPath(pathname ?? "/build");
  const step = LEAD_FUNNEL_STEPS[stepIndex];
  const prevPath = stepIndex > 0 ? LEAD_FUNNEL_STEPS[stepIndex - 1].path : "/";

  return (
    <div className="funnel-shell">
      <header className="funnel-top">
        <button
          type="button"
          className="funnel-back"
          onClick={() => router.push(prevPath)}
          aria-label="Back"
        >
          <span className="funnel-back-icon">
            <IconChevronDown size={18} />
          </span>
        </button>

        <div className="funnel-brand">
          <span className="brand-mark" aria-hidden />
          <p className="brand-name">RouteCraft</p>
        </div>

        {!isLeadsInbox ? (
          <Link href="/build/leads" className="funnel-leads-link">
            Leads
          </Link>
        ) : (
          <span className="funnel-leads-link is-placeholder" aria-hidden />
        )}
      </header>

      {!isLeadsInbox ? (
        <div className="funnel-progress" role="progressbar" aria-valuenow={stepIndex + 1} aria-valuemin={1} aria-valuemax={LEAD_FUNNEL_STEPS.length}>
          {LEAD_FUNNEL_STEPS.map((s, i) => (
            <span
              key={s.path}
              className={
                i === stepIndex
                  ? "is-active"
                  : i < stepIndex
                    ? "is-done"
                    : undefined
              }
            />
          ))}
        </div>
      ) : null}

      <main className="funnel-stage">
        {!isLeadsInbox ? <p className="funnel-eyebrow">{step.eyebrow}</p> : null}
        <div className="funnel-card">{children}</div>
      </main>
    </div>
  );
}
