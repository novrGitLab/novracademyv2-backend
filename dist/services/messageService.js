"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getOrCreateDirectThread = getOrCreateDirectThread;
exports.createGroupThread = createGroupThread;
exports.listMyThreads = listMyThreads;
exports.getThreadMessages = getThreadMessages;
exports.sendMessage = sendMessage;
exports.markThreadRead = markThreadRead;
exports.getThreadParticipantIds = getThreadParticipantIds;
const db_1 = require("@novr/db");
const errors_1 = require("../lib/errors");
const MAX_GROUP_DM_PARTICIPANTS = 20;
async function assertParticipant(threadId, userId) {
    const participant = await db_1.prisma.messageThreadParticipant.findUnique({
        where: { threadId_userId: { threadId, userId } },
    });
    if (!participant)
        throw new errors_1.NotFoundError("Thread not found");
}
/** Reuses an existing 1:1 thread between these two users if one exists, rather than creating duplicates. */
async function getOrCreateDirectThread(userId, otherUserId) {
    if (userId === otherUserId)
        throw new errors_1.ApiError(400, "Can't message yourself");
    const otherUser = await db_1.prisma.user.findUnique({ where: { id: otherUserId } });
    if (!otherUser)
        throw new errors_1.NotFoundError("User not found");
    const existing = await db_1.prisma.messageThread.findFirst({
        where: {
            isGroup: false,
            AND: [
                { participants: { some: { userId } } },
                { participants: { some: { userId: otherUserId } } },
            ],
        },
    });
    if (existing)
        return existing;
    return db_1.prisma.messageThread.create({
        data: {
            isGroup: false,
            participants: { create: [{ userId }, { userId: otherUserId }] },
        },
    });
}
async function createGroupThread(creatorId, participantIds, name) {
    const uniqueIds = [...new Set([creatorId, ...participantIds])];
    if (uniqueIds.length < 3) {
        throw new errors_1.ApiError(400, "A group DM needs at least 3 participants — use a direct thread otherwise");
    }
    if (uniqueIds.length > MAX_GROUP_DM_PARTICIPANTS) {
        throw new errors_1.ApiError(400, `Group DMs are limited to ${MAX_GROUP_DM_PARTICIPANTS} participants`);
    }
    return db_1.prisma.messageThread.create({
        data: {
            isGroup: true,
            name,
            participants: { create: uniqueIds.map((userId) => ({ userId })) },
        },
    });
}
async function listMyThreads(userId) {
    const participations = await db_1.prisma.messageThreadParticipant.findMany({
        where: { userId },
        include: {
            thread: {
                include: {
                    participants: { include: { user: { select: { id: true, name: true, email: true, avatarUrl: true } } } },
                    messages: { orderBy: { createdAt: "desc" }, take: 1 },
                },
            },
        },
    });
    const threads = await Promise.all(participations.map(async (p) => {
        const unreadCount = await db_1.prisma.message.count({
            where: { threadId: p.threadId, senderId: { not: userId }, readReceipts: { none: { userId } } },
        });
        return {
            id: p.thread.id,
            isGroup: p.thread.isGroup,
            name: p.thread.name,
            participants: p.thread.participants.map((pp) => pp.user),
            lastMessage: p.thread.messages[0] ?? null,
            unreadCount,
        };
    }));
    return threads.sort((a, b) => {
        const at = a.lastMessage ? new Date(a.lastMessage.createdAt).getTime() : 0;
        const bt = b.lastMessage ? new Date(b.lastMessage.createdAt).getTime() : 0;
        return bt - at;
    });
}
async function getThreadMessages(threadId, userId) {
    await assertParticipant(threadId, userId);
    return db_1.prisma.message.findMany({
        where: { threadId },
        orderBy: { createdAt: "asc" },
        include: { sender: { select: { id: true, name: true, email: true, avatarUrl: true } } },
    });
}
async function sendMessage(input) {
    await assertParticipant(input.threadId, input.senderId);
    const message = await db_1.prisma.message.create({
        data: {
            threadId: input.threadId,
            senderId: input.senderId,
            content: input.content,
            mediaUrls: input.mediaUrls ?? [],
        },
        include: { sender: { select: { id: true, name: true, email: true, avatarUrl: true } } },
    });
    // Sending implicitly reads your own message.
    await db_1.prisma.messageReadReceipt.create({ data: { messageId: message.id, userId: input.senderId } }).catch(() => { });
    return message;
}
async function markThreadRead(threadId, userId) {
    await assertParticipant(threadId, userId);
    const unread = await db_1.prisma.message.findMany({
        where: { threadId, senderId: { not: userId }, readReceipts: { none: { userId } } },
        select: { id: true },
    });
    if (unread.length === 0)
        return;
    await db_1.prisma.messageReadReceipt.createMany({
        data: unread.map((m) => ({ messageId: m.id, userId })),
        skipDuplicates: true,
    });
}
async function getThreadParticipantIds(threadId) {
    const participants = await db_1.prisma.messageThreadParticipant.findMany({
        where: { threadId },
        select: { userId: true },
    });
    return participants.map((p) => p.userId);
}
