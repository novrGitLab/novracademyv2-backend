import { prisma } from "@novr/db";
import { AssessmentScope, AssessmentType, QuestionType, UserRole } from "@novr/types";
import type { AuthUser } from "@novr/types";
import { ApiError, NotFoundError } from "../lib/errors";

const PASS_MARK_PCT = 70;

function isAnswerCorrect(type: string, correctAnswer: unknown, submitted: unknown): boolean {
  switch (type) {
    case QuestionType.MULTIPLE_CHOICE:
      return typeof submitted === "number" && Number(submitted) === Number(correctAnswer);
    case QuestionType.TRUE_FALSE:
      return typeof submitted === "boolean" && submitted === correctAnswer;
    case QuestionType.SHORT_ANSWER:
      return (
        typeof submitted === "string" &&
        submitted.trim().toLowerCase() === String(correctAnswer ?? "").trim().toLowerCase()
      );
    default:
      return false;
  }
}

/** Assessments an admin is allowed to manage — ORG_ADMIN never sees UNIVERSAL ones, even their own org's monthly. */
export async function listAssessmentsForAdmin(user: AuthUser) {
  if (user.role === UserRole.SUPER_ADMIN) {
    return prisma.assessment.findMany({
      orderBy: { createdAt: "desc" },
      include: { _count: { select: { questions: true, attempts: true } } },
    });
  }
  return prisma.assessment.findMany({
    where: { scope: AssessmentScope.ORGANIZATION, organizationId: user.tenantId ?? "__none__" },
    orderBy: { createdAt: "desc" },
    include: { _count: { select: { questions: true, attempts: true } } },
  });
}

export interface CreateAssessmentInput {
  title: string;
  type: (typeof AssessmentType)[keyof typeof AssessmentType];
  scope?: (typeof AssessmentScope)[keyof typeof AssessmentScope];
  organizationId?: string | null;
  scheduledFor?: Date;
  month?: number;
  year?: number;
}

export async function createAssessment(input: CreateAssessmentInput, creator: AuthUser) {
  let scope = input.scope ?? AssessmentScope.UNIVERSAL;
  let organizationId = input.organizationId ?? null;

  if (creator.role === UserRole.ORG_ADMIN) {
    // ORG_ADMIN may only create MONTHLY assessments scoped to their own org.
    if (input.type !== AssessmentType.MONTHLY) {
      throw new ApiError(403, "Only Cybernovr admins can create baseline or closing assessments");
    }
    scope = AssessmentScope.ORGANIZATION;
    organizationId = creator.tenantId;
    if (!organizationId) throw new ApiError(400, "You must belong to an organization to create an assessment");
  } else if (creator.role !== UserRole.SUPER_ADMIN) {
    throw new ApiError(403, "Insufficient permissions");
  }

  if (input.type === AssessmentType.MONTHLY) {
    if (!input.month || !input.year) throw new ApiError(400, "month and year are required for monthly assessments");
    const existing = await prisma.assessment.findFirst({
      where: {
        type: AssessmentType.MONTHLY,
        scope,
        organizationId,
        month: input.month,
        year: input.year,
        isActive: true,
      },
    });
    if (existing) throw new ApiError(409, "A monthly assessment for this period already exists");
  }

  return prisma.assessment.create({
    data: {
      title: input.title,
      type: input.type,
      scope,
      organizationId,
      scheduledFor: input.scheduledFor,
      month: input.month,
      year: input.year,
      createdById: creator.id,
    },
  });
}

export async function getAssessment(id: string) {
  const assessment = await prisma.assessment.findUnique({
    where: { id },
    include: { questions: { orderBy: { order: "asc" } } },
  });
  if (!assessment) throw new NotFoundError("Assessment not found");
  return assessment;
}

export interface CreateQuestionInput {
  prompt: string;
  type: (typeof QuestionType)[keyof typeof QuestionType];
  options?: unknown;
  correctAnswer?: unknown;
  points?: number;
}

export async function addQuestion(assessmentId: string, input: CreateQuestionInput) {
  await getAssessment(assessmentId);
  const maxOrder = await prisma.assessmentQuestion.aggregate({
    where: { assessmentId },
    _max: { order: true },
  });
  return prisma.assessmentQuestion.create({
    data: {
      assessmentId,
      prompt: input.prompt,
      type: input.type,
      options: input.options as never,
      correctAnswer: input.correctAnswer as never,
      points: input.points ?? 1,
      order: (maxOrder._max.order ?? 0) + 1,
    },
  });
}

export interface UpdateQuestionInput {
  prompt?: string;
  type?: (typeof QuestionType)[keyof typeof QuestionType];
  options?: unknown;
  correctAnswer?: unknown;
  points?: number;
  order?: number;
}

export async function updateQuestion(questionId: string, input: UpdateQuestionInput) {
  return prisma.assessmentQuestion.update({
    where: { id: questionId },
    data: {
      prompt: input.prompt,
      type: input.type,
      options: input.options as never,
      correctAnswer: input.correctAnswer as never,
      points: input.points,
      order: input.order,
    },
  });
}

export async function deleteQuestion(questionId: string) {
  await prisma.assessmentQuestion.delete({ where: { id: questionId } });
}

export async function releaseClosing(assessmentId: string, params: { userId?: string; cohortId?: string }) {
  if (!params.userId && !params.cohortId) throw new ApiError(400, "userId or cohortId is required");
  await getAssessment(assessmentId);
  return prisma.assessmentRelease.create({
    data: { assessmentId, userId: params.userId, cohortId: params.cohortId },
  });
}

async function isClosingReleasedForUser(assessmentId: string, user: AuthUser): Promise<boolean> {
  const release = await prisma.assessmentRelease.findFirst({
    where: {
      assessmentId,
      OR: [{ userId: user.id }, { cohort: { members: { some: { userId: user.id } } } }],
    },
  });
  return Boolean(release);
}

export interface SubmitAttemptInput {
  type: (typeof AssessmentType)[keyof typeof AssessmentType];
  answers: Record<string, unknown>;
}

export async function submitAttempt(assessmentId: string, user: AuthUser, input: SubmitAttemptInput) {
  const assessment = await getAssessment(assessmentId);
  if (!assessment.isActive) throw new ApiError(400, "This assessment is not active");

  let attemptType = input.type;
  if (assessment.type === AssessmentType.MONTHLY) {
    attemptType = AssessmentType.MONTHLY;
  } else if (assessment.type === AssessmentType.BASELINE) {
    if (attemptType === AssessmentType.CLOSING) {
      const released = await isClosingReleasedForUser(assessmentId, user);
      if (!released) throw new ApiError(403, "The closing assessment hasn't been released to you yet");
      const baseline = await prisma.assessmentAttempt.findUnique({
        where: { userId_assessmentId_type: { userId: user.id, assessmentId, type: AssessmentType.BASELINE } },
      });
      if (!baseline) throw new ApiError(400, "Complete the baseline assessment first");
    } else {
      attemptType = AssessmentType.BASELINE;
    }
  }

  const existing = await prisma.assessmentAttempt.findUnique({
    where: { userId_assessmentId_type: { userId: user.id, assessmentId, type: attemptType } },
  });
  if (existing) throw new ApiError(409, "You have already completed this assessment");

  let earnedPoints = 0;
  let totalPoints = 0;
  for (const q of assessment.questions) {
    totalPoints += q.points;
    if (isAnswerCorrect(q.type, q.correctAnswer, input.answers[q.id])) earnedPoints += q.points;
  }
  const score = totalPoints > 0 ? Math.round((earnedPoints / totalPoints) * 100) : 0;
  const passed = score >= PASS_MARK_PCT;

  const attempt = await prisma.assessmentAttempt.create({
    data: {
      userId: user.id,
      assessmentId,
      type: attemptType,
      score,
      passed,
      answers: input.answers as never,
    },
  });

  let growthRecord: Awaited<ReturnType<typeof prisma.growthRecord.upsert>> | null = null;
  if (attemptType === AssessmentType.CLOSING) {
    const baseline = await prisma.assessmentAttempt.findUniqueOrThrow({
      where: { userId_assessmentId_type: { userId: user.id, assessmentId, type: AssessmentType.BASELINE } },
    });
    growthRecord = await prisma.growthRecord.upsert({
      where: { userId: user.id },
      create: {
        userId: user.id,
        baselineScore: baseline.score,
        closingScore: attempt.score,
        growthRate: attempt.score - baseline.score,
        baselineAttemptId: baseline.id,
        closingAttemptId: attempt.id,
      },
      update: {
        baselineScore: baseline.score,
        closingScore: attempt.score,
        growthRate: attempt.score - baseline.score,
        baselineAttemptId: baseline.id,
        closingAttemptId: attempt.id,
      },
    });
  }

  return { attempt, growthRecord };
}

/** What the current learner sees on /dashboard/assessments and the first-login gate. */
export async function listAssessmentsForLearner(user: AuthUser) {
  const scopeFilter = user.tenantId
    ? { OR: [{ scope: AssessmentScope.UNIVERSAL }, { scope: AssessmentScope.ORGANIZATION, organizationId: user.tenantId }] }
    : { scope: AssessmentScope.UNIVERSAL };

  const [baselineCandidates, monthlyCandidates, myAttempts, myReleases] = await Promise.all([
    prisma.assessment.findMany({
      where: { type: AssessmentType.BASELINE, isActive: true, ...scopeFilter },
      include: { _count: { select: { questions: true } } },
    }),
    prisma.assessment.findMany({
      where: {
        type: AssessmentType.MONTHLY,
        isActive: true,
        scheduledFor: { lte: new Date() },
        ...scopeFilter,
      },
      include: { _count: { select: { questions: true } } },
    }),
    prisma.assessmentAttempt.findMany({ where: { userId: user.id }, select: { assessmentId: true, type: true } }),
    prisma.assessmentRelease.findMany({
      where: { OR: [{ userId: user.id }, { cohort: { members: { some: { userId: user.id } } } }] },
      select: { assessmentId: true },
    }),
  ]);

  const attemptedKey = (assessmentId: string, type: string) => `${assessmentId}:${type}`;
  const attemptedSet = new Set(myAttempts.map((a) => attemptedKey(a.assessmentId, a.type)));
  const releasedIds = new Set(myReleases.map((r) => r.assessmentId));

  const pendingBaseline =
    baselineCandidates.find((a) => !attemptedSet.has(attemptedKey(a.id, AssessmentType.BASELINE))) ?? null;

  const pendingClosing = baselineCandidates.filter(
    (a) =>
      releasedIds.has(a.id) &&
      attemptedSet.has(attemptedKey(a.id, AssessmentType.BASELINE)) &&
      !attemptedSet.has(attemptedKey(a.id, AssessmentType.CLOSING))
  );

  const dueMonthly = monthlyCandidates.filter((a) => !attemptedSet.has(attemptedKey(a.id, AssessmentType.MONTHLY)));

  const toSummary = (a: (typeof baselineCandidates)[number]) => ({
    id: a.id,
    title: a.title,
    type: a.type,
    questionCount: a._count.questions,
    scheduledFor: a.scheduledFor,
  });

  return {
    pendingBaseline: pendingBaseline ? toSummary(pendingBaseline) : null,
    pendingClosing: pendingClosing.map(toSummary),
    dueMonthly: dueMonthly.map(toSummary),
  };
}

export async function getResults(assessmentId: string, requester: AuthUser) {
  await getAssessment(assessmentId);
  const isAdmin = requester.role === UserRole.SUPER_ADMIN || requester.role === UserRole.ORG_ADMIN;
  return prisma.assessmentAttempt.findMany({
    where: { assessmentId, ...(isAdmin ? {} : { userId: requester.id }) },
    include: isAdmin ? { user: { select: { id: true, name: true, email: true } } } : undefined,
    orderBy: { attemptedAt: "desc" },
  });
}

// Bundles the GrowthRecord with the learner's most recent MONTHLY score —
// both are shown together on /dashboard/profile, so one round trip covers it.
export async function getGrowthForUser(userId: string) {
  const [growthRecord, latestMonthly] = await Promise.all([
    prisma.growthRecord.findUnique({ where: { userId } }),
    prisma.assessmentAttempt.findFirst({
      where: { userId, type: AssessmentType.MONTHLY },
      orderBy: { attemptedAt: "desc" },
      select: { score: true, attemptedAt: true },
    }),
  ]);
  return { growthRecord, latestMonthlyScore: latestMonthly?.score ?? null };
}

export async function getAssessmentAnalytics() {
  const monthlyAttempts = await prisma.assessmentAttempt.findMany({
    where: { type: AssessmentType.MONTHLY },
    include: { assessment: { select: { month: true, year: true } }, user: { select: { id: true, name: true, email: true } } },
  });

  const byMonth = new Map<string, { month: number; year: number; total: number; count: number }>();
  const byUser = new Map<string, { userId: string; name: string; total: number; count: number }>();

  for (const attempt of monthlyAttempts) {
    const { month, year } = attempt.assessment;
    if (month != null && year != null) {
      const key = `${year}-${month}`;
      const bucket = byMonth.get(key) ?? { month, year, total: 0, count: 0 };
      bucket.total += attempt.score;
      bucket.count += 1;
      byMonth.set(key, bucket);
    }

    const userBucket = byUser.get(attempt.userId) ?? {
      userId: attempt.userId,
      name: attempt.user.name ?? attempt.user.email,
      total: 0,
      count: 0,
    };
    userBucket.total += attempt.score;
    userBucket.count += 1;
    byUser.set(attempt.userId, userBucket);
  }

  const monthlyTrend = [...byMonth.values()]
    .map((b) => ({ month: b.month, year: b.year, avgScore: Math.round(b.total / b.count) }))
    .sort((a, b) => a.year - b.year || a.month - b.month);

  const performers = [...byUser.values()]
    .map((u) => ({ userId: u.userId, name: u.name, avgScore: Math.round(u.total / u.count) }))
    .sort((a, b) => b.avgScore - a.avgScore);

  const growthRecords = await prisma.growthRecord.findMany({
    include: { user: { select: { id: true, name: true, email: true } } },
    orderBy: { growthRate: "desc" },
  });

  return {
    monthlyTrend,
    topPerformers: performers.slice(0, 10),
    bottomPerformers: performers.slice(-10).reverse(),
    growthLeaderboard: growthRecords.map((g) => ({
      userId: g.userId,
      name: g.user.name ?? g.user.email,
      baselineScore: g.baselineScore,
      closingScore: g.closingScore,
      growthRate: g.growthRate,
    })),
  };
}
