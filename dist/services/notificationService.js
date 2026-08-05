"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.listMyNotifications = listMyNotifications;
exports.getUnreadCount = getUnreadCount;
exports.markNotificationRead = markNotificationRead;
exports.markAllRead = markAllRead;
exports.composeToSegment = composeToSegment;
exports.getNotificationHistory = getNotificationHistory;
const db_1 = require("@novr/db");
const types_1 = require("@novr/types");
const emailQueue_1 = require("../queues/emailQueue");
async function listMyNotifications(userId) {
    return db_1.prisma.notification.findMany({ where: { userId }, orderBy: { createdAt: "desc" }, take: 50 });
}
async function getUnreadCount(userId) {
    return db_1.prisma.notification.count({ where: { userId, read: false } });
}
async function markNotificationRead(id, userId) {
    await db_1.prisma.notification.updateMany({ where: { id, userId }, data: { read: true, readAt: new Date() } });
}
async function markAllRead(userId) {
    await db_1.prisma.notification.updateMany({ where: { userId, read: false }, data: { read: true, readAt: new Date() } });
}
async function resolveSegmentUserIds(segment) {
    switch (segment) {
        case "all": {
            const users = await db_1.prisma.user.findMany({ select: { id: true } });
            return users.map((u) => u.id);
        }
        case "inactive": {
            const users = await db_1.prisma.user.findMany({
                where: { posts: { none: {} }, sentMessages: { none: {} } },
                select: { id: true },
            });
            return users.map((u) => u.id);
        }
        case "mentors": {
            const profiles = await db_1.prisma.mentorProfile.findMany({ where: { isActive: true }, select: { userId: true } });
            return profiles.map((p) => p.userId);
        }
        case "open_to_work": {
            const users = await db_1.prisma.user.findMany({ where: { openToWork: true }, select: { id: true } });
            return users.map((u) => u.id);
        }
    }
}
async function composeToSegment(input) {
    const userIds = await resolveSegmentUserIds(input.segment);
    if (input.channels.includes("in_app")) {
        await db_1.prisma.notification.createMany({
            data: userIds.map((userId) => ({
                userId,
                type: types_1.NotificationType.GENERAL,
                title: input.title,
                content: input.content,
            })),
        });
    }
    if (input.channels.includes("email")) {
        await (0, emailQueue_1.enqueueSegmentNotificationEmail)(userIds, input.title, input.content);
    }
    return { recipientCount: userIds.length };
}
/**
 * There's no separate "campaign" table, so history is reconstructed by
 * bucketing in-app notifications with the same title sent in the same
 * minute — good enough to show what was sent and to whom, without the
 * overhead of a dedicated model. Open-rate tracking isn't implemented
 * (would need Resend's webhook events wired up) — this only tracks
 * in-app read state.
 */
async function getNotificationHistory() {
    const recent = await db_1.prisma.notification.findMany({
        orderBy: { createdAt: "desc" },
        take: 500,
        select: { title: true, createdAt: true, read: true },
    });
    const batches = new Map();
    for (const n of recent) {
        const bucketMinute = n.createdAt.toISOString().slice(0, 16);
        const key = `${n.title}__${bucketMinute}`;
        const existing = batches.get(key);
        if (existing) {
            existing.recipientCount += 1;
            if (n.read)
                existing.readCount += 1;
        }
        else {
            batches.set(key, {
                title: n.title,
                sentAt: n.createdAt.toISOString(),
                recipientCount: 1,
                readCount: n.read ? 1 : 0,
            });
        }
    }
    return Array.from(batches.values());
}
