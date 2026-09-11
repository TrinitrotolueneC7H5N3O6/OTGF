import { BookingManager } from "@/components/client/BookingManager";
export const metadata = { title: "Manage appointment", robots: { index: false, follow: false }, referrer: "no-referrer" };
export default async function ManageBookingPage({ params }: { params: Promise<{ slug: string; bookingId: string }> }) {
  const { slug, bookingId } = await params;
  return <BookingManager slug={slug} id={bookingId} />;
}
