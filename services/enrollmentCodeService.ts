import crypto from "crypto";
import { prisma } from "@novr/db";
import { DiscountType, EnrollmentSource, EnrollmentStatus } from "@novr/types";
import { ApiError, NotFoundError } from "../lib/errors";
import { enqueueEnrollmentConfirmedEmail, enqueueExpiryWarnings } from "../queues/emailQueue";
import { computeExpiresAt } from "./enrollmentService";

const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no 0/O/1/I — avoids ambiguous codes

function randomSegment(length: number): string {
  return Array.from({ length }, () => CODE_ALPHABET[crypto.randomInt(CODE_ALPHABET.length)]).join("");
}

async function generateUniqueCode(): Promise<string> {
  for (let attempt = 0; attempt < 10; attempt++) {
    const candidate = `NOVR-${randomSegment(4)}-${randomSegment(4)}`;
    const existing = await prisma.enrollmentCode.findUnique({ where: { code: candidate } });
    if (!existing) return candidate;
  }
  throw new ApiError(500, "Could not generate a unique enrollment code");
}

export interface CreateEnrollmentCodeInput {
  code?: string;
  courseId: string;
  discountType?: (typeof DiscountType)[keyof typeof DiscountType];
  discountValue?: number;
  maxUses?: number;
  expiresAt?: Date;
  createdById: string;
}

export async function createCode(input: CreateEnrollmentCodeInput) {
  const course = await prisma.course.findUnique({ where: { id: input.courseId } });
  if (!course) throw new NotFoundError("Course not found");

  const code = input.code ? input.code.toUpperCase() : await generateUniqueCode();
  if (input.code) {
    const existing = await prisma.enrollmentCode.findUnique({ where: { code } });
    if (existing) throw new ApiError(409, "This code is already in use");
  }

  return prisma.enrollmentCode.create({
    data: {
      code,
      courseId: input.courseId,
      discountType: input.discountType ?? DiscountType.FREE,
      discountValue: input.discountValue ?? 0,
      maxUses: input.maxUses ?? 1,
      expiresAt: input.expiresAt,
      createdById: input.createdById,
    },
  });
}

export async function listCodes() {
  return prisma.enrollmentCode.findMany({
    orderBy: { createdAt: "desc" },
    include: { course: { select: { id: true, title: true } } },
  });
}

export async function listCodesForCourse(courseId: string) {
  return prisma.enrollmentCode.findMany({
    where: { courseId },
    orderBy: { createdAt: "desc" },
  });
}

export async function deactivateCode(id: string) {
  return prisma.enrollmentCode.update({ where: { id }, data: { isActive: false } });
}

async function validateCode(codeStr: string) {
  const code = await prisma.enrollmentCode.findUnique({
    where: { code: codeStr.toUpperCase() },
    include: { course: true },
  });
  if (!code) throw new ApiError(404, "Invalid enrollment code");
  if (!code.isActive) throw new ApiError(400, "This code has been deactivated");
  if (code.expiresAt && code.expiresAt < new Date()) throw new ApiError(400, "This code has expired");
  if (code.usedCount >= code.maxUses) throw new ApiError(400, "This code has reached its usage limit");
  return code;
}

function applyDiscount(priceCents: number, type: (typeof DiscountType)[keyof typeof DiscountType], value: number) {
  if (type === DiscountType.FREE) return 0;
  if (type === DiscountType.PERCENTAGE) return Math.max(0, Math.round(priceCents * (1 - value / 100)));
  if (type === DiscountType.FIXED_AMOUNT) return Math.max(0, priceCents - value);
  return priceCents;
}

/**
 * Learner redeems a code. FREE codes enroll immediately and consume a use
 * right away. PERCENTAGE/FIXED_AMOUNT codes don't consume a use here — the
 * discounted price is handed back for the normal checkout flow, and the use
 * is consumed when that checkout is actually created (see routes/enrollments
 * checkout handler), so an abandoned discounted checkout doesn't burn a use.
 */
export async function redeemCode(userId: string, codeStr: string) {
  const code = await validateCode(codeStr);
  const finalPriceCents = applyDiscount(code.course.priceCents, code.discountType, code.discountValue);

  if (code.discountType === DiscountType.FREE) {
    const existing = await prisma.enrollment.findFirst({
      where: { userId, courseId: code.courseId, status: EnrollmentStatus.ACTIVE },
    });
    if (existing) throw new ApiError(409, "You're already enrolled in this course");

    const [enrollment] = await prisma.$transaction([
      prisma.enrollment.create({
        data: {
          userId,
          courseId: code.courseId,
          source: EnrollmentSource.CODE,
          status: EnrollmentStatus.ACTIVE,
          expiresAt: computeExpiresAt(code.course.defaultValidityDays),
        },
      }),
      prisma.enrollmentCode.update({ where: { id: code.id }, data: { usedCount: { increment: 1 } } }),
    ]);

    await enqueueEnrollmentConfirmedEmail(enrollment.id);
    enqueueExpiryWarnings(enrollment.id, enrollment.expiresAt);

    return { enrolled: true as const, courseId: code.courseId, enrollment };
  }

  return {
    enrolled: false as const,
    courseId: code.courseId,
    codeId: code.id,
    discountType: code.discountType,
    discountValue: code.discountValue,
    originalPriceCents: code.course.priceCents,
    finalPriceCents,
  };
}

/** Called from the checkout route once a discounted checkout is actually created. */
export async function consumeCodeUse(codeId: string) {
  await prisma.enrollmentCode.update({ where: { id: codeId }, data: { usedCount: { increment: 1 } } });
}

export async function getActiveCodeById(codeId: string) {
  const code = await prisma.enrollmentCode.findUnique({ where: { id: codeId }, include: { course: true } });
  if (!code || !code.isActive) return null;
  if (code.expiresAt && code.expiresAt < new Date()) return null;
  if (code.usedCount >= code.maxUses) return null;
  return code;
}

export { applyDiscount };
