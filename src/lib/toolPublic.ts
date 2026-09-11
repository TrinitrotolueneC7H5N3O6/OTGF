import type { FloorSettings, PreChatLink } from "./types";
import {
  isWorkspaceComponentEnabled,
  type WorkspaceComponentId,
} from "./workspaceComponents";
import { isSolutionEnabled } from "./setupSolutions";

export type PublicActionType =
  | "chat"
  | "form"
  | "scheduler"
  | "sms"
  | "call"
  | "email";

export type PublicSurfaceId = "page" | "widget";

export const PUBLIC_SURFACE_CATALOG: {
  id: PublicSurfaceId;
  label: string;
  blurb: string;
}[] = [
  {
    id: "page",
    label: "Front Desk",
    blurb: "Your shared link.",
  },
  {
    id: "widget",
    label: "Widget",
    blurb: "The bubble on your website.",
  },
];

export function isPublicPageEnabled(
  settings: Partial<FloorSettings> | null | undefined,
) {
  return isSolutionEnabled(settings, "preChat");
}

export function isPublicWidgetEnabled(
  settings: Partial<FloorSettings> | null | undefined,
) {
  return isWorkspaceComponentEnabled(settings, "chatWidget");
}

const ACTION_TOOL: Partial<Record<PublicActionType, WorkspaceComponentId>> = {
  chat: "liveChat",
  scheduler: "schedule",
  form: "forms",
};

export function toolForPublicAction(
  action: PublicActionType,
): WorkspaceComponentId | null {
  return ACTION_TOOL[action] ?? null;
}

export function isPublicActionEnabled(
  settings: Partial<FloorSettings> | null | undefined,
  action: PublicActionType,
) {
  const tool = toolForPublicAction(action);
  if (!tool) return true;
  return isWorkspaceComponentEnabled(settings, tool);
}

export function publicActionFromLink(
  link: PreChatLink,
): PublicActionType | null {
  if (link.kind === "chat" || link.id === "pre-live-chat") return "chat";
  if (link.id === "pre-call" || (link.kind === "call" && !link.quickBuild)) {
    return "call";
  }
  if (link.id === "pre-sms" || (link.kind === "sms" && !link.quickBuild)) {
    return "sms";
  }
  if (link.id === "pre-email" || (link.kind === "email" && !link.quickBuild)) {
    return "email";
  }
  if (link.quickBuild?.type === "form") return "form";
  if (link.quickBuild?.type === "scheduler") return "scheduler";
  const match = /^pre-quick-(form|scheduler|sms|call|email)-/.exec(link.id);
  return (match?.[1] as PublicActionType | undefined) ?? null;
}

export function isContactLink(link: PreChatLink) {
  return (
    link.id === "pre-call" ||
    link.id === "pre-sms" ||
    link.id === "pre-email"
  );
}

export function isPublicLinkEnabled(
  settings: Partial<FloorSettings> | null | undefined,
  link: PreChatLink,
) {
  const action = publicActionFromLink(link);
  if (!action) return true;
  return isPublicActionEnabled(settings, action);
}
