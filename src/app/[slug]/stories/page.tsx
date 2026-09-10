import { StoriesBrowseApp } from "@/components/client/GrowthPublicApp";

export default async function StoriesPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  return <StoriesBrowseApp slug={slug} />;
}
