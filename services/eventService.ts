import { prisma } from "@novr/db";
import { EventRsvpStatus, EventVisibility } from "@novr/types";
import { ApiError, NotFoundError } from "../lib/errors";
import { enqueueEventReminders } from "../queues/emailQueue";
import * as r2Service from "./r2Service";

export interface CreateEventInput {
  hostId: string;
  title: string;
  description?: string;
  startAt: Date;
  endAt?: Date;
  meetingUrl?: string;
  capacity?: number;
  visibility?: EventVisibility;
}

export async function createEvent(input: CreateEventInput) {
  const event = await prisma.event.create({ data: input });
  enqueueEventReminders(event.id, event.startAt);
  return event;
}

export async function listEvents() {
  return prisma.event.findMany({
    orderBy: { startAt: "asc" },
    include: {
      host: { select: { id: true, name: true, email: true } },
      _count: { select: { rsvps: true } },
    },
  });
}

export async function getEventById(id: string) {
  return prisma.event.findUnique({
    where: { id },
    include: { host: { select: { id: true, name: true, email: true } }, _count: { select: { rsvps: true } } },
  });
}

export interface UpdateEventInput {
  title?: string;
  description?: string;
  startAt?: Date;
  endAt?: Date;
  meetingUrl?: string;
  capacity?: number;
  visibility?: EventVisibility;
}

export async function updateEvent(id: string, requesterId: string, isAdmin: boolean, input: UpdateEventInput) {
  const event = await prisma.event.findUnique({ where: { id } });
  if (!event) throw new NotFoundError("Event not found");
  if (event.hostId !== requesterId && !isAdmin) throw new NotFoundError("Event not found");
  return prisma.event.update({ where: { id }, data: input });
}

export async function deleteEvent(id: string, requesterId: string, isAdmin: boolean) {
  const event = await prisma.event.findUnique({ where: { id } });
  if (!event) throw new NotFoundError("Event not found");
  if (event.hostId !== requesterId && !isAdmin) throw new NotFoundError("Event not found");
  await prisma.event.delete({ where: { id } });
}

async function goingCount(eventId: string) {
  return prisma.eventRsvp.count({ where: { eventId, status: EventRsvpStatus.GOING } });
}

/** RSVPs go straight to GOING unless capacity is full, in which case they land on the waitlist. */
export async function rsvp(userId: string, eventId: string) {
  const event = await prisma.event.findUnique({ where: { id: eventId } });
  if (!event) throw new NotFoundError("Event not found");

  const existing = await prisma.eventRsvp.findUnique({ where: { userId_eventId: { userId, eventId } } });
  if (existing && existing.status !== EventRsvpStatus.CANCELLED) return existing;

  const isFull = event.capacity != null && (await goingCount(eventId)) >= event.capacity;
  const status = isFull ? EventRsvpStatus.WAITLIST : EventRsvpStatus.GOING;

  return prisma.eventRsvp.upsert({
    where: { userId_eventId: { userId, eventId } },
    create: { userId, eventId, status },
    update: { status },
  });
}

/** Cancelling a GOING spot promotes the longest-waiting person on the waitlist, if any. */
export async function cancelRsvp(userId: string, eventId: string) {
  const existing = await prisma.eventRsvp.findUnique({ where: { userId_eventId: { userId, eventId } } });
  if (!existing) return;

  await prisma.eventRsvp.update({
    where: { userId_eventId: { userId, eventId } },
    data: { status: EventRsvpStatus.CANCELLED },
  });

  if (existing.status === EventRsvpStatus.GOING) {
    const next = await prisma.eventRsvp.findFirst({
      where: { eventId, status: EventRsvpStatus.WAITLIST },
      orderBy: { createdAt: "asc" },
    });
    if (next) {
      await prisma.eventRsvp.update({ where: { id: next.id }, data: { status: EventRsvpStatus.GOING } });
    }
  }
}

export async function listRsvps(eventId: string) {
  return prisma.eventRsvp.findMany({
    where: { eventId },
    orderBy: { createdAt: "asc" },
    include: { user: { select: { id: true, name: true, email: true } } },
  });
}

export async function getMyRsvp(userId: string, eventId: string) {
  return prisma.eventRsvp.findUnique({ where: { userId_eventId: { userId, eventId } } });
}

export async function createRecordingUploadUrl(eventId: string, requesterId: string, isAdmin: boolean) {
  const event = await prisma.event.findUnique({ where: { id: eventId } });
  if (!event) throw new NotFoundError("Event not found");
  if (event.hostId !== requesterId && !isAdmin) throw new ApiError(403, "Only the host or an admin can upload a recording");

  const key = `events/${eventId}/recording.mp4`;
  const uploadUrl = await r2Service.createGenericUploadUrl(key, "video/mp4");
  await prisma.event.update({ where: { id: eventId }, data: { recordingUrl: key } });
  return { uploadUrl, key };
}

export async function getRecordingViewUrl(eventId: string) {
  const event = await prisma.event.findUnique({ where: { id: eventId } });
  if (!event?.recordingUrl) throw new NotFoundError("No recording available for this event");
  return r2Service.createViewUrl(event.recordingUrl, "video/mp4");
}
