"use client";

import Link from "next/link";
import type { FloorMember } from "@/lib/types";
import { dashHref, type DashNav } from "@/lib/workspaceNav";

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
  brandNav?: Extract<DashNav, "floor" | "dashboard">;
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
  brandNav = "floor",
}: WorkspaceTopBarProps) {
  return (
    <header
      className={`workspace-brand ${view === "floor" ? "is-floor-focus" : ""}`}
    >
      <Link href={dashHref(slug, brandNav)} className="brand-lockup">
        <span className="brand-mark" aria-hidden />
        <div>
          <p className="brand-name">OTGF - Floor Board</p>
          <p className="brand-sub">{businessName}</p>
        </div>
      </Link>

      <div className="floor-share">
        <Link
          href={dashHref(slug, view === "floor" ? "dashboard" : "floor")}
          className="workspace-view-toggle"
          title={view === "floor" ? "Dashboard" : "Live Chat"}
          aria-label={view === "floor" ? "Dashboard" : "Live Chat"}
        >
          {view === "floor" ? "Dashboard" : "Live Chat"}
        </Link>
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
              title="Who is answering live chat right now"
            >
              {members.map((member) => (
                <option key={member.id} value={member.id}>
                  {member.name}
                </option>
              ))}
            </select>
          </label>
        ) : null}
      </div>
    </header>
  );
}
