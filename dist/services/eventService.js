"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.createEvent = createEvent;
exports.listEvents = listEvents;
exports.getEventById = getEventById;
exports.updateEvent = updateEvent;
exports.deleteEvent = deleteEvent;
exports.rsvp = rsvp;
exports.cancelRsvp = cancelRsvp;
exports.listRsvps = listRsvps;
exports.getMyRsvp = getMyRsvp;
exports.createRecordingUploadUrl = createRecordingUploadUrl;
exports.getRecordingViewUrl = getRecordingViewUrl;
const db_1 = require("@novr/db");
const types_1 = require("@novr/types");
const errors_1 = require("../lib/errors");
const emailQueue_1 = require("../queues/emailQueue");
const r2Service = __importStar(require("./r2Service"));
async function createEvent(input) {
    const event = await db_1.prisma.event.create({ data: input });
    (0, emailQueue_1.enqueueEventReminders)(event.id, event.startAt);
    return event;
}
async function listEvents() {
    return db_1.prisma.event.findMany({
        orderBy: { startAt: "asc" },
        include: {
            host: { select: { id: true, name: true, email: true } },
            _count: { select: { rsvps: true } },
        },
    });
}
async function getEventById(id) {
    return db_1.prisma.event.findUnique({
        where: { id },
        include: { host: { select: { id: true, name: true, email: true } }, _count: { select: { rsvps: true } } },
    });
}
async function updateEvent(id, requesterId, isAdmin, input) {
    const event = await db_1.prisma.event.findUnique({ where: { id } });
    if (!event)
        throw new errors_1.NotFoundError("Event not found");
    if (event.hostId !== requesterId && !isAdmin)
        throw new errors_1.NotFoundError("Event not found");
    return db_1.prisma.event.update({ where: { id }, data: input });
}
async function deleteEvent(id, requesterId, isAdmin) {
    const event = await db_1.prisma.event.findUnique({ where: { id } });
    if (!event)
        throw new errors_1.NotFoundError("Event not found");
    if (event.hostId !== requesterId && !isAdmin)
        throw new errors_1.NotFoundError("Event not found");
    await db_1.prisma.event.delete({ where: { id } });
}
async function goingCount(eventId) {
    return db_1.prisma.eventRsvp.count({ where: { eventId, status: types_1.EventRsvpStatus.GOING } });
}
/** RSVPs go straight to GOING unless capacity is full, in which case they land on the waitlist. */
async function rsvp(userId, eventId) {
    const event = await db_1.prisma.event.findUnique({ where: { id: eventId } });
    if (!event)
        throw new errors_1.NotFoundError("Event not found");
    const existing = await db_1.prisma.eventRsvp.findUnique({ where: { userId_eventId: { userId, eventId } } });
    if (existing && existing.status !== types_1.EventRsvpStatus.CANCELLED)
        return existing;
    const isFull = event.capacity != null && (await goingCount(eventId)) >= event.capacity;
    const status = isFull ? types_1.EventRsvpStatus.WAITLIST : types_1.EventRsvpStatus.GOING;
    return db_1.prisma.eventRsvp.upsert({
        where: { userId_eventId: { userId, eventId } },
        create: { userId, eventId, status },
        update: { status },
    });
}
/** Cancelling a GOING spot promotes the longest-waiting person on the waitlist, if any. */
async function cancelRsvp(userId, eventId) {
    const existing = await db_1.prisma.eventRsvp.findUnique({ where: { userId_eventId: { userId, eventId } } });
    if (!existing)
        return;
    await db_1.prisma.eventRsvp.update({
        where: { userId_eventId: { userId, eventId } },
        data: { status: types_1.EventRsvpStatus.CANCELLED },
    });
    if (existing.status === types_1.EventRsvpStatus.GOING) {
        const next = await db_1.prisma.eventRsvp.findFirst({
            where: { eventId, status: types_1.EventRsvpStatus.WAITLIST },
            orderBy: { createdAt: "asc" },
        });
        if (next) {
            await db_1.prisma.eventRsvp.update({ where: { id: next.id }, data: { status: types_1.EventRsvpStatus.GOING } });
        }
    }
}
async function listRsvps(eventId) {
    return db_1.prisma.eventRsvp.findMany({
        where: { eventId },
        orderBy: { createdAt: "asc" },
        include: { user: { select: { id: true, name: true, email: true } } },
    });
}
async function getMyRsvp(userId, eventId) {
    return db_1.prisma.eventRsvp.findUnique({ where: { userId_eventId: { userId, eventId } } });
}
async function createRecordingUploadUrl(eventId, requesterId, isAdmin) {
    const event = await db_1.prisma.event.findUnique({ where: { id: eventId } });
    if (!event)
        throw new errors_1.NotFoundError("Event not found");
    if (event.hostId !== requesterId && !isAdmin)
        throw new errors_1.ApiError(403, "Only the host or an admin can upload a recording");
    const key = `events/${eventId}/recording.mp4`;
    const uploadUrl = await r2Service.createGenericUploadUrl(key, "video/mp4");
    await db_1.prisma.event.update({ where: { id: eventId }, data: { recordingUrl: key } });
    return { uploadUrl, key };
}
async function getRecordingViewUrl(eventId) {
    const event = await db_1.prisma.event.findUnique({ where: { id: eventId } });
    if (!event?.recordingUrl)
        throw new errors_1.NotFoundError("No recording available for this event");
    return r2Service.createViewUrl(event.recordingUrl, "video/mp4");
}
