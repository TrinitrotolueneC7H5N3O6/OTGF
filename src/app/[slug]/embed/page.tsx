import { EmbedApp } from "@/components/client/EmbedApp";

export default async function EmbedPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ start?: string | string[] }>;
}) {
  const { slug } = await params;
  const query = await searchParams;
  const raw = query.start;
  const start = (Array.isArray(raw) ? raw[0] : raw) === "page" ? "page" : "chat";
  return <EmbedApp slug={slug} start={start} />;
}
