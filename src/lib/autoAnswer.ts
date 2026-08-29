import type {
  AutoAnswerDraft,
  AutoAnswerDraftStatus,
  Client,
  KnowledgeNote,
  Message,
  Offering,
} from "./types";
import { formatKnowledgeForPrompt } from "./knowledge";
import { formatOfferingsForPrompt } from "./offerings";
import { resolveAssistBehavior } from "./assistBehavior";

const QUALITY_MODEL =
  process.env.OPENROUTER_ASSIST_MODEL?.trim() || "openai/gpt-4o-mini";

const HEAD_MESSAGES = 10;
const TAIL_MESSAGES = 80;
const MAX_BODY_CHARS = 800;

export function newAutoAnswerDraftId() {
  return `aa-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

export function withoutAutoAnswerDraft(client: Client): Client {
  if (!("autoAnswerDraft" in client) && !client.autoAnswerDraft) return client;
  const { autoAnswerDraft: _draft, ...rest } = client;
  return rest;
}

export function normalizeAutoAnswerDraft(raw: unknown): AutoAnswerDraft | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const row = raw as Partial<AutoAnswerDraft>;
  const id = typeof row.id === "string" ? row.id.trim() : "";
  const sourceMessageId =
    typeof row.sourceMessageId === "string" ? row.sourceMessageId.trim() : "";
  if (!id || !sourceMessageId) return undefined;
  const status = normalizeDraftStatus(row.status);
  const body = typeof row.body === "string" ? row.body.slice(0, 4000) : "";
  const createdAt =
    typeof row.createdAt === "string" && row.createdAt.trim()
      ? row.createdAt.trim()
      : new Date().toISOString();
  const error =
    typeof row.error === "string" && row.error.trim()
      ? row.error.trim().slice(0, 240)
      : undefined;
  return {
    id,
    sourceMessageId,
    body,
    createdAt,
    status,
    ...(error ? { error } : {}),
  };
}

function normalizeDraftStatus(raw: unknown): AutoAnswerDraftStatus {
  if (raw === "working" || raw === "ready" || raw === "failed") return raw;
  return "ready";
}

export function isAutoAnswerableClientMessage(message: Message): boolean {
  if (message.from !== "client") return false;
  if (message.kind === "system") return false;
  const body = message.body?.trim() ?? "";
  if (body.startsWith("Recording email:")) return false;
  if (
    message.kind === "image" ||
    message.kind === "video" ||
    message.kind === "link" ||
    message.kind === "item"
  ) {
    return true;
  }
  return Boolean(body);
}

/** Latest customer line this chat should answer, or null if staff already has the floor. */
export function latestAnswerableClientMessage(
  messages: Message[],
  chatId: string,
): Message | null {
  const thread = messages.filter((m) => m.clientId === chatId);
  for (let i = thread.length - 1; i >= 0; i--) {
    const message = thread[i];
    if (message.from === "business") {
      if (message.kind === "system") continue;
      // Canned intro / reconnect lines are not a staff reply.
      if (message.id.startsWith("m-auto-")) continue;
      return null;
    }
    if (isAutoAnswerableClientMessage(message)) return message;
  }
  return null;
}

export function shouldStartAutoAnswer(input: {
  autoAnswerOn: boolean;
  client: Client;
  source: Message;
  thread: Message[];
}): boolean {
  if (!input.autoAnswerOn) return false;
  if (input.client.autoAnswerOff) return false;
  if (input.client.chatEndedAt) return false;
  if (input.source.clientId !== input.client.id) return false;
  const latest = latestAnswerableClientMessage(input.thread, input.client.id);
  return Boolean(latest && latest.id === input.source.id);
}

function lineForMessage(
  message: Message,
  clientName: string,
  businessName: string,
  isLatest: boolean,
) {
  const who =
    message.from === "client"
      ? `CUSTOMER (${clientName})`
      : message.kind === "system"
        ? "SYSTEM"
        : `STAFF (${businessName})`;
  let text = message.body?.trim() || "";
  if (!text) {
    if (message.kind === "image") text = "[sent a photo]";
    else if (message.kind === "video") text = "[sent a video]";
    else if (message.kind === "link") text = "[sent a link]";
    else if (message.kind === "item") text = "[asked about a product or service]";
    else if (message.kind === "receipt") text = "[sent a receipt]";
    else text = "[message]";
  }
  if (text.length > MAX_BODY_CHARS) text = `${text.slice(0, MAX_BODY_CHARS)}…`;
  return `${who}: ${text}${isLatest ? " ← LATEST" : ""}`;
}

/**
 * Format ONE chat's full history for the model.
 * Never pass another chat's messages into this function.
 */
export function formatIsolatedThread(input: {
  messages: Message[];
  chatId: string;
  clientName: string;
  businessName: string;
}): { text: string; truncated: boolean } {
  const thread = input.messages.filter((m) => m.clientId === input.chatId);
  const cap = HEAD_MESSAGES + TAIL_MESSAGES;
  let kept = thread;
  let truncated = false;
  if (thread.length > cap) {
    truncated = true;
    kept = [
      ...thread.slice(0, HEAD_MESSAGES),
      ...thread.slice(thread.length - TAIL_MESSAGES),
    ];
  }
  const lines = kept.map((message, index) =>
    lineForMessage(
      message,
      input.clientName,
      input.businessName,
      index === kept.length - 1,
    ),
  );
  const note = truncated
    ? "(Older messages in THIS same chat were shortened. Nothing from any other customer is included.)\n"
    : "";
  return {
    text: `${note}${lines.join("\n") || "(no messages yet)"}`,
    truncated,
  };
}

export function buildAutoAnswerPrompt(input: {
  businessName: string;
  trade: string;
  clientName: string;
  clientNote?: string;
  threadText: string;
  knowledgeNotes: KnowledgeNote[];
  offerings: Offering[];
  assistBehavior?: string;
  autoAnswerMessage?: string;
}): { system: string; user: string } {
  const knowledge = formatKnowledgeForPrompt(input.knowledgeNotes);
  const offerings = formatOfferingsForPrompt(input.offerings);
  const voice = resolveAssistBehavior(input.assistBehavior);
  const staffMessage = input.autoAnswerMessage?.trim()
    ? `Staff message for these drafts: ${input.autoAnswerMessage.trim()}`
    : "No extra staff message for auto-answer.";
  const note = input.clientNote?.trim()
    ? `Staff note about this customer (this chat only): ${input.clientNote.trim()}`
    : "No staff note on this customer.";

  const system = `You draft a short reply for the business to send in ONE customer chat.
You never send it yourself — a person will approve or edit it first.

Isolation (critical):
- You are helping with exactly one customer: ${input.clientName}.
- The thread you receive is the complete history of THIS chat only.
- Never mention, invent, or reuse another customer's name, request, photos, medical details, or contact info.
- Shared business facts (hours, prices you were given, offerings, policies) are OK to use.
- If a fact is not in this chat or the business notes, say you will check with the team. Do not guess prices, availability, medical advice, recovery times, or policies.
- Prefer the business notes and this customer's own messages over general knowledge. If notes don't mention it, don't fill in typical industry numbers.

Voice:
${voice}

Write like a real person on the floor: warm, concise, 2–4 sentences. No markdown. No preamble.`;

  const user = `Business: ${input.businessName} (${input.trade || "shop"})
This customer: ${input.clientName}
${note}
${staffMessage}

${knowledge ? `${knowledge}\n` : ""}${offerings ? `${offerings}\n` : ""}
This chat only (CUSTOMER vs STAFF; ← LATEST is what to answer):
${input.threadText}

Return ONLY JSON:
{ "body": "customer-facing reply" }`;

  return { system, user };
}

function extractJson(text: string): unknown {
  const trimmed = text.trim();
  try {
    return JSON.parse(trimmed);
  } catch {
    const start = trimmed.indexOf("{");
    const end = trimmed.lastIndexOf("}");
    if (start >= 0 && end > start) {
      return JSON.parse(trimmed.slice(start, end + 1));
    }
    throw new Error("Model did not return JSON");
  }
}

async function callOpenRouter(
  apiKey: string,
  messages: { role: string; content: string }[],
) {
  const upstream = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      "HTTP-Referer": "https://otgf.local",
      "X-OpenRouter-Title": "OTGF Auto Answer",
    },
    body: JSON.stringify({
      model: QUALITY_MODEL,
      temperature: 0.4,
      max_tokens: 420,
      response_format: { type: "json_object" },
      messages,
    }),
  });

  if (!upstream.ok) {
    const detail = await upstream.text().catch(() => "");
    throw Object.assign(new Error("OpenRouter request failed."), {
      detail: detail.slice(0, 400),
    });
  }

  const data = (await upstream.json()) as {
    choices?: { message?: { content?: string } }[];
  };
  return data.choices?.[0]?.message?.content ?? "";
}

export async function generateAutoAnswerBody(input: {
  businessName: string;
  trade: string;
  clientName: string;
  clientNote?: string;
  /** Messages from THIS chat only. */
  messages: Message[];
  chatId: string;
  knowledgeNotes: KnowledgeNote[];
  offerings: Offering[];
  assistBehavior?: string;
  autoAnswerMessage?: string;
}): Promise<string> {
  const apiKey = process.env.OPENROUTER_API_KEY?.trim();
  if (!apiKey) {
    throw new Error("AI isn’t connected yet. Reply yourself, or add an API key.");
  }

  const thread = formatIsolatedThread({
    messages: input.messages,
    chatId: input.chatId,
    clientName: input.clientName,
    businessName: input.businessName,
  });
  const prompt = buildAutoAnswerPrompt({
    businessName: input.businessName,
    trade: input.trade,
    clientName: input.clientName,
    clientNote: input.clientNote,
    threadText: thread.text,
    knowledgeNotes: input.knowledgeNotes,
    offerings: input.offerings,
    assistBehavior: input.assistBehavior,
    autoAnswerMessage: input.autoAnswerMessage,
  });

  const content = await callOpenRouter(apiKey, [
    { role: "system", content: prompt.system },
    { role: "user", content: prompt.user },
  ]);
  const parsed = extractJson(content) as { body?: unknown };
  const body = typeof parsed.body === "string" ? parsed.body.trim() : "";
  if (!body) throw new Error("The AI didn’t suggest a reply.");
  return body.slice(0, 4000);
}

export function autoAnswerListLabel(draft: AutoAnswerDraft) {
  if (draft.status === "working") return "Writing a reply…";
  if (draft.status === "failed") return draft.error || "Couldn’t draft a reply";
  const preview = draft.body.trim();
  if (!preview) return "Draft ready — review to send";
  return preview.length > 90 ? `${preview.slice(0, 90)}…` : preview;
}
