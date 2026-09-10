import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { dbUserOwnsSpace } from "@/lib/spaceServer";
import { prisma } from "@/lib/db";
import { commissionFor, newGrowthData, validateGrowthData, type GrowthKind } from "@/lib/growth";
import { normalizeStoryTemplate, storyChapters } from "@/lib/storytelling";

async function authorized(slug: string) {
  const user = await getSessionUser();
  return user && await dbUserOwnsSpace(slug, user.id);
}
export async function GET(_request: Request, { params }: { params: Promise<{slug: string}> }) {
  const {slug} = await params;
  if (!await authorized(slug)) return NextResponse.json({error: "Unauthorized"}, {status: 401});
  const records = await prisma.growthRecord.findMany({where: {spaceSlug: slug}, orderBy: {createdAt: "desc"}});
  return NextResponse.json(records.map((record) => {
    const parsed = JSON.parse(record.data);
    const kind = record.kind as GrowthKind;
    const data = {...newGrowthData(kind), ...parsed};
    if (kind === "story") {
      data.chapters = storyChapters(data.chapters, data.challenge, data.process, data.outcome);
    }
    return {...record, data};
  }), {headers: {"Cache-Control": "no-store"}});
}
export async function POST(request: Request, {params}: {params: Promise<{slug: string}>}) {
  const {slug} = await params;
  if (!await authorized(slug)) return NextResponse.json({error: "Unauthorized"}, {status: 401});
  try {
    const text = await request.text();
    if (text.length > 1500000) throw new Error("Record is too large.");
    const body = JSON.parse(text);
    const kind = body.kind as GrowthKind;
    if (!["referral", "affiliate", "partner", "conversion", "story"].includes(kind)) throw new Error("Invalid record type.");
    if (kind !== "story" && text.length > 60000) throw new Error("Record is too large.");
    const spaceRow = await prisma.space.findUnique({ where: { slug } });
    if (!spaceRow) throw new Error("Space not found.");
    const space = JSON.parse(spaceRow.data);
    const data = validateGrowthData(kind, body.data, normalizeStoryTemplate(space.settings?.storyTemplate));
    const record = await prisma.$transaction(async (tx) => {
      const current = body.id ? await tx.growthRecord.findUnique({where: {id: body.id}}) : null;
      if (body.id && (!current || current.spaceSlug !== slug || current.kind !== kind)) throw new Error("Record not found.");
      const previous = current ? JSON.parse(current.data) : null;
      if (current && body.version !== current.version) throw new Error("This record changed. Refresh and try again.");
      if (kind === "partner" || kind === "conversion") {
        const program = await tx.growthRecord.findFirst({where: {id: data.programId, spaceSlug: slug, kind: {in: ["referral", "affiliate"]}}});
        if (!program) throw new Error("Choose an existing program.");
        const programData = JSON.parse(program.data);
        if (previous && previous.programId !== data.programId) throw new Error("A record cannot move between programs.");
        data.currency = programData.currency;
        if (kind === "conversion") {
          const partner = await tx.growthRecord.findFirst({where: {id: data.partnerId, spaceSlug: slug, kind: "partner"}});
          if (!partner || JSON.parse(partner.data).programId !== data.programId) throw new Error("Choose a participant in this program.");
          if (previous && previous.partnerId !== data.partnerId) throw new Error("Attribution cannot be changed.");
          if (previous?.status === "paid" && (data.amount !== previous.amount || data.status !== "paid")) throw new Error("Paid records are locked. Add a separate correction record if needed.");
          data.commission = previous && ["confirmed", "paid"].includes(previous.status) ? previous.commission : commissionFor(data.amount, programData);
          if (["confirmed", "paid"].includes(previous?.status) && data.amount !== previous.amount) throw new Error("Confirmed amounts are locked. Reject the record before correcting it.");
          if (data.reference && await tx.growthRecord.findFirst({where: {spaceSlug: slug, kind: "conversion", id: {not: current?.id ?? ""}, data: {contains: `"reference":${JSON.stringify(data.reference)}`}}})) throw new Error("That sale reference already exists.");
        }
      }
      if (current && ["referral", "affiliate"].includes(kind) && previous.currency !== data.currency) {
        const children = await tx.growthRecord.findFirst({where: {spaceSlug: slug, kind: {in: ["partner", "conversion"]}, data: {contains: `"programId":${JSON.stringify(current.id)}`}}});
        if (children) throw new Error("Currency cannot change after participants have been added.");
      }
      if (!current) return tx.growthRecord.create({data: {id: crypto.randomUUID(), spaceSlug: slug, kind, data: JSON.stringify(data)}});
      const updated = await tx.growthRecord.updateMany({where: {id: current.id, version: current.version}, data: {data: JSON.stringify(data), version: {increment: 1}}});
      if (!updated.count) throw new Error("This record changed. Refresh and try again.");
      return tx.growthRecord.findUniqueOrThrow({where: {id: current.id}});
    });
    return NextResponse.json({...record, data: JSON.parse(record.data)});
  } catch (error) {
    return NextResponse.json({error: error instanceof Error ? error.message : "Could not save."}, {status: 400});
  }
}
