import { createHash, randomBytes, randomUUID } from "node:crypto";
import type { Prisma, ScheduleRequest as BookingRow } from "@prisma/client";
import { prisma } from "./db";
import { normalizeFloorSettings } from "./spaceNormalize";
import { quickBuildConfigForLink } from "./quickBuilds";
import { isPublicActionEnabled } from "./toolPublic";
import { bookingConflicts, bookingStart, bookingTimeZone, composeBookingNotes, scheduleDates, scheduleInstant, scheduleSlots, type SchedulerConfig } from "./scheduling";
import type { ScheduleRequestStatus } from "./types";

export class BookingError extends Error {}
const fail = (message: string): never => { throw new BookingError(message); };
const hash = (token: string) => createHash("sha256").update(token).digest("hex");

type Tx = Prisma.TransactionClient;
async function settingsFor(tx: Tx, slug: string) {
  const space = await tx.space.findUnique({ where: { slug } });
  if (!space) return fail("This business is unavailable.");
  return { space, settings: normalizeFloorSettings(JSON.parse(space.data).settings) };
}
async function eventFor(tx: Tx, slug: string, eventId: string) {
  const { settings } = await settingsFor(tx, slug);
  const link = settings.preChat?.links.find((link) => link.id === eventId);
  const config = link && quickBuildConfigForLink(link);
  if (!isPublicActionEnabled(settings, "scheduler") || config?.type !== "scheduler") return fail("This event is no longer available.");
  return config;
}

// Row locks are held through commit, protecting bookings across processes and requests.
async function locked<T>(slug: string, work: (tx: Tx) => Promise<T>) {
  return prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT "slug" FROM "Space" WHERE "slug" = ${slug} FOR UPDATE`;
    const result = await work(tx);
    await tx.space.update({ where: { slug }, data: { updatedAt: new Date() } });
    return result;
  }, { maxWait: 10000, timeout: 20000 });
}
async function activeBookings(tx: Tx, slug: string, except?: string) {
  return tx.scheduleRequest.findMany({ where: { spaceSlug: slug, status: { in: ["requested", "confirmed"] }, ...(except ? { id: { not: except } } : {}) } });
}
function times(config: SchedulerConfig, date: string, time: string) {
  const start = scheduleInstant(date, time, config.timeZone);
  if (!Number.isFinite(start)) return fail("Choose a valid appointment time.");
  return { date, time, timeZone: config.timeZone ?? "UTC", startsAt: new Date(start), endsAt: new Date(start + config.durationMinutes * 60000), durationMinutes: config.durationMinutes, bufferBeforeMinutes: config.bufferBeforeMinutes ?? 0, bufferAfterMinutes: config.bufferAfterMinutes ?? 0 };
}
export function publicBooking(row: BookingRow) {
  const { managementTokenHash: _secret, ...booking } = row;
  void _secret;
  return { ...booking, timeZone: bookingTimeZone(row) };
}
function slotMap(config: SchedulerConfig, busy: BookingRow[]) {
  const now = Date.now();
  return Object.fromEntries(scheduleDates(config, now).map((day) => [day.value, scheduleSlots(config, day.value, now, busy)]));
}
export async function bookingAvailability(slug: string, eventId: string) {
  const config = await eventFor(prisma, slug, eventId);
  return { config, slots: slotMap(config, await activeBookings(prisma, slug)) };
}

type CreateInput = { schedulerId: string; date: string; time: string; name: string; email?: string; phone?: string; notes?: string; choice?: string; token?: string; id?: string; chatId?: string };
export async function createBooking(slug: string, input: CreateInput) {
  if (typeof input.schedulerId !== "string" || typeof input.name !== "string" || !input.name.trim() || typeof input.email !== "string" || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input.email)) return fail("Enter your name and a valid email address.");
  if (typeof input.date !== "string" || typeof input.time !== "string") return fail("Choose a date and time.");
  if (input.token !== undefined && (typeof input.token !== "string" || !/^[a-f0-9]{64}$/.test(input.token))) return fail("Invalid booking key. Refresh and try again.");
  const token = input.token ?? randomBytes(32).toString("hex");
  const row = await locked(slug, async (tx) => {
    const existing = await tx.scheduleRequest.findUnique({ where: { managementTokenHash: hash(token) } });
    if (existing) {
      if (existing.spaceSlug !== slug || existing.schedulerId !== input.schedulerId || existing.email !== input.email!.trim()) return fail("This booking key has already been used.");
      return existing;
    }
    const config = await eventFor(tx, slug, input.schedulerId);
    if (config.requirePhone && (typeof input.phone !== "string" || !input.phone.trim())) return fail("Enter a phone number.");
    const notes = composeBookingNotes(config, input.choice, input.notes);
    if (notes === null) return fail("Choose an option.");
    const busy = await activeBookings(tx, slug);
    if (!scheduleSlots(config, input.date, Date.now(), busy).some((slot) => slot.value === input.time)) return fail("That time is no longer available. Choose another time.");
    return tx.scheduleRequest.create({ data: {
      id: input.id || `sch-${randomUUID()}`, spaceSlug: slug, schedulerId: input.schedulerId,
      name: input.name.trim().slice(0, 80), email: input.email!.trim().slice(0, 120),
      phone: typeof input.phone === "string" ? input.phone.trim().slice(0, 40) : "",
      notes,
      chatId: input.chatId ?? "", title: config.title,
      ...times(config, input.date, input.time), status: config.confirmationMode === "instant" ? "confirmed" : "requested", managementTokenHash: hash(token),
    } });
  });
  return { booking: publicBooking(row), token };
}

type Access = { token?: string; ownerId?: string };
async function authorized(tx: Tx, slug: string, id: string, access: Access) {
  const row = await tx.scheduleRequest.findFirst({ where: { id, spaceSlug: slug } });
  if (!row) return fail("This booking link is invalid or expired.");
  if (typeof access.token === "string" && /^[a-f0-9]{64}$/.test(access.token) && row.managementTokenHash === hash(access.token)) return row;
  if (access.ownerId) {
    const space = await tx.space.findUnique({ where: { slug }, select: { ownerId: true } });
    if (space?.ownerId === access.ownerId) return row;
  }
  return fail("This booking link is invalid or expired.");
}
async function eventForBooking(tx: Tx, slug: string, row: BookingRow) {
  let eventId = row.schedulerId;
  if (!eventId) {
    const { settings } = await settingsFor(tx, slug);
    const matches = settings.preChat?.links.filter((link) => {
      const config = quickBuildConfigForLink(link);
      return config?.type === "scheduler" && config.title === row.title;
    }) ?? [];
    if (matches.length === 1) eventId = matches[0].id;
  }
  return { eventId, config: await eventFor(tx, slug, eventId) };
}
export async function readBooking(slug: string, id: string, access: Access) {
  const row = await authorized(prisma, slug, id, access);
  let config: SchedulerConfig | null = null;
  try { config = (await eventForBooking(prisma, slug, row)).config; } catch (error) { if (!(error instanceof BookingError)) throw error; }
  return { booking: publicBooking(row), config, slots: config ? slotMap(config, await activeBookings(prisma, slug, id)) : {} };
}
export async function changeBooking(slug: string, id: string, access: Access, change: { action: string; date?: string; time?: string; status?: ScheduleRequestStatus }) {
  const row = await locked(slug, async (tx) => {
    const current = await authorized(tx, slug, id, access);
    if (change.action === "cancel") {
      if (current.status === "canceled") return current;
      if (bookingStart(current) <= Date.now()) return fail("Past appointments cannot be canceled.");
      return tx.scheduleRequest.update({ where: { id }, data: { status: "canceled" } });
    }
    if (change.action === "reschedule") {
      if (!["confirmed", "requested"].includes(current.status) || bookingStart(current) <= Date.now()) return fail("This appointment can no longer be rescheduled.");
      const { config, eventId } = await eventForBooking(tx, slug, current);
      const busy = await activeBookings(tx, slug, id);
      if (!change.date || !change.time || !scheduleSlots(config, change.date, Date.now(), busy).some((slot) => slot.value === change.time)) return fail("That time is no longer available. Choose another time.");
      return tx.scheduleRequest.update({ where: { id }, data: { schedulerId: eventId, ...times(config, change.date, change.time), status: config.confirmationMode === "instant" ? "confirmed" : "requested" } });
    }
    if (change.action === "status" && access.ownerId && change.status && ["requested", "confirmed", "declined", "canceled"].includes(change.status)) {
      if (change.status === "confirmed" || change.status === "requested") {
        const start = bookingStart(current);
        const end = current.endsAt?.getTime() ?? start + current.durationMinutes * 60000;
        if (!Number.isFinite(start) || start <= Date.now()) return fail("Past or invalid appointments cannot be confirmed or restored.");
        if (bookingConflicts(start, end, current.bufferBeforeMinutes, current.bufferAfterMinutes, await activeBookings(tx, slug, id))) return fail("This appointment overlaps another booking. Reschedule it first.");
      }
      return tx.scheduleRequest.update({ where: { id }, data: { status: change.status } });
    }
    return fail("Invalid booking action.");
  });
  return publicBooking(row);
}
