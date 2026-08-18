import { ForwardJoin } from "@/components/client/ForwardJoin";

export default async function ForwardJoinPage({
  params,
}: {
  params: Promise<{ slug: string; token: string }>;
}) {
  const { slug, token } = await params;
  return <ForwardJoin slug={slug} token={token} />;
}
