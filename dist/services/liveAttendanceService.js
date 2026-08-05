"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.setRsvp = setRsvp;
exports.getMyAttendance = getMyAttendance;
exports.listAttendanceForLesson = listAttendanceForLesson;
exports.markAttended = markAttended;
const db_1 = require("@novr/db");
const types_1 = require("@novr/types");
const errors_1 = require("../lib/errors");
const progressService_1 = require("./progressService");
async function setRsvp(userId, courseId, lessonId, going) {
    const enrollment = await (0, progressService_1.getActiveEnrollment)(userId, courseId);
    if (!enrollment)
        throw new errors_1.NotEnrolledError();
    const lesson = await db_1.prisma.lesson.findUnique({ where: { id: lessonId } });
    if (!lesson || lesson.courseId !== courseId)
        throw new errors_1.NotFoundError("Lesson not found");
    if (lesson.type !== types_1.LessonType.LIVE)
        throw new errors_1.InvalidLessonTypeError("This lesson is not a live class");
    const progress = await (0, progressService_1.getCourseProgress)(userId, courseId);
    const entry = progress.lessons.find((l) => l.lessonId === lessonId);
    if (!entry?.unlocked)
        throw new errors_1.LessonLockedError();
    return db_1.prisma.liveAttendance.upsert({
        where: { lessonId_userId: { lessonId, userId } },
        create: { lessonId, userId, rsvp: going },
        update: { rsvp: going },
    });
}
async function getMyAttendance(userId, lessonId) {
    return db_1.prisma.liveAttendance.findUnique({ where: { lessonId_userId: { lessonId, userId } } });
}
async function listAttendanceForLesson(lessonId) {
    const attendance = await db_1.prisma.liveAttendance.findMany({
        where: { lessonId },
        orderBy: { createdAt: "asc" },
    });
    const users = await db_1.prisma.user.findMany({
        where: { id: { in: attendance.map((a) => a.userId) } },
        select: { id: true, name: true, email: true },
    });
    const userById = new Map(users.map((u) => [u.id, u]));
    return attendance.map((a) => ({ ...a, user: userById.get(a.userId) ?? null }));
}
/**
 * Called from the Daily.co "participant-joined" webhook. Marks attendance
 * and — since this is the only server-verifiable signal that someone
 * actually attended a live class (RSVP alone isn't enough) — completes the
 * lesson, same as video watchPct / PDF read / quiz pass.
 */
async function markAttended(lessonId, userId) {
    await db_1.prisma.liveAttendance.upsert({
        where: { lessonId_userId: { lessonId, userId } },
        create: { lessonId, userId, rsvp: true, attended: true, joinedAt: new Date() },
        update: { attended: true, joinedAt: new Date() },
    });
    const lesson = await db_1.prisma.lesson.findUnique({ where: { id: lessonId } });
    if (!lesson)
        return;
    const enrollment = await (0, progressService_1.getActiveEnrollment)(userId, lesson.courseId);
    if (!enrollment)
        return; // attended without an active enrollment — nothing to credit
    const existing = await db_1.prisma.lessonProgress.findUnique({
        where: { enrollmentId_lessonId: { enrollmentId: enrollment.id, lessonId } },
    });
    if (existing?.completed)
        return;
    await db_1.prisma.lessonProgress.upsert({
        where: { enrollmentId_lessonId: { enrollmentId: enrollment.id, lessonId } },
        create: {
            userId,
            lessonId,
            enrollmentId: enrollment.id,
            watchPct: 100,
            completed: true,
            completedAt: new Date(),
        },
        update: { watchPct: 100, completed: true, completedAt: new Date() },
    });
    await (0, progressService_1.recalculateEnrollmentProgress)(enrollment.id, lesson.courseId);
}
