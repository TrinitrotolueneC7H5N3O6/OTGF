import { PublicPageApp } from "@/components/client/PublicPageApp";

export default async function PreChatEntryPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  return <PublicPageApp slug={slug} />;
}
