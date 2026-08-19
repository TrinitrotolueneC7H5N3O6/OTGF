import { PreChatPage } from "@/components/client/PreChatPage";

export default async function PreChatEntryPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  return <PreChatPage slug={slug} />;
}
