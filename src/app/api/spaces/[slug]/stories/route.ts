import { NextResponse } from "next/server";
import { prisma, syncDbFromCookies } from "@/lib/db";
import { isWorkspaceComponentEnabled } from "@/lib/workspaceComponents";
import {
  matchStorySearch,
  normalizeStoryTemplate,
  storyChapters,
  storyExcerpt,
  storyHaystack,
} from "@/lib/storytelling";

export async function GET(request: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  await syncDbFromCookies();
  const spaceRow = await prisma.space.findUnique({ where: { slug } });
  if (!spaceRow) return NextResponse.json({ error: "Not found." }, { status: 404 });
  const space = JSON.parse(spaceRow.data);
  if (!isWorkspaceComponentEnabled(space.settings, "storytelling")) {
    return NextResponse.json({ error: "Stories are not available." }, { status: 404 });
  }
  const template = normalizeStoryTemplate(space.settings?.storyTemplate);
  const query = new URL(request.url).searchParams.get("q") ?? "";
  const records = await prisma.growthRecord.findMany({
    where: { spaceSlug: slug, kind: "story" },
    orderBy: { createdAt: "desc" },
  });
  const stories = [];
  for (const record of records) {
    const data = JSON.parse(record.data);
    if (data.status !== "published") continue;
    const chapters = storyChapters(data.chapters, data.challenge ?? "", data.process ?? "", data.outcome ?? "");
    const tags = Array.isArray(data.tags) ? data.tags.filter((tag: unknown) => typeof tag === "string") : [];
    const haystack = storyHaystack({
      title: data.title ?? "",
      description: data.description ?? "",
      tags,
      chapters,
    });
    if (!matchStorySearch(haystack, query)) continue;
    const photos = Array.isArray(data.photos) ? data.photos.filter((url: unknown) => typeof url === "string") : [];
    stories.push({
      id: record.id,
      title: data.title ?? "Story",
      date: template.showDate ? data.date ?? "" : "",
      tags,
      excerpt: storyExcerpt(chapters, template, data.description ?? ""),
      photo: photos[0] ?? "",
      photos,
      description: data.description ?? "",
      chapters,
      challenge: data.challenge ?? "",
      process: data.process ?? "",
      outcome: data.outcome ?? "",
    });
  }
  return NextResponse.json({
    business: space.business?.name ?? slug,
    template,
    stories,
  }, { headers: { "Cache-Control": "no-store" } });
}
