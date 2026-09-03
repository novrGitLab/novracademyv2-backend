import { prisma } from "@novr/db";
import { EnrollmentSource, EnrollmentStatus } from "@novr/types";
import { NotFoundError } from "../lib/errors";
import { enqueueEnrollmentConfirmedEmail, enqueueExpiryWarnings } from "../queues/emailQueue";

export function computeExpiresAt(validityDays: number | null | undefined): Date | null {
  if (!validityDays) return null;
  return new Date(Date.now() + validityDays * 24 * 60 * 60 * 1000);
}

/** True when the error is the partial-unique violation on (userId, courseId)
 *  where status = ACTIVE. Callers treat it as "already enrolled". */
function isActiveEnrollmentConflict(err: unknown): boolean {
  if (typeof err === "object" && err !== null && "code" in err) {
    return (err as { code?: string }).code === "P2002";
  }
  return false;
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

  let enrollment;
  try {
    enrollment = await prisma.enrollment.create({
      data: {
        userId: payment.userId,
        courseId: payment.courseId,
        source: EnrollmentSource.SELF_PAID,
        status: EnrollmentStatus.ACTIVE,
        expiresAt: computeExpiresAt(course.defaultValidityDays),
        paymentId: payment.id,
      },
    });
  } catch (err) {
    // An ACTIVE enrollment already exists for this user+course (re-purchase,
    // or a concurrent activation). Return the existing one via the paymentId
    // lookup that follows idempotency semantics.
    if (isActiveEnrollmentConflict(err)) {
      const existing = await prisma.enrollment.findUnique({ where: { paymentId: payment.id } });
      if (existing) return existing;
      // Fall through to the active-enrollment row for this user+course.
      const active = await prisma.enrollment.findFirst({
        where: { userId: payment.userId, courseId: payment.courseId, status: EnrollmentStatus.ACTIVE },
      });
      if (active) return active;
    }
    throw err;
  }

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

  try {
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
  } catch (err) {
    if (isActiveEnrollmentConflict(err)) {
      throw new Error("Already enrolled in this course");
    }
    throw err;
  }
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
  let enrollment;
  try {
    enrollment = await prisma.enrollment.create({
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
  } catch (err) {
    // Concurrent duplicate assign raced past the check above — treat as a skip.
    if (isActiveEnrollmentConflict(err)) {
      return { skipped: true as const, userId: input.userId };
    }
    throw err;
  }

  // Auto-mark course as mandatory compliance for the assigning admin's org
  const assigner = await prisma.user.findUnique({ where: { id: input.assignedById }, select: { organizationId: true } });
  if (assigner?.organizationId) {
    await prisma.complianceAssignment.upsert({
      where: { courseId_organizationId: { courseId: input.courseId, organizationId: assigner.organizationId } },
      create: { courseId: input.courseId, organizationId: assigner.organizationId },
      update: {},
    });
  }

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
  organizationId?: string | null;
}

export async function bulkAssignEnrollments(input: BulkAssignInput) {
  let userIds = input.userIds ?? [];

  if (input.emails?.length) {
    const where: Record<string, unknown> = { email: { in: input.emails } };
    if (input.organizationId) {
      where.organizationId = input.organizationId;
    }
    const users = await prisma.user.findMany({
      where,
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
