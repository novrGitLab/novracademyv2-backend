"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getActiveEnrollment = getActiveEnrollment;
exports.getCourseProgress = getCourseProgress;
exports.recalculateEnrollmentProgress = recalculateEnrollmentProgress;
exports.recordHeartbeat = recordHeartbeat;
exports.markPdfLessonComplete = markPdfLessonComplete;
const db_1 = require("@novr/db");
const types_1 = require("@novr/types");
const errors_1 = require("../lib/errors");
const certificateQueue_1 = require("../queues/certificateQueue");
// Matches the ~5s client heartbeat cadence; a little slack is added for
// network/timer jitter so legitimate playback never gets clamped.
const HEARTBEAT_INTERVAL_SECONDS = 5;
const HEARTBEAT_TOLERANCE_SECONDS = 3;
async function getActiveEnrollment(userId, courseId) {
    return db_1.prisma.enrollment.findFirst({
        where: {
            userId,
            courseId,
            status: "ACTIVE",
            OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
        },
        orderBy: { enrolledAt: "desc" },
    });
}
async function getCourseProgress(userId, courseId) {
    const enrollment = await getActiveEnrollment(userId, courseId);
    if (!enrollment)
        throw new errors_1.NotEnrolledError();
    const [lessons, progressRows] = await Promise.all([
        db_1.prisma.lesson.findMany({ where: { courseId }, orderBy: { order: "asc" } }),
        db_1.prisma.lessonProgress.findMany({ where: { enrollmentId: enrollment.id } }),
    ]);
    const progressByLessonId = new Map(progressRows.map((p) => [p.lessonId, p]));
    let previousCompleted = true;
    const lessonEntries = lessons.map((lesson) => {
        const progress = progressByLessonId.get(lesson.id);
        const unlocked = previousCompleted;
        previousCompleted = progress?.completed ?? false;
        return {
            lessonId: lesson.id,
            title: lesson.title,
            type: lesson.type,
            order: lesson.order,
            unlocked,
            completed: progress?.completed ?? false,
            watchPct: progress?.watchPct ?? 0,
            lastPositionSeconds: progress?.lastPositionSeconds ?? 0,
        };
    });
    return {
        enrollmentId: enrollment.id,
        courseProgressPct: enrollment.progressPct,
        completedAt: enrollment.completedAt,
        lessons: lessonEntries,
    };
}
/**
 * Recomputes Enrollment.progressPct from completed-lesson count and, on
 * reaching 100%, stamps completedAt. Called after any lesson-completing
 * action (video heartbeat, PDF "mark as read", passing quiz) so the
 * course-level rollup never drifts from the underlying LessonProgress rows.
 */
async function recalculateEnrollmentProgress(enrollmentId, courseId) {
    const [totalLessons, completedLessons, enrollment] = await Promise.all([
        db_1.prisma.lesson.count({ where: { courseId } }),
        db_1.prisma.lessonProgress.count({ where: { enrollmentId, completed: true } }),
        db_1.prisma.enrollment.findUniqueOrThrow({ where: { id: enrollmentId } }),
    ]);
    const progressPct = totalLessons > 0 ? Math.min(100, (completedLessons / totalLessons) * 100) : 0;
    const justCompletedCourse = progressPct >= 100 && !enrollment.completedAt;
    const updated = await db_1.prisma.enrollment.update({
        where: { id: enrollmentId },
        data: {
            progressPct,
            ...(justCompletedCourse ? { completedAt: new Date() } : {}),
        },
    });
    if (justCompletedCourse) {
        await (0, certificateQueue_1.enqueueCertificateGeneration)(enrollmentId);
    }
    return updated;
}
/**
 * Records video watch progress from a player heartbeat. Server-enforced,
 * not just UI: rejects writes to a locked lesson, and (unless the course
 * allows forward-scrubbing) clamps the reported position so a client can't
 * report having watched further than real elapsed time would allow.
 */
async function recordHeartbeat(params) {
    const { userId, courseId, lessonId, positionSeconds, durationSeconds } = params;
    const [enrollment, course, lesson] = await Promise.all([
        getActiveEnrollment(userId, courseId),
        db_1.prisma.course.findUnique({ where: { id: courseId } }),
        db_1.prisma.lesson.findUnique({ where: { id: lessonId } }),
    ]);
    if (!enrollment)
        throw new errors_1.NotEnrolledError();
    if (!course)
        throw new errors_1.NotFoundError("Course not found");
    if (!lesson || lesson.courseId !== courseId)
        throw new errors_1.NotFoundError("Lesson not found");
    if (lesson.type !== types_1.LessonType.VIDEO) {
        throw new errors_1.InvalidLessonTypeError("Heartbeat only applies to video lessons");
    }
    const progressOverview = await getCourseProgress(userId, courseId);
    const entry = progressOverview.lessons.find((l) => l.lessonId === lessonId);
    if (!entry?.unlocked)
        throw new errors_1.LessonLockedError();
    const existing = await db_1.prisma.lessonProgress.findUnique({
        where: { enrollmentId_lessonId: { enrollmentId: enrollment.id, lessonId } },
    });
    let nextPosition = Math.max(0, Math.floor(positionSeconds));
    if (!course.allowForwardScrub && existing) {
        const elapsedRealSeconds = (Date.now() - existing.updatedAt.getTime()) / 1000;
        const maxAllowed = existing.lastPositionSeconds + elapsedRealSeconds + HEARTBEAT_TOLERANCE_SECONDS;
        nextPosition = Math.min(nextPosition, Math.floor(maxAllowed));
    }
    // Never let a reported position move the stored watermark backward —
    // rewatching from the start shouldn't cost progress already earned.
    nextPosition = Math.max(nextPosition, existing?.lastPositionSeconds ?? 0);
    const watchPct = durationSeconds > 0 ? Math.min(100, (nextPosition / durationSeconds) * 100) : 0;
    const finalWatchPct = Math.max(watchPct, existing?.watchPct ?? 0);
    const justCompleted = finalWatchPct >= lesson.minWatchPct;
    const completed = justCompleted || (existing?.completed ?? false);
    const progress = await db_1.prisma.lessonProgress.upsert({
        where: { enrollmentId_lessonId: { enrollmentId: enrollment.id, lessonId } },
        create: {
            userId,
            lessonId,
            enrollmentId: enrollment.id,
            watchPct: finalWatchPct,
            completed,
            lastPositionSeconds: nextPosition,
            timeSpentSeconds: HEARTBEAT_INTERVAL_SECONDS,
            completedAt: completed ? new Date() : null,
        },
        update: {
            watchPct: finalWatchPct,
            completed,
            lastPositionSeconds: nextPosition,
            timeSpentSeconds: { increment: HEARTBEAT_INTERVAL_SECONDS },
            ...(completed && !existing?.completed ? { completedAt: new Date() } : {}),
        },
    });
    if (completed && !existing?.completed) {
        const updatedEnrollment = await recalculateEnrollmentProgress(enrollment.id, courseId);
        return { ...progress, courseProgressPct: updatedEnrollment.progressPct };
    }
    return { ...progress, courseProgressPct: enrollment.progressPct };
}
/**
 * Marks a PDF lesson as complete once the learner has viewed it (the
 * viewer calls this on reaching the last page). PDFs don't have a
 * heartbeat-style server-verifiable "watch time", so this is a simpler
 * completion gate than video: enrollment + unlock still enforced, but the
 * client is trusted on "did they open/scroll it".
 */
async function markPdfLessonComplete(userId, courseId, lessonId) {
    const enrollment = await getActiveEnrollment(userId, courseId);
    if (!enrollment)
        throw new errors_1.NotEnrolledError();
    const lesson = await db_1.prisma.lesson.findUnique({ where: { id: lessonId } });
    if (!lesson || lesson.courseId !== courseId)
        throw new errors_1.NotFoundError("Lesson not found");
    if (lesson.type !== types_1.LessonType.PDF) {
        throw new errors_1.InvalidLessonTypeError("This operation only applies to PDF lessons");
    }
    const progressOverview = await getCourseProgress(userId, courseId);
    const entry = progressOverview.lessons.find((l) => l.lessonId === lessonId);
    if (!entry?.unlocked)
        throw new errors_1.LessonLockedError();
    const progress = await db_1.prisma.lessonProgress.upsert({
        where: { enrollmentId_lessonId: { enrollmentId: enrollment.id, lessonId } },
        create: {
            userId,
            lessonId,
            enrollmentId: enrollment.id,
            watchPct: 100,
            completed: true,
            completedAt: new Date(),
        },
        update: entry.completed
            ? {}
            : {
                watchPct: 100,
                completed: true,
                completedAt: new Date(),
            },
    });
    if (!entry.completed) {
        const updatedEnrollment = await recalculateEnrollmentProgress(enrollment.id, courseId);
        return { ...progress, courseProgressPct: updatedEnrollment.progressPct };
    }
    return { ...progress, courseProgressPct: enrollment.progressPct };
}
