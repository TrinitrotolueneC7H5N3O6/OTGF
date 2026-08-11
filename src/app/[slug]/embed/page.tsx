import { EmbedChat } from "@/components/client/EmbedChat";

export default async function EmbedPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  return (
    <div className="otgf-embed-root">
      <EmbedChat slug={slug} />
    </div>
  );
}
