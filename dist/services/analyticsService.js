"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getOverviewMetrics = getOverviewMetrics;
exports.getCourseHealth = getCourseHealth;
exports.getDropOffAnalysis = getDropOffAnalysis;
exports.getCohortPerformance = getCohortPerformance;
exports.getEnrollmentValidityDashboard = getEnrollmentValidityDashboard;
exports.getCommunityAnalytics = getCommunityAnalytics;
exports.getRevenueSummary = getRevenueSummary;
const db_1 = require("@novr/db");
const types_1 = require("@novr/types");
const DAY_MS = 24 * 60 * 60 * 1000;
// ---------------------------------------------------------------------
// 24. Overview home
// ---------------------------------------------------------------------
async function getOverviewMetrics() {
    const now = new Date();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const startOfWeek = new Date(startOfToday.getTime() - 7 * DAY_MS);
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const startOfLastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const in30Days = new Date(now.getTime() + 30 * DAY_MS);
    const last24h = new Date(now.getTime() - DAY_MS);
    const [membersByType, enrollmentsToday, enrollmentsWeek, enrollmentsMonth, revenueThisMonth, revenueLastMonth, postsLast24h, messagesLast24h, rsvpsLast24h, expiringEnrollments,] = await Promise.all([
        db_1.prisma.user.groupBy({ by: ["memberType"], _count: true }),
        db_1.prisma.enrollment.count({ where: { enrolledAt: { gte: startOfToday } } }),
        db_1.prisma.enrollment.count({ where: { enrolledAt: { gte: startOfWeek } } }),
        db_1.prisma.enrollment.count({ where: { enrolledAt: { gte: startOfMonth } } }),
        db_1.prisma.payment.aggregate({
            where: { status: types_1.PaymentStatus.SUCCEEDED, createdAt: { gte: startOfMonth } },
            _sum: { amountCents: true },
        }),
        db_1.prisma.payment.aggregate({
            where: { status: types_1.PaymentStatus.SUCCEEDED, createdAt: { gte: startOfLastMonth, lt: startOfMonth } },
            _sum: { amountCents: true },
        }),
        db_1.prisma.communityPost.count({ where: { createdAt: { gte: last24h } } }),
        db_1.prisma.message.count({ where: { createdAt: { gte: last24h } } }),
        db_1.prisma.eventRsvp.count({ where: { createdAt: { gte: last24h } } }),
        db_1.prisma.enrollment.count({
            where: { status: types_1.EnrollmentStatus.ACTIVE, expiresAt: { gte: now, lte: in30Days } },
        }),
    ]);
    return {
        membersByType: Object.fromEntries(membersByType.map((g) => [g.memberType, g._count])),
        enrollments: { today: enrollmentsToday, thisWeek: enrollmentsWeek, thisMonth: enrollmentsMonth },
        revenueCents: { thisMonth: revenueThisMonth._sum.amountCents ?? 0, lastMonth: revenueLastMonth._sum.amountCents ?? 0 },
        communityPulse24h: { posts: postsLast24h, messages: messagesLast24h, rsvps: rsvpsLast24h },
        expiringEnrollments30d: expiringEnrollments,
    };
}
// ---------------------------------------------------------------------
// 25. LMS analytics
// ---------------------------------------------------------------------
async function getCourseHealth() {
    const courses = await db_1.prisma.course.findMany({
        where: { status: "PUBLISHED" },
        select: {
            id: true,
            title: true,
            _count: { select: { enrollments: true, certificates: true } },
        },
    });
    return Promise.all(courses.map(async (course) => {
        const [completedCount, avgProgress, quizAttempts] = await Promise.all([
            db_1.prisma.enrollment.count({ where: { courseId: course.id, completedAt: { not: null } } }),
            db_1.prisma.enrollment.aggregate({ where: { courseId: course.id }, _avg: { progressPct: true } }),
            db_1.prisma.quizAttempt.aggregate({
                where: { quiz: { lesson: { courseId: course.id } } },
                _avg: { score: true },
            }),
        ]);
        const completionRate = course._count.enrollments > 0 ? (completedCount / course._count.enrollments) * 100 : 0;
        const health = completionRate >= 60 ? "green" : completionRate >= 30 ? "amber" : "red";
        return {
            courseId: course.id,
            title: course.title,
            enrollments: course._count.enrollments,
            certificatesIssued: course._count.certificates,
            completionRatePct: completionRate,
            avgProgressPct: avgProgress._avg.progressPct ?? 0,
            avgQuizScorePct: quizAttempts._avg.score ?? null,
            health,
        };
    }));
}
/** Which lesson learners tend to stall on: the furthest-reached incomplete lesson across all active enrollments. */
async function getDropOffAnalysis(courseId) {
    const lessons = await db_1.prisma.lesson.findMany({ where: { courseId }, orderBy: { order: "asc" } });
    const enrollments = await db_1.prisma.enrollment.findMany({
        where: { courseId, status: types_1.EnrollmentStatus.ACTIVE, completedAt: null },
        include: { lessonProgress: true },
    });
    const stallCounts = new Map();
    for (const enrollment of enrollments) {
        const completedLessonIds = new Set(enrollment.lessonProgress.filter((p) => p.completed).map((p) => p.lessonId));
        const firstIncomplete = lessons.find((l) => !completedLessonIds.has(l.id));
        if (firstIncomplete) {
            stallCounts.set(firstIncomplete.id, (stallCounts.get(firstIncomplete.id) ?? 0) + 1);
        }
    }
    return lessons.map((lesson) => ({
        lessonId: lesson.id,
        title: lesson.title,
        order: lesson.order,
        learnersStalledHere: stallCounts.get(lesson.id) ?? 0,
    }));
}
async function getCohortPerformance() {
    const cohorts = await db_1.prisma.cohort.findMany({ include: { members: true } });
    return Promise.all(cohorts.map(async (cohort) => {
        const userIds = cohort.members.map((m) => m.userId);
        if (userIds.length === 0) {
            return { cohortId: cohort.id, name: cohort.name, members: 0, avgProgressPct: 0, certificatesEarned: 0 };
        }
        const [avgProgress, certificates] = await Promise.all([
            db_1.prisma.enrollment.aggregate({ where: { userId: { in: userIds } }, _avg: { progressPct: true } }),
            db_1.prisma.certificate.count({ where: { userId: { in: userIds } } }),
        ]);
        return {
            cohortId: cohort.id,
            name: cohort.name,
            members: userIds.length,
            avgProgressPct: avgProgress._avg.progressPct ?? 0,
            certificatesEarned: certificates,
        };
    }));
}
async function getEnrollmentValidityDashboard() {
    const now = new Date();
    const windows = [7, 30, 60, 90];
    const results = await Promise.all(windows.map((days) => db_1.prisma.enrollment.count({
        where: {
            status: types_1.EnrollmentStatus.ACTIVE,
            expiresAt: { gte: now, lte: new Date(now.getTime() + days * DAY_MS) },
        },
    })));
    return Object.fromEntries(windows.map((days, i) => [`in${days}d`, results[i]]));
}
// ---------------------------------------------------------------------
// 28. Community analytics
// ---------------------------------------------------------------------
async function getCommunityAnalytics() {
    const now = new Date();
    const last24h = new Date(now.getTime() - DAY_MS);
    const last7d = new Date(now.getTime() - 7 * DAY_MS);
    const [dau, wau, topChannels, topContributors, eventStats, jobStats, mentorStats, inactiveUsers] = await Promise.all([
        db_1.prisma.communityPost
            .findMany({ where: { createdAt: { gte: last24h } }, select: { authorId: true }, distinct: ["authorId"] })
            .then((r) => r.length),
        db_1.prisma.communityPost
            .findMany({ where: { createdAt: { gte: last7d } }, select: { authorId: true }, distinct: ["authorId"] })
            .then((r) => r.length),
        db_1.prisma.communityGroup.findMany({
            orderBy: { members: { _count: "desc" } },
            take: 5,
            select: { id: true, name: true, _count: { select: { members: true, posts: true } } },
        }),
        db_1.prisma.communityPost.groupBy({ by: ["authorId"], _count: true, orderBy: { _count: { authorId: "desc" } }, take: 5 }),
        db_1.prisma.event.aggregate({ _count: true }).then(async (totalEvents) => {
            const totalRsvps = await db_1.prisma.eventRsvp.count({ where: { status: "GOING" } });
            return { totalEvents: totalEvents._count, totalRsvps };
        }),
        Promise.all([
            db_1.prisma.jobListing.count(),
            db_1.prisma.jobListing.count({ where: { status: "APPROVED" } }),
        ]).then(([total, approved]) => ({ total, approved })),
        Promise.all([
            db_1.prisma.mentorSession.count({ where: { status: "COMPLETED" } }),
            db_1.prisma.mentorSession.aggregate({ where: { rating: { not: null } }, _avg: { rating: true } }),
        ]).then(([completed, avg]) => ({ completedSessions: completed, avgRating: avg._avg.rating })),
        db_1.prisma.user.count({ where: { posts: { none: {} }, sentMessages: { none: {} } } }),
    ]);
    const contributorUsers = await db_1.prisma.user.findMany({
        where: { id: { in: topContributors.map((c) => c.authorId) } },
        select: { id: true, name: true, email: true },
    });
    const contributorMap = new Map(contributorUsers.map((u) => [u.id, u]));
    return {
        dailyActiveMembers: dau,
        weeklyActiveMembers: wau,
        topChannels,
        topContributors: topContributors.map((c) => ({ user: contributorMap.get(c.authorId), posts: c._count })),
        events: eventStats,
        jobs: jobStats,
        mentoring: mentorStats,
        inactiveMembers: inactiveUsers,
    };
}
// ---------------------------------------------------------------------
// 29. Revenue panel
// ---------------------------------------------------------------------
async function getRevenueSummary() {
    const [byProvider, byStatus, byCourse, transactions] = await Promise.all([
        db_1.prisma.payment.groupBy({ by: ["provider"], where: { status: types_1.PaymentStatus.SUCCEEDED }, _sum: { amountCents: true } }),
        db_1.prisma.payment.groupBy({ by: ["status"], _count: true }),
        db_1.prisma.payment.groupBy({
            by: ["courseId"],
            where: { status: types_1.PaymentStatus.SUCCEEDED, courseId: { not: null } },
            _sum: { amountCents: true },
        }),
        db_1.prisma.payment.findMany({
            orderBy: { createdAt: "desc" },
            take: 50,
            include: { user: { select: { name: true, email: true } }, course: { select: { title: true } } },
        }),
    ]);
    const courseIds = byCourse.map((c) => c.courseId).filter((id) => id !== null);
    const courses = await db_1.prisma.course.findMany({ where: { id: { in: courseIds } }, select: { id: true, title: true } });
    const courseTitleById = new Map(courses.map((c) => [c.id, c.title]));
    return {
        byProvider: Object.fromEntries(byProvider.map((p) => [p.provider, p._sum.amountCents ?? 0])),
        countsByStatus: Object.fromEntries(byStatus.map((s) => [s.status, s._count])),
        byCourse: byCourse.map((c) => ({
            courseId: c.courseId,
            title: c.courseId ? courseTitleById.get(c.courseId) ?? "Unknown" : "Unknown",
            totalCents: c._sum.amountCents ?? 0,
        })),
        recentTransactions: transactions,
    };
}
