"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getQuizResultsReport = getQuizResultsReport;
exports.getCourseCompletionReport = getCourseCompletionReport;
exports.getEnrollmentReport = getEnrollmentReport;
exports.getTimeSpentReport = getTimeSpentReport;
exports.getLearnerProgressReport = getLearnerProgressReport;
exports.getRevenueReport = getRevenueReport;
exports.getCommunityEngagementReport = getCommunityEngagementReport;
const db_1 = require("@novr/db");
const types_1 = require("@novr/types");
async function getQuizResultsReport() {
    const attempts = await db_1.prisma.quizAttempt.findMany({
        include: {
            user: { select: { name: true, email: true } },
            quiz: { include: { lesson: { include: { course: { select: { title: true } } } } } },
        },
        orderBy: { submittedAt: "desc" },
    });
    return attempts.map((a) => ({
        learner: a.user.name ?? a.user.email,
        email: a.user.email,
        course: a.quiz.lesson.course.title,
        lesson: a.quiz.lesson.title,
        attemptNumber: a.attemptNumber,
        scorePct: Math.round(a.score),
        passed: a.passed ? "Yes" : "No",
        submittedAt: a.submittedAt.toISOString(),
    }));
}
async function getCourseCompletionReport() {
    const enrollments = await db_1.prisma.enrollment.findMany({
        where: { completedAt: { not: null } },
        include: {
            user: { select: { name: true, email: true } },
            course: { select: { title: true } },
            certificate: { select: { certUid: true } },
        },
        orderBy: { completedAt: "desc" },
    });
    return enrollments.map((e) => ({
        learner: e.user.name ?? e.user.email,
        email: e.user.email,
        course: e.course.title,
        completedAt: e.completedAt?.toISOString() ?? "",
        progressPct: Math.round(e.progressPct),
        certificateId: e.certificate?.certUid ?? "",
    }));
}
async function getEnrollmentReport() {
    const enrollments = await db_1.prisma.enrollment.findMany({
        include: { user: { select: { name: true, email: true } }, course: { select: { title: true } } },
        orderBy: { enrolledAt: "desc" },
    });
    return enrollments.map((e) => ({
        learner: e.user.name ?? e.user.email,
        email: e.user.email,
        course: e.course.title,
        status: e.status,
        source: e.source,
        enrolledAt: e.enrolledAt.toISOString(),
        expiresAt: e.expiresAt?.toISOString() ?? "Lifetime",
    }));
}
async function getTimeSpentReport() {
    const rows = await db_1.prisma.lessonProgress.groupBy({ by: ["userId"], _sum: { timeSpentSeconds: true } });
    const users = await db_1.prisma.user.findMany({
        where: { id: { in: rows.map((r) => r.userId) } },
        select: { id: true, name: true, email: true },
    });
    const userById = new Map(users.map((u) => [u.id, u]));
    return rows.map((r) => {
        const user = userById.get(r.userId);
        return {
            learner: user?.name ?? user?.email ?? r.userId,
            email: user?.email ?? "",
            totalHours: ((r._sum.timeSpentSeconds ?? 0) / 3600).toFixed(2),
        };
    });
}
async function getLearnerProgressReport(userId) {
    const progress = await db_1.prisma.lessonProgress.findMany({
        where: { userId },
        include: { lesson: { select: { title: true, order: true, course: { select: { title: true } } } } },
    });
    return progress
        .sort((a, b) => a.lesson.order - b.lesson.order)
        .map((p) => ({
        course: p.lesson.course.title,
        lesson: p.lesson.title,
        completed: p.completed ? "Yes" : "No",
        watchPct: Math.round(p.watchPct),
        timeSpentMinutes: Math.round(p.timeSpentSeconds / 60),
    }));
}
async function getRevenueReport() {
    const payments = await db_1.prisma.payment.findMany({
        where: { status: types_1.PaymentStatus.SUCCEEDED },
        include: { user: { select: { name: true, email: true } }, course: { select: { title: true } } },
        orderBy: { createdAt: "desc" },
    });
    return payments.map((p) => ({
        learner: p.user.name ?? p.user.email,
        course: p.course?.title ?? "",
        amount: (p.amountCents / 100).toFixed(2),
        currency: p.currency,
        provider: p.provider,
        date: p.createdAt.toISOString(),
    }));
}
async function getCommunityEngagementReport() {
    const users = await db_1.prisma.user.findMany({
        select: {
            name: true,
            email: true,
            _count: {
                select: {
                    posts: true,
                    reactions: true,
                    eventRsvps: true,
                    mentorSessionsAsMentor: true,
                    mentorSessionsAsMentee: true,
                },
            },
        },
    });
    return users.map((u) => ({
        member: u.name ?? u.email,
        email: u.email,
        posts: u._count.posts,
        reactions: u._count.reactions,
        eventsAttended: u._count.eventRsvps,
        mentoringSessions: u._count.mentorSessionsAsMentor + u._count.mentorSessionsAsMentee,
    }));
}
