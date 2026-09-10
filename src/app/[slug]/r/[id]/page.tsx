import { GrowthPublicApp } from "@/components/client/GrowthPublicApp";
export default async function ReferralPage({params}: {params: Promise<{slug:string;id:string}>}) {
  const {slug,id} = await params;
  return <GrowthPublicApp slug={slug} id={id} />;
}
