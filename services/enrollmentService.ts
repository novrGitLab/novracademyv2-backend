import { prisma } from "@novr/db";
import { EnrollmentSource, EnrollmentStatus } from "@novr/types";
import { NotFoundError } from "../lib/errors";
import { enqueueEnrollmentConfirmedEmail, enqueueExpiryWarnings } from "../queues/emailQueue";

function computeExpiresAt(validityDays: number | null | undefined): Date | null {
  if (!validityDays) return null;
  return new Date(Date.now() + validityDays * 24 * 60 * 60 * 1000);
}

async function hasActiveEnrollment(userId: string, courseId: string) {
  const existing = await prisma.enrollment.findFirst({
    where: {
      userId,
      courseId,
      status: EnrollmentStatus.ACTIVE,
      OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
    },
  });
  return Boolean(existing);
}

/** Called from a payment webhook once the provider confirms success. */
export async function activateEnrollmentFromPayment(paymentId: string) {
  const payment = await prisma.payment.findUnique({ where: { id: paymentId } });
  if (!payment || !payment.courseId) throw new NotFoundError("Payment not found");

  const existingEnrollment = await prisma.enrollment.findUnique({ where: { paymentId } });
  if (existingEnrollment) return existingEnrollment; // webhook delivered twice — idempotent

  const course = await prisma.course.findUniqueOrThrow({ where: { id: payment.courseId } });

  const enrollment = await prisma.enrollment.create({
    data: {
      userId: payment.userId,
      courseId: payment.courseId,
      source: EnrollmentSource.SELF_PAID,
      status: EnrollmentStatus.ACTIVE,
      expiresAt: computeExpiresAt(course.defaultValidityDays),
      paymentId: payment.id,
    },
  });

  await enqueueEnrollmentConfirmedEmail(enrollment.id);
  enqueueExpiryWarnings(enrollment.id, enrollment.expiresAt);

  return enrollment;
}

/** Free courses skip payment entirely — self-enroll is immediate. */
export async function selfEnrollFree(userId: string, courseId: string) {
  const course = await prisma.course.findUniqueOrThrow({ where: { id: courseId } });
  if (course.priceCents > 0) throw new Error("Course is not free");

  if (await hasActiveEnrollment(userId, courseId)) {
    throw new Error("Already enrolled in this course");
  }

  const enrollment = await prisma.enrollment.create({
    data: {
      userId,
      courseId,
      source: EnrollmentSource.SELF_PAID,
      status: EnrollmentStatus.ACTIVE,
      expiresAt: computeExpiresAt(course.defaultValidityDays),
    },
  });

  await enqueueEnrollmentConfirmedEmail(enrollment.id);
  enqueueExpiryWarnings(enrollment.id, enrollment.expiresAt);

  return enrollment;
}

export interface AssignEnrollmentInput {
  courseId: string;
  userId: string;
  assignedById: string;
  source?: typeof EnrollmentSource.ADMIN_ASSIGNED | typeof EnrollmentSource.BULK | typeof EnrollmentSource.COHORT;
  cohortId?: string;
  validityDays?: number;
}

export async function assignEnrollment(input: AssignEnrollmentInput) {
  if (await hasActiveEnrollment(input.userId, input.courseId)) {
    return { skipped: true as const, userId: input.userId };
  }

  const course = await prisma.course.findUniqueOrThrow({ where: { id: input.courseId } });
  const enrollment = await prisma.enrollment.create({
    data: {
      userId: input.userId,
      courseId: input.courseId,
      source: input.source ?? EnrollmentSource.ADMIN_ASSIGNED,
      status: EnrollmentStatus.ACTIVE,
      assignedById: input.assignedById,
      cohortId: input.cohortId,
      expiresAt: computeExpiresAt(input.validityDays ?? course.defaultValidityDays),
    },
  });

  await enqueueEnrollmentConfirmedEmail(enrollment.id);
  enqueueExpiryWarnings(enrollment.id, enrollment.expiresAt);

  return { skipped: false as const, enrollment };
}

export interface BulkAssignInput {
  courseId: string;
  assignedById: string;
  userIds?: string[];
  emails?: string[];
  validityDays?: number;
}

export async function bulkAssignEnrollments(input: BulkAssignInput) {
  let userIds = input.userIds ?? [];

  if (input.emails?.length) {
    const users = await prisma.user.findMany({
      where: { email: { in: input.emails } },
      select: { id: true, email: true },
    });
    userIds = [...userIds, ...users.map((u) => u.id)];
  }
  userIds = [...new Set(userIds)];

  const results = await Promise.all(
    userIds.map((userId) =>
      assignEnrollment({
        courseId: input.courseId,
        userId,
        assignedById: input.assignedById,
        source: EnrollmentSource.BULK,
        validityDays: input.validityDays,
      })
    )
  );

  return {
    enrolled: results.filter((r) => !r.skipped).length,
    alreadyEnrolled: results.filter((r) => r.skipped).length,
    requested: userIds.length,
  };
}

export async function cohortEnroll(params: {
  courseId: string;
  cohortId: string;
  assignedById: string;
  validityDays?: number;
}) {
  const members = await prisma.userCohort.findMany({
    where: { cohortId: params.cohortId },
    select: { userId: true },
  });

  const results = await Promise.all(
    members.map((m) =>
      assignEnrollment({
        courseId: params.courseId,
        userId: m.userId,
        assignedById: params.assignedById,
        source: EnrollmentSource.COHORT,
        cohortId: params.cohortId,
        validityDays: params.validityDays,
      })
    )
  );

  return {
    enrolled: results.filter((r) => !r.skipped).length,
    alreadyEnrolled: results.filter((r) => r.skipped).length,
    requested: members.length,
  };
}

export async function listCourseEnrollments(courseId: string) {
  return prisma.enrollment.findMany({
    where: { courseId },
    orderBy: { enrolledAt: "desc" },
    include: {
      user: { select: { id: true, name: true, email: true } },
      payment: { select: { status: true, amountCents: true, currency: true, provider: true } },
    },
  });
}
