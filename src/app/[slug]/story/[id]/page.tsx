import { GrowthPublicApp } from "@/components/client/GrowthPublicApp";
export default async function StoryPage({params}: {params: Promise<{slug:string;id:string}>}) {
  const {slug,id} = await params;
  return <GrowthPublicApp slug={slug} id={id} story />;
}
