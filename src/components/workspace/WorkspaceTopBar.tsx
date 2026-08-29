"use client";

import Link from "next/link";
import type { FloorMember } from "@/lib/types";

export type WorkspaceView = "floor" | "dashboard";

interface WorkspaceTopBarProps {
  slug: string;
  businessName: string;
  view: WorkspaceView;
  live: boolean;
  onToggleLive: () => void;
  members: FloorMember[];
  floorMemberId: string;
  onChooseMember: (id: string) => void;
}

export function WorkspaceTopBar({
  slug,
  businessName,
  view,
  live,
  onToggleLive,
  members,
  floorMemberId,
  onChooseMember,
}: WorkspaceTopBarProps) {
  const switchHref =
    view === "floor" ? `/${slug}/dashboard` : `/${slug}/floor`;
  const switchLabel = view === "floor" ? "Dashboard" : "Floor";

  return (
    <header
      className={`workspace-brand ${view === "floor" ? "is-floor-focus" : ""}`}
    >
      <div className="brand-lockup">
        <span className="brand-mark" aria-hidden />
        <div>
          <p className="brand-name">OTGF - HelpDesk</p>
          <p className="brand-sub">{businessName}</p>
        </div>
      </div>

      <Link
        href={switchHref}
        className="workspace-view-toggle"
        title={switchLabel}
        aria-label={switchLabel}
      >
        {switchLabel}
      </Link>

      <div className="floor-share">
        {view === "floor" ? (
          <>
            <button
              type="button"
              className={`floor-live-btn ${live ? "is-live" : ""}`}
              onClick={onToggleLive}
              aria-pressed={live}
            >
              <span className="floor-live-dot" aria-hidden />
              <span className="floor-live-label">{live ? "Live" : "Away"}</span>
            </button>
            {members.length > 0 ? (
              <label className="floor-member-select">
                <span className="sr-only">Working as</span>
                <select
                  value={
                    members.some((m) => m.id === floorMemberId)
                      ? floorMemberId
                      : members[0].id
                  }
                  onChange={(e) => onChooseMember(e.target.value)}
                  aria-label="Working as"
                  title="Who is using the floor right now"
                >
                  {members.map((member) => (
                    <option key={member.id} value={member.id}>
                      {member.name}
                    </option>
                  ))}
                </select>
              </label>
            ) : null}
          </>
        ) : null}
      </div>
    </header>
  );
}
