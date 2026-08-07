import { ChatEntry } from "@/components/client/ChatEntry";

export default async function ChatEntryPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  return <ChatEntry slug={slug} />;
}
