import { FormPublicApp } from "@/components/client/FormPublicApp";

export default async function PublicBookingPage({ params }: { params: Promise<{ slug: string; eventId: string }> }) {
  const { slug, eventId } = await params;
  return <FormPublicApp slug={slug} formId={eventId} scheduler />;
}
