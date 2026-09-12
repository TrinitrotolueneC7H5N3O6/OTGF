import { StoriesBrowseApp } from "@/components/client/StoriesBrowseApp";

export default async function StoriesPage({ params, searchParams }: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ output?: string | string[] }>;
}) {
  const { slug } = await params;
  const query = await searchParams;
  const output = query.output === "embed" || query.output === "carousel" ? query.output : "website";
  return <StoriesBrowseApp slug={slug} output={output} embedded={output !== "website"} />;
}
