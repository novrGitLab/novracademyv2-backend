import { prisma } from "@novr/db";
import { EnrollmentStatus, PaymentStatus } from "@novr/types";

const DAY_MS = 24 * 60 * 60 * 1000;

// ---------------------------------------------------------------------
// 24. Overview home
// ---------------------------------------------------------------------

export async function getOverviewMetrics() {
  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const startOfWeek = new Date(startOfToday.getTime() - 7 * DAY_MS);
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const startOfLastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const in30Days = new Date(now.getTime() + 30 * DAY_MS);
  const last24h = new Date(now.getTime() - DAY_MS);

  const [
    membersByType,
    enrollmentsToday,
    enrollmentsWeek,
    enrollmentsMonth,
    revenueThisMonth,
    revenueLastMonth,
    postsLast24h,
    messagesLast24h,
    rsvpsLast24h,
    expiringEnrollments,
  ] = await Promise.all([
    prisma.user.groupBy({ by: ["memberType"], _count: true }),
    prisma.enrollment.count({ where: { enrolledAt: { gte: startOfToday } } }),
    prisma.enrollment.count({ where: { enrolledAt: { gte: startOfWeek } } }),
    prisma.enrollment.count({ where: { enrolledAt: { gte: startOfMonth } } }),
    prisma.payment.aggregate({
      where: { status: PaymentStatus.SUCCEEDED, createdAt: { gte: startOfMonth } },
      _sum: { amountCents: true },
    }),
    prisma.payment.aggregate({
      where: { status: PaymentStatus.SUCCEEDED, createdAt: { gte: startOfLastMonth, lt: startOfMonth } },
      _sum: { amountCents: true },
    }),
    prisma.communityPost.count({ where: { createdAt: { gte: last24h } } }),
    prisma.message.count({ where: { createdAt: { gte: last24h } } }),
    prisma.eventRsvp.count({ where: { createdAt: { gte: last24h } } }),
    prisma.enrollment.count({
      where: { status: EnrollmentStatus.ACTIVE, expiresAt: { gte: now, lte: in30Days } },
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

export async function getCourseHealth() {
  const courses = await prisma.course.findMany({
    where: { status: "PUBLISHED" },
    select: {
      id: true,
      title: true,
      _count: { select: { enrollments: true, certificates: true } },
    },
  });

  return Promise.all(
    courses.map(async (course) => {
      const [completedCount, avgProgress, quizAttempts] = await Promise.all([
        prisma.enrollment.count({ where: { courseId: course.id, completedAt: { not: null } } }),
        prisma.enrollment.aggregate({ where: { courseId: course.id }, _avg: { progressPct: true } }),
        prisma.quizAttempt.aggregate({
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
    })
  );
}

/** Which lesson learners tend to stall on: the furthest-reached incomplete lesson across all active enrollments. */
export async function getDropOffAnalysis(courseId: string) {
  const lessons = await prisma.lesson.findMany({ where: { courseId }, orderBy: { order: "asc" } });
  const enrollments = await prisma.enrollment.findMany({
    where: { courseId, status: EnrollmentStatus.ACTIVE, completedAt: null },
    include: { lessonProgress: true },
  });

  const stallCounts = new Map<string, number>();
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

export async function getCohortPerformance() {
  const cohorts = await prisma.cohort.findMany({ include: { members: true } });
  return Promise.all(
    cohorts.map(async (cohort) => {
      const userIds = cohort.members.map((m) => m.userId);
      if (userIds.length === 0) {
        return { cohortId: cohort.id, name: cohort.name, members: 0, avgProgressPct: 0, certificatesEarned: 0 };
      }
      const [avgProgress, certificates] = await Promise.all([
        prisma.enrollment.aggregate({ where: { userId: { in: userIds } }, _avg: { progressPct: true } }),
        prisma.certificate.count({ where: { userId: { in: userIds } } }),
      ]);
      return {
        cohortId: cohort.id,
        name: cohort.name,
        members: userIds.length,
        avgProgressPct: avgProgress._avg.progressPct ?? 0,
        certificatesEarned: certificates,
      };
    })
  );
}

export async function getEnrollmentValidityDashboard() {
  const now = new Date();
  const windows = [7, 30, 60, 90];
  const results = await Promise.all(
    windows.map((days) =>
      prisma.enrollment.count({
        where: {
          status: EnrollmentStatus.ACTIVE,
          expiresAt: { gte: now, lte: new Date(now.getTime() + days * DAY_MS) },
        },
      })
    )
  );
  return Object.fromEntries(windows.map((days, i) => [`in${days}d`, results[i]]));
}

// ---------------------------------------------------------------------
// 28. Community analytics
// ---------------------------------------------------------------------

export async function getCommunityAnalytics() {
  const now = new Date();
  const last24h = new Date(now.getTime() - DAY_MS);
  const last7d = new Date(now.getTime() - 7 * DAY_MS);

  const [dau, wau, topChannels, topContributors, eventStats, jobStats, mentorStats, inactiveUsers] = await Promise.all([
    prisma.communityPost
      .findMany({ where: { createdAt: { gte: last24h } }, select: { authorId: true }, distinct: ["authorId"] })
      .then((r) => r.length),
    prisma.communityPost
      .findMany({ where: { createdAt: { gte: last7d } }, select: { authorId: true }, distinct: ["authorId"] })
      .then((r) => r.length),
    prisma.communityGroup.findMany({
      orderBy: { members: { _count: "desc" } },
      take: 5,
      select: { id: true, name: true, _count: { select: { members: true, posts: true } } },
    }),
    prisma.communityPost.groupBy({ by: ["authorId"], _count: true, orderBy: { _count: { authorId: "desc" } }, take: 5 }),
    prisma.event.aggregate({ _count: true }).then(async (totalEvents) => {
      const totalRsvps = await prisma.eventRsvp.count({ where: { status: "GOING" } });
      return { totalEvents: totalEvents._count, totalRsvps };
    }),
    Promise.all([
      prisma.jobListing.count(),
      prisma.jobListing.count({ where: { status: "APPROVED" } }),
    ]).then(([total, approved]) => ({ total, approved })),
    Promise.all([
      prisma.mentorSession.count({ where: { status: "COMPLETED" } }),
      prisma.mentorSession.aggregate({ where: { rating: { not: null } }, _avg: { rating: true } }),
    ]).then(([completed, avg]) => ({ completedSessions: completed, avgRating: avg._avg.rating })),
    prisma.user.count({ where: { posts: { none: {} }, sentMessages: { none: {} } } }),
  ]);

  const contributorUsers = await prisma.user.findMany({
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

export async function getRevenueSummary() {
  const [byProvider, byStatus, byCourse, transactions] = await Promise.all([
    prisma.payment.groupBy({ by: ["provider"], where: { status: PaymentStatus.SUCCEEDED }, _sum: { amountCents: true } }),
    prisma.payment.groupBy({ by: ["status"], _count: true }),
    prisma.payment.groupBy({
      by: ["courseId"],
      where: { status: PaymentStatus.SUCCEEDED, courseId: { not: null } },
      _sum: { amountCents: true },
    }),
    prisma.payment.findMany({
      orderBy: { createdAt: "desc" },
      take: 50,
      include: { user: { select: { name: true, email: true } }, course: { select: { title: true } } },
    }),
  ]);

  const courseIds = byCourse.map((c) => c.courseId).filter((id): id is string => id !== null);
  const courses = await prisma.course.findMany({ where: { id: { in: courseIds } }, select: { id: true, title: true } });
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
