"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.upsertMentorProfile = upsertMentorProfile;
exports.getMentorProfile = getMentorProfile;
exports.listMentors = listMentors;
exports.requestSession = requestSession;
exports.respondToSession = respondToSession;
exports.cancelSession = cancelSession;
exports.completeSession = completeSession;
exports.listMySessions = listMySessions;
const db_1 = require("@novr/db");
const types_1 = require("@novr/types");
const errors_1 = require("../lib/errors");
async function upsertMentorProfile(userId, input) {
    return db_1.prisma.mentorProfile.upsert({
        where: { userId },
        create: { userId, ...input },
        update: input,
    });
}
async function getMentorProfile(userId) {
    return db_1.prisma.mentorProfile.findUnique({ where: { userId } });
}
function currentMonthRange() {
    const now = new Date();
    const start = new Date(now.getFullYear(), now.getMonth(), 1);
    const end = new Date(now.getFullYear(), now.getMonth() + 1, 1);
    return { start, end };
}
async function sessionsThisMonth(mentorId) {
    const { start, end } = currentMonthRange();
    return db_1.prisma.mentorSession.count({
        where: {
            mentorId,
            status: { in: [types_1.MentorSessionStatus.ACCEPTED, types_1.MentorSessionStatus.COMPLETED] },
            createdAt: { gte: start, lt: end },
        },
    });
}
async function listMentors(params) {
    const profiles = await db_1.prisma.mentorProfile.findMany({
        where: {
            isActive: true,
            topics: params.topic ? { has: params.topic } : undefined,
        },
        include: { user: { select: { id: true, name: true, email: true, avatarUrl: true, bio: true } } },
    });
    return Promise.all(profiles.map(async (p) => ({
        ...p,
        bookedThisMonth: await sessionsThisMonth(p.userId),
    })));
}
async function requestSession(input) {
    if (input.mentorId === input.menteeId)
        throw new errors_1.ApiError(400, "You can't request a session with yourself");
    const profile = await db_1.prisma.mentorProfile.findUnique({ where: { userId: input.mentorId } });
    if (!profile || !profile.isActive)
        throw new errors_1.NotFoundError("This mentor isn't accepting sessions right now");
    return db_1.prisma.mentorSession.create({
        data: {
            mentorId: input.mentorId,
            menteeId: input.menteeId,
            topic: input.topic,
            scheduledAt: input.scheduledAt,
            status: types_1.MentorSessionStatus.REQUESTED,
        },
    });
}
async function assertParticipant(sessionId, userId) {
    const session = await db_1.prisma.mentorSession.findUnique({ where: { id: sessionId } });
    if (!session)
        throw new errors_1.NotFoundError("Session not found");
    if (session.mentorId !== userId && session.menteeId !== userId) {
        throw new errors_1.NotFoundError("Session not found");
    }
    return session;
}
async function respondToSession(sessionId, mentorId, accept) {
    const session = await db_1.prisma.mentorSession.findUnique({ where: { id: sessionId } });
    if (!session)
        throw new errors_1.NotFoundError("Session not found");
    if (session.mentorId !== mentorId)
        throw new errors_1.NotFoundError("Session not found");
    if (session.status !== types_1.MentorSessionStatus.REQUESTED) {
        throw new errors_1.ApiError(400, "This session has already been responded to");
    }
    if (accept) {
        const profile = await db_1.prisma.mentorProfile.findUnique({ where: { userId: mentorId } });
        const booked = await sessionsThisMonth(mentorId);
        if (profile && booked >= profile.capacityPerMonth) {
            throw new errors_1.ApiError(400, "You've reached your mentoring capacity for this month");
        }
    }
    return db_1.prisma.mentorSession.update({
        where: { id: sessionId },
        data: { status: accept ? types_1.MentorSessionStatus.ACCEPTED : types_1.MentorSessionStatus.DECLINED },
    });
}
async function cancelSession(sessionId, userId) {
    await assertParticipant(sessionId, userId);
    return db_1.prisma.mentorSession.update({ where: { id: sessionId }, data: { status: types_1.MentorSessionStatus.CANCELLED } });
}
async function completeSession(sessionId, userId, input) {
    const session = await assertParticipant(sessionId, userId);
    if (session.status !== types_1.MentorSessionStatus.ACCEPTED) {
        throw new errors_1.ApiError(400, "Only an accepted session can be marked complete");
    }
    // Only the mentee rates the mentor.
    const ratingFields = session.menteeId === userId ? input : {};
    return db_1.prisma.mentorSession.update({
        where: { id: sessionId },
        data: { status: types_1.MentorSessionStatus.COMPLETED, ...ratingFields },
    });
}
async function listMySessions(userId) {
    const [asMentor, asMentee] = await Promise.all([
        db_1.prisma.mentorSession.findMany({
            where: { mentorId: userId },
            orderBy: { createdAt: "desc" },
            include: { mentee: { select: { id: true, name: true, email: true } } },
        }),
        db_1.prisma.mentorSession.findMany({
            where: { menteeId: userId },
            orderBy: { createdAt: "desc" },
            include: { mentor: { select: { id: true, name: true, email: true } } },
        }),
    ]);
    return { asMentor, asMentee };
}
