import { ClientChat } from "@/components/client/ClientChat";

export default async function UniqueChatPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string; chatId: string }>;
  searchParams: Promise<{ ask?: string | string[] }>;
}) {
  const { slug, chatId } = await params;
  const query = await searchParams;
  const raw = query.ask;
  const inquireOfferingId = Array.isArray(raw) ? raw[0] : raw;
  return (
    <ClientChat
      slug={slug}
      chatId={chatId}
      inquireOfferingId={inquireOfferingId}
    />
  );
}
