import { redirect } from "next/navigation";
import { legacyDashboardRedirect } from "@/lib/workspaceNav";

export default async function LegacyDashboardSectionPage({
  params,
}: {
  params: Promise<{ slug: string; section: string[] }>;
}) {
  const { slug, section } = await params;
  redirect(legacyDashboardRedirect(slug, section));
}
