import { NextResponse } from "next/server";
import {
  ASSIST_PACES,
  ASSIST_STANCES,
  resolveAssistBehavior,
  type AssistPace,
  type AssistStance,
} from "@/lib/assistBehavior";

export const runtime = "nodejs";

type ThreadMessage = {
  from: "business" | "client";
  body: string;
  kind?: string;
};

type ChatTurn = {
  role: "user" | "assistant";
  content: string;
};

type AssistMode = "whisper" | "coach" | "observe" | "chat";

type AssistBody = {
  mode?: AssistMode;
  clientName?: string;
  businessName?: string;
  trade?: string;
  messages?: ThreadMessage[];
  chat?: ChatTurn[];
  question?: string;
  behavior?: string;
};

export type ThoughtStep = {
  label: string;
  detail: string;
};

export type AssistMove = {
  title: string;
  detail: string;
};

export type AssistReply = {
  title: string;
  text: string;
};

export type AssistRisk = {
  label: string;
  detail: string;
};

const FAST_MODEL =
  process.env.OPENROUTER_ASSIST_FAST_MODEL?.trim() ||
  "google/gemini-2.5-flash";
const QUALITY_MODEL =
  process.env.OPENROUTER_ASSIST_MODEL?.trim() || "openai/gpt-4o-mini";

const WHISPER_BRIEF = `You are a senior floor coach whispering to an employee during a live customer chat.
Be high-signal and brief. Never invent prices, availability, or policies.
Read stance, catch real risks only, set pace. JSON only.`;

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

function formatThread(
  messages: ThreadMessage[],
  clientName: string,
  businessName: string,
  limit = 12,
  maxBody = 220,
) {
  return messages
    .slice(-limit)
    .map((m) => {
      const who = m.from === "client" ? clientName : businessName;
      let text =
        m.body?.trim() ||
        (m.kind === "image"
          ? "[sent a photo]"
          : m.kind === "video"
            ? "[sent a video]"
            : m.kind === "link"
              ? "[sent a link]"
              : "[message]");
      if (text.length > maxBody) text = `${text.slice(0, maxBody)}…`;
      return `${who}: ${text}`;
    })
    .join("\n");
}

function normalizeThoughts(raw: unknown): ThoughtStep[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((t) => {
      const row = t as Partial<ThoughtStep>;
      return {
        label: String(row.label ?? "").trim().slice(0, 48),
        detail: String(row.detail ?? "").trim(),
      };
    })
    .filter((t) => t.label || t.detail)
    .slice(0, 5);
}

function normalizeMoves(raw: unknown): AssistMove[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((m) => {
      const row = m as Partial<AssistMove>;
      return {
        title: String(row.title ?? "").trim().slice(0, 48),
        detail: String(row.detail ?? "").trim(),
      };
    })
    .filter((m) => m.title || m.detail)
    .slice(0, 3);
}

function normalizeReplies(raw: unknown): AssistReply[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((r) => {
      const row = r as Partial<AssistReply>;
      return {
        title: String(row.title ?? "").trim().slice(0, 40),
        text: String(row.text ?? "").trim(),
      };
    })
    .filter((r) => r.text)
    .slice(0, 2);
}

function normalizeRisks(raw: unknown): AssistRisk[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((r) => {
      const row = r as Partial<AssistRisk>;
      return {
        label: String(row.label ?? "").trim().slice(0, 40),
        detail: String(row.detail ?? "").trim(),
      };
    })
    .filter((r) => r.label || r.detail)
    .slice(0, 3);
}

function normalizeStance(raw: unknown): AssistStance {
  const value = String(raw ?? "")
    .trim()
    .toLowerCase();
  if ((ASSIST_STANCES as readonly string[]).includes(value)) {
    return value as AssistStance;
  }
  return "neutral";
}

function normalizePace(raw: unknown): AssistPace | null {
  const value = String(raw ?? "")
    .trim()
    .toLowerCase();
  if ((ASSIST_PACES as readonly string[]).includes(value)) {
    return value as AssistPace;
  }
  return null;
}

function normalizePaceNote(raw: unknown): string {
  return typeof raw === "string" ? raw.trim().slice(0, 160) : "";
}

function normalizeNudge(raw: unknown): string {
  return typeof raw === "string" ? raw.trim().slice(0, 180) : "";
}

async function callOpenRouter(
  apiKey: string,
  messages: { role: string; content: string }[],
  opts: { model: string; maxTokens: number; temperature?: number },
) {
  const upstream = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      "HTTP-Referer": "https://otgf.local",
      "X-OpenRouter-Title": "OTGF Floor Assist",
    },
    body: JSON.stringify({
      model: opts.model,
      temperature: opts.temperature ?? 0.4,
      max_tokens: opts.maxTokens,
      response_format: { type: "json_object" },
      messages,
    }),
  });

  if (!upstream.ok) {
    const detail = await upstream.text().catch(() => "");
    throw Object.assign(new Error("OpenRouter request failed."), {
      status: 502,
      detail: detail.slice(0, 400),
    });
  }

  const data = (await upstream.json()) as {
    choices?: { message?: { content?: string } }[];
  };
  return data.choices?.[0]?.message?.content ?? "";
}

function parseWhisper(parsed: Record<string, unknown>) {
  return {
    stance: normalizeStance(parsed.stance),
    risks: normalizeRisks(parsed.risks),
    pace: normalizePace(parsed.pace),
    paceNote: normalizePaceNote(parsed.paceNote),
    nudge: normalizeNudge(parsed.nudge),
  };
}

function parseCoach(parsed: Record<string, unknown>) {
  return {
    thoughts: normalizeThoughts(parsed.thoughts),
    moves: normalizeMoves(parsed.moves),
    replies: normalizeReplies(parsed.replies),
  };
}

function resolveMode(raw?: string): AssistMode {
  if (raw === "whisper" || raw === "coach" || raw === "chat") return raw;
  return "observe";
}

export async function POST(req: Request) {
  const apiKey = process.env.OPENROUTER_API_KEY?.trim();
  if (!apiKey) {
    return NextResponse.json(
      { error: "OpenRouter is not configured." },
      { status: 500 },
    );
  }

  let body: AssistBody;
  try {
    body = (await req.json()) as AssistBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const mode = resolveMode(body.mode);
  const clientName = body.clientName?.trim() || "the guest";
  const businessName = body.businessName?.trim() || "the business";
  const trade = body.trade?.trim() || "shop";
  const behavior = resolveAssistBehavior(body.behavior);

  try {
    if (mode === "whisper") {
      const thread = formatThread(
        body.messages ?? [],
        clientName,
        businessName,
        8,
        160,
      );
      const prompt = `Quick shoulder-tap on this live chat.

Business: ${businessName} (${trade})
Customer: ${clientName}

Thread:
${thread || "(no messages yet)"}

Return ONLY JSON:
{
  "stance":"curious|anxious|transactional|offended|ready|confused|neutral",
  "risks":[{"label":"short","detail":"only real catches"}],
  "pace":"hold|probe|advance|close",
  "paceNote":"≤12 words",
  "nudge":"optional sharp employee question or empty string"
}

Rules: 0–2 risks max; empty nudge is fine; no drafts; no essays.`;

      const content = await callOpenRouter(
        apiKey,
        [
          { role: "system", content: WHISPER_BRIEF },
          { role: "user", content: prompt },
        ],
        { model: FAST_MODEL, maxTokens: 220, temperature: 0.3 },
      ).catch(async (err) => {
        // Fall back to quality model if the fast id isn't available on this key.
        if (FAST_MODEL === QUALITY_MODEL) throw err;
        return callOpenRouter(
          apiKey,
          [
            { role: "system", content: WHISPER_BRIEF },
            { role: "user", content: prompt },
          ],
          { model: QUALITY_MODEL, maxTokens: 220, temperature: 0.3 },
        );
      });
      const parsed = extractJson(content) as Record<string, unknown>;
      return NextResponse.json(parseWhisper(parsed));
    }

    if (mode === "coach" || mode === "observe") {
      const thread = formatThread(
        body.messages ?? [],
        clientName,
        businessName,
        12,
        200,
      );
      const system = `You coach employees on a live customer chat for a brick-and-mortar ${trade}.
JSON only. No markdown.

Follow this Assist behavior:
${behavior}`;

      const prompt = `Coach the next minute on this live chat. Focus on moves, drafts, and a short thought trail.

Business: ${businessName}
Customer: ${clientName}

Thread:
${thread || "(no messages yet)"}

Return ONLY JSON:
{
  "thoughts":[{"label":"short step","detail":"thinking out loud"}],
  "moves":[{"title":"Try this","detail":"concrete next action"}],
  "replies":[{"title":"short label","text":"optional customer-facing draft"}]
}

Rules:
- 2–3 thoughts max
- 1–2 moves
- 0–2 drafts
- stay concrete; no stance/pace fields here`;

      const content = await callOpenRouter(
        apiKey,
        [
          { role: "system", content: system },
          { role: "user", content: prompt },
        ],
        {
          model: mode === "observe" ? QUALITY_MODEL : QUALITY_MODEL,
          maxTokens: 650,
          temperature: 0.45,
        },
      );
      const parsed = extractJson(content) as Record<string, unknown>;
      const coach = parseCoach(parsed);

      if (coach.moves.length === 0 && coach.thoughts.length === 0) {
        return NextResponse.json(
          { error: "No analysis returned." },
          { status: 502 },
        );
      }

      // Legacy observe callers get empty whisper fields for compatibility.
      if (mode === "observe") {
        return NextResponse.json({
          stance: "neutral",
          risks: [],
          pace: null,
          paceNote: "",
          nudge: "",
          ...coach,
        });
      }

      return NextResponse.json(coach);
    }

    const question = body.question?.trim();
    if (!question) {
      return NextResponse.json(
        { error: "Ask a question." },
        { status: 400 },
      );
    }

    const thread = formatThread(
      body.messages ?? [],
      clientName,
      businessName,
      12,
      200,
    );
    const prior = (body.chat ?? [])
      .slice(-8)
      .map((t) => `${t.role === "user" ? "Employee" : "Assist"}: ${t.content}`)
      .join("\n");

    const system = `You coach employees on a live customer chat for a brick-and-mortar ${trade}.
JSON only. No markdown.

Follow this Assist behavior:
${behavior}`;

    const prompt = `The employee is asking about this live customer chat.

Business: ${businessName}
Customer: ${clientName}

Thread:
${thread || "(no messages yet)"}

Prior assist chat:
${prior || "(none)"}

Employee question:
${question}

Return ONLY JSON:
{
  "stance":"curious|anxious|transactional|offended|ready|confused|neutral",
  "risks":[{"label":"short risk","detail":"optional catch"}],
  "pace":"hold|probe|advance|close",
  "paceNote":"one-line why, or empty",
  "thoughts":[{"label":"short step","detail":"how you reached the answer"}],
  "reply":"direct answer to the employee",
  "moves":[{"title":"Try this","detail":"optional next action"}],
  "replies":[{"title":"short label","text":"optional customer draft"}],
  "nudge":"optional sharp question, or empty string"
}

Rules: reply is for the employee unless they asked for a customer-facing draft.`;

    const content = await callOpenRouter(
      apiKey,
      [
        { role: "system", content: system },
        { role: "user", content: prompt },
      ],
      { model: QUALITY_MODEL, maxTokens: 750, temperature: 0.45 },
    );
    const parsed = extractJson(content) as Record<string, unknown>;
    const whisper = parseWhisper(parsed);
    const coach = parseCoach(parsed);
    const reply = String(parsed.reply ?? "").trim();

    if (!reply) {
      return NextResponse.json(
        { error: "No reply returned." },
        { status: 502 },
      );
    }

    return NextResponse.json({ ...whisper, ...coach, reply });
  } catch (err) {
    const detail =
      err && typeof err === "object" && "detail" in err
        ? String((err as { detail?: string }).detail ?? "")
        : "";
    return NextResponse.json(
      {
        error: err instanceof Error ? err.message : "Assist failed.",
        ...(detail ? { detail } : {}),
      },
      { status: 500 },
    );
  }
}
