import { NextResponse } from "next/server";
import { notifySpaceListeners } from "@/lib/spaceServer";
import { getSessionUser } from "@/lib/auth";
import { syncDbFromCookies } from "@/lib/db";
import { BookingError, bookingAvailability, changeBooking, createBooking, readBooking } from "@/lib/bookingServer";

const json = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: { "Cache-Control": "no-store", "Referrer-Policy": "no-referrer" } });
function errorResponse(error: unknown) {
  if (error instanceof BookingError) return json({ error: error.message }, 400);
  console.error("[bookings]", error);
  return json({ error: "Could not update scheduling. Please try again." }, 503);
}
export async function GET(request: Request, context: { params: Promise<{ slug: string }> }) {
  try {
    await syncDbFromCookies();
    const { slug } = await context.params;
    return json(await bookingAvailability(slug, new URL(request.url).searchParams.get("eventId") ?? ""));
  } catch (error) { return errorResponse(error); }
}
export async function POST(request: Request, context: { params: Promise<{ slug: string }> }) {
  try {
    await syncDbFromCookies();
    const { slug } = await context.params;
    const body = await request.json();
    if (!body || typeof body !== "object") return json({ error: "Invalid request." }, 400);
    if (body.action === "create") {
      const result = await createBooking(slug, body);
      void notifySpaceListeners(slug).catch(() => {});
      return json(result);
    }
    if (typeof body.id !== "string") return json({ error: "Invalid booking." }, 400);
    const user = body.token ? null : await getSessionUser();
    const access = { token: body.token, ownerId: user?.id };
    if (body.action === "read") return json(await readBooking(slug, body.id, access));
    if (body.action !== "cancel" && body.action !== "reschedule") return json({ error: "Invalid action." }, 400);
    const booking = await changeBooking(slug, body.id, access, body);
    void notifySpaceListeners(slug).catch(() => {});
    return json({ booking });
  } catch (error) { return errorResponse(error); }
}
