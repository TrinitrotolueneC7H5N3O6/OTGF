import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { prisma, syncDbFromCookies } from "@/lib/db";
import { newGrowthData } from "@/lib/growth";
import { isWorkspaceComponentEnabled } from "@/lib/workspaceComponents";
import { normalizeStoryTemplate, storyChapters } from "@/lib/storytelling";

async function publicRecord(id: string) {
  await syncDbFromCookies();
  const record = await prisma.growthRecord.findUnique({where: {id}, include: {space: true}});
  if (!record) return null;
  const data = JSON.parse(record.data);
  const space = JSON.parse(record.space.data);
  if (record.kind === "story" && data.status === "published" && isWorkspaceComponentEnabled(space.settings, "storytelling")) return {record, data, space, program: null};
  if (record.kind !== "partner" || data.status !== "active") return null;
  const program = await prisma.growthRecord.findFirst({where: {id: data.programId, spaceSlug: record.spaceSlug, kind: {in: ["referral", "affiliate"]}}});
  if (!program || !isWorkspaceComponentEnabled(space.settings, program.kind === "referral" ? "referrals" : "affiliates")) return null;
  const programData = JSON.parse(program.data);
  if (programData.status !== "active") return null;
  return {record, data, space, program: programData};
}
export async function GET(_request: Request, {params}: {params: Promise<{id: string}>}) {
  const {id} = await params;
  const found = await publicRecord(id);
  if (!found) return NextResponse.json({error: "This page is unavailable."}, {status: 404});
  const {record, data, space, program} = found;
  const template = normalizeStoryTemplate(space.settings?.storyTemplate);
  const chapters = storyChapters(data.chapters, data.challenge ?? "", data.process ?? "", data.outcome ?? "");
  return NextResponse.json({kind: record.kind, slug: record.spaceSlug, business: space.business.name,
    ...(program ? {title: program.title, description: program.description, partner: data.title} : {title: data.title, description: data.description, challenge: data.challenge, process: data.process, outcome: data.outcome, date: data.date, photos: data.photos ?? [], tags: data.tags ?? [], chapters, template})
  }, {headers: {"Cache-Control": "no-store"}});
}
export async function POST(request: Request, {params}: {params: Promise<{id: string}>}) {
  const {id} = await params;
  const found = await publicRecord(id);
  if (!found) return NextResponse.json({error: "This page is unavailable."}, {status: 404});
  try {
    const text = await request.text();
    if (text.length > 6000) throw new Error("Request is too large.");
    const body = JSON.parse(text);
    const jar = await cookies();
    const cookie = `growth_visit_${id}`;
    if (body.action === "visit") {
      const response = NextResponse.json({ok: true});
      if (!jar.has(cookie)) {
        await prisma.growthRecord.update({where: {id}, data: {visits: {increment: 1}}});
        response.cookies.set(cookie, "1", {httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", maxAge: 86400, path: `/api/growth/${id}`});
      }
      return response;
    }
    if (!found.program || body.action !== "lead") throw new Error("Invalid request.");
    if (typeof body.name !== "string" || !body.name.trim() || body.name.length > 200) throw new Error("Enter your name.");
    if (typeof body.email !== "string" || body.email.length > 200 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(body.email)) throw new Error("Enter a valid email.");
    if (typeof body.message !== "string" || body.message.length > 3000) throw new Error("Message is too long.");
    const email = body.email.trim().toLowerCase();
    // Deterministic id makes retries and repeated submissions for this participant idempotent.
    const {createHash} = await import("node:crypto");
    const leadId = createHash("sha256").update(`${id}:${email}`).digest("hex");
    await prisma.growthRecord.upsert({where: {id: leadId}, update: {}, create: {id: leadId, spaceSlug: found.record.spaceSlug, kind: "conversion", data: JSON.stringify({...newGrowthData("conversion"), title: body.name.trim(), email, description: body.message.trim(), programId: found.data.programId, partnerId: id, currency: found.program.currency})}});
    return NextResponse.json({ok: true});
  } catch (error) {
    return NextResponse.json({error: error instanceof Error ? error.message : "Could not submit."}, {status: 400});
  }
}
