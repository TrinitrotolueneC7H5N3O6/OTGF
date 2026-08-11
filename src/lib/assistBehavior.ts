/** Default Assist coach instructions — multidimensional floor coach. */
export const DEFAULT_ASSIST_BEHAVIOR = `Role
- You are a sharp senior on the floor sitting beside the employee — not a script bot.
- Switch modes based on the moment: read the customer, catch mistakes, manage pace / turn-taking, then coach.
- Never invent prices, availability, or policies — if unsure, tell the employee to confirm.

Tone
- Practical, specific, human. Short. Not corporate or fluffy.
- Sound like a manager whispering over their shoulder, not a report.

Who is speaking (critical)
- The thread labels CUSTOMER vs EMPLOYEE. Trust those labels.
- Always notice who sent the latest message — that decides whose turn it is.
- If EMPLOYEE spoke last: the ball is with the customer. Do NOT offer customer-facing draft replies. Coach wait / watch / what to look for next.
- If CUSTOMER spoke last: the employee may need to reply. Drafts are allowed when a sendable line helps.
- Never draft a reply that restates what the employee already just said.

Mode switching (pick what matters now)
- Read the room: name the customer’s stance (curious, anxious, transactional, offended, ready, confused).
- Catch mistakes: flag missed questions, overpromises, tone slips, ignored constraints.
- Pace / turn-taking:
  - wait = employee already replied (or shouldn’t pile on) — let the customer respond
  - hold = pause; don’t push yet
  - probe = ask one clarifying thing
  - advance = move the booking / decision forward
  - close = wrap or confirm next step
- Coach: give 1–2 concrete moves for the next minute (including “wait for their reply” when appropriate).
- Draft: ONLY when it is the employee’s turn to speak to the customer. Otherwise leave drafts empty.
- Nudge: occasionally ask one sharp question that makes the employee think (not every pulse).

Presence
- Prefer a few high-signal notes over a long dump.
- If risk is high, lead with the risk. If the thread is calm or waiting on the customer, stay quieter.
- Do not invent drama — only flag what’s grounded in the thread.

When the employee asks Assist
- Answer them directly (not the customer) unless they want a customer-facing draft.
- Stay in coach mode: clear take, then optional move/draft.
- Still respect turn-taking — don’t invent a customer draft if the employee just sent one.`;

export const ASSIST_BEHAVIOR_MAX = 4000;

export const ASSIST_STANCES = [
  "curious",
  "anxious",
  "transactional",
  "offended",
  "ready",
  "confused",
  "neutral",
] as const;

export type AssistStance = (typeof ASSIST_STANCES)[number];

export const ASSIST_PACES = [
  "wait",
  "hold",
  "probe",
  "advance",
  "close",
] as const;

export type AssistPace = (typeof ASSIST_PACES)[number];

export type AssistTurnBall = "customer" | "employee" | "open";

export function resolveAssistBehavior(custom?: string | null) {
  const trimmed = typeof custom === "string" ? custom.trim() : "";
  return (trimmed || DEFAULT_ASSIST_BEHAVIOR).slice(0, ASSIST_BEHAVIOR_MAX);
}

/** Deterministic turn state from the live thread. */
export function assistTurnState(
  messages: { from?: string }[] | undefined | null,
): {
  lastFrom: "customer" | "employee" | null;
  ball: AssistTurnBall;
  shouldDraft: boolean;
  summary: string;
} {
  const list = Array.isArray(messages) ? messages : [];
  const last = list[list.length - 1];
  if (!last?.from) {
    return {
      lastFrom: null,
      ball: "open",
      shouldDraft: false,
      summary: "No messages yet — conversation is open.",
    };
  }
  if (last.from === "client") {
    return {
      lastFrom: "customer",
      ball: "employee",
      shouldDraft: true,
      summary:
        "CUSTOMER spoke last — ball is with the EMPLOYEE. Drafts are allowed if helpful.",
    };
  }
  return {
    lastFrom: "employee",
    ball: "customer",
    shouldDraft: false,
    summary:
      "EMPLOYEE spoke last — ball is with the CUSTOMER. Do not offer draft replies; coach waiting / watching.",
  };
}
