import { redirect } from "next/navigation";

export default async function LegacyFormsSectionPage({
  params,
}: {
  params: Promise<{ slug: string; section: string }>;
}) {
  const { slug, section } = await params;
  if (section === "referrals") redirect(`/${slug}/referrals`);
  if (section === "affiliates") redirect(`/${slug}/affiliates`);
  redirect(`/${slug}/forms`);
}
