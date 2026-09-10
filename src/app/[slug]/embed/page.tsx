import { EmbedApp } from "@/components/client/EmbedApp";

export default async function EmbedPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{
    start?: string | string[];
    widget?: string | string[];
    action?: string | string[];
  }>;
}) {
  const { slug } = await params;
  const query = await searchParams;
  const raw = query.start;
  const start = (Array.isArray(raw) ? raw[0] : raw) === "page" ? "page" : "chat";
  const rawWidget = query.widget;
  const widget = (Array.isArray(rawWidget) ? rawWidget[0] : rawWidget) === "1";
  const rawAction = query.action;
  const actionId = Array.isArray(rawAction) ? rawAction[0] : rawAction;
  return <EmbedApp slug={slug} start={start} widget={widget} actionId={actionId} />;
}
