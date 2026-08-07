import { ClientChat } from "@/components/client/ClientChat";

export default async function UniqueChatPage({
  params,
}: {
  params: Promise<{ slug: string; chatId: string }>;
}) {
  const { slug, chatId } = await params;
  return <ClientChat slug={slug} chatId={chatId} />;
}
