import { redirect } from "next/navigation";
import { knownNavForPath } from "@/lib/workspaceNav";

export default async function SettingsSectionPage({
  params,
}: {
  params: Promise<{ slug: string; section: string[] }>;
}) {
  const { slug, section } = await params;
  const rest = `settings/${section.filter(Boolean).join("/")}`;
  if (["setup/contact-page", "knowledge/industry", "knowledge/offerings", "knowledge/shortcuts"].includes(section.join("/"))) {
    redirect(`/${slug}/dashboard`);
  }
  if (!knownNavForPath(rest)) {
    redirect(`/${slug}/settings/setup/public-page`);
  }
  return null;
}
