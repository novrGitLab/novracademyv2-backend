"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.activateEnrollmentFromPayment = activateEnrollmentFromPayment;
exports.selfEnrollFree = selfEnrollFree;
exports.assignEnrollment = assignEnrollment;
exports.bulkAssignEnrollments = bulkAssignEnrollments;
exports.cohortEnroll = cohortEnroll;
exports.listCourseEnrollments = listCourseEnrollments;
const db_1 = require("@novr/db");
const types_1 = require("@novr/types");
const errors_1 = require("../lib/errors");
const emailQueue_1 = require("../queues/emailQueue");
function computeExpiresAt(validityDays) {
    if (!validityDays)
        return null;
    return new Date(Date.now() + validityDays * 24 * 60 * 60 * 1000);
}
async function hasActiveEnrollment(userId, courseId) {
    const existing = await db_1.prisma.enrollment.findFirst({
        where: {
            userId,
            courseId,
            status: types_1.EnrollmentStatus.ACTIVE,
            OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
        },
    });
    return Boolean(existing);
}
/** Called from a payment webhook once the provider confirms success. */
async function activateEnrollmentFromPayment(paymentId) {
    const payment = await db_1.prisma.payment.findUnique({ where: { id: paymentId } });
    if (!payment || !payment.courseId)
        throw new errors_1.NotFoundError("Payment not found");
    const existingEnrollment = await db_1.prisma.enrollment.findUnique({ where: { paymentId } });
    if (existingEnrollment)
        return existingEnrollment; // webhook delivered twice — idempotent
    const course = await db_1.prisma.course.findUniqueOrThrow({ where: { id: payment.courseId } });
    const enrollment = await db_1.prisma.enrollment.create({
        data: {
            userId: payment.userId,
            courseId: payment.courseId,
            source: types_1.EnrollmentSource.SELF_PAID,
            status: types_1.EnrollmentStatus.ACTIVE,
            expiresAt: computeExpiresAt(course.defaultValidityDays),
            paymentId: payment.id,
        },
    });
    await (0, emailQueue_1.enqueueEnrollmentConfirmedEmail)(enrollment.id);
    (0, emailQueue_1.enqueueExpiryWarnings)(enrollment.id, enrollment.expiresAt);
    return enrollment;
}
/** Free courses skip payment entirely — self-enroll is immediate. */
async function selfEnrollFree(userId, courseId) {
    const course = await db_1.prisma.course.findUniqueOrThrow({ where: { id: courseId } });
    if (course.priceCents > 0)
        throw new Error("Course is not free");
    if (await hasActiveEnrollment(userId, courseId)) {
        throw new Error("Already enrolled in this course");
    }
    const enrollment = await db_1.prisma.enrollment.create({
        data: {
            userId,
            courseId,
            source: types_1.EnrollmentSource.SELF_PAID,
            status: types_1.EnrollmentStatus.ACTIVE,
            expiresAt: computeExpiresAt(course.defaultValidityDays),
        },
    });
    await (0, emailQueue_1.enqueueEnrollmentConfirmedEmail)(enrollment.id);
    (0, emailQueue_1.enqueueExpiryWarnings)(enrollment.id, enrollment.expiresAt);
    return enrollment;
}
async function assignEnrollment(input) {
    if (await hasActiveEnrollment(input.userId, input.courseId)) {
        return { skipped: true, userId: input.userId };
    }
    const course = await db_1.prisma.course.findUniqueOrThrow({ where: { id: input.courseId } });
    const enrollment = await db_1.prisma.enrollment.create({
        data: {
            userId: input.userId,
            courseId: input.courseId,
            source: input.source ?? types_1.EnrollmentSource.ADMIN_ASSIGNED,
            status: types_1.EnrollmentStatus.ACTIVE,
            assignedById: input.assignedById,
            cohortId: input.cohortId,
            expiresAt: computeExpiresAt(input.validityDays ?? course.defaultValidityDays),
        },
    });
    await (0, emailQueue_1.enqueueEnrollmentConfirmedEmail)(enrollment.id);
    (0, emailQueue_1.enqueueExpiryWarnings)(enrollment.id, enrollment.expiresAt);
    return { skipped: false, enrollment };
}
async function bulkAssignEnrollments(input) {
    let userIds = input.userIds ?? [];
    if (input.emails?.length) {
        const users = await db_1.prisma.user.findMany({
            where: { email: { in: input.emails } },
            select: { id: true, email: true },
        });
        userIds = [...userIds, ...users.map((u) => u.id)];
    }
    userIds = [...new Set(userIds)];
    const results = await Promise.all(userIds.map((userId) => assignEnrollment({
        courseId: input.courseId,
        userId,
        assignedById: input.assignedById,
        source: types_1.EnrollmentSource.BULK,
        validityDays: input.validityDays,
    })));
    return {
        enrolled: results.filter((r) => !r.skipped).length,
        alreadyEnrolled: results.filter((r) => r.skipped).length,
        requested: userIds.length,
    };
}
async function cohortEnroll(params) {
    const members = await db_1.prisma.userCohort.findMany({
        where: { cohortId: params.cohortId },
        select: { userId: true },
    });
    const results = await Promise.all(members.map((m) => assignEnrollment({
        courseId: params.courseId,
        userId: m.userId,
        assignedById: params.assignedById,
        source: types_1.EnrollmentSource.COHORT,
        cohortId: params.cohortId,
        validityDays: params.validityDays,
    })));
    return {
        enrolled: results.filter((r) => !r.skipped).length,
        alreadyEnrolled: results.filter((r) => r.skipped).length,
        requested: members.length,
    };
}
async function listCourseEnrollments(courseId) {
    return db_1.prisma.enrollment.findMany({
        where: { courseId },
        orderBy: { enrolledAt: "desc" },
        include: {
            user: { select: { id: true, name: true, email: true } },
            payment: { select: { status: true, amountCents: true, currency: true, provider: true } },
        },
    });
}
