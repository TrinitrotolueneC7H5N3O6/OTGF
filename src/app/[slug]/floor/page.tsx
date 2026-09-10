import { redirect } from "next/navigation";

export default async function LegacyFloorPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  redirect(`/${slug}/live-chat`);
}
