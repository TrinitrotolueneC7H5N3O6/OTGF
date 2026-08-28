import { dbGetOffering } from "@/lib/spaceServer";
import { InquireEntry, InquireMissing } from "@/components/client/InquireEntry";

export default async function InquirePage({
  params,
}: {
  params: Promise<{ slug: string; offeringId: string }>;
}) {
  const { slug, offeringId } = await params;
  const offering = await dbGetOffering(slug, offeringId);
  if (!offering) return <InquireMissing />;
  return <InquireEntry slug={slug} offering={offering} />;
}
