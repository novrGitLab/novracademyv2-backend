import { prisma } from "@novr/db";
import { EnrollmentStatus, UserStatus } from "@novr/types";
import { autoJoinCohortGroup } from "./groupService";

export async function bulkUnenroll(enrollmentIds: string[]) {
  const result = await prisma.enrollment.updateMany({
    where: { id: { in: enrollmentIds } },
    data: { status: EnrollmentStatus.CANCELLED },
  });
  return result.count;
}

export async function bulkSetUserStatus(userIds: string[], status: UserStatus) {
  const result = await prisma.user.updateMany({ where: { id: { in: userIds } }, data: { status } });
  return result.count;
}

export async function bulkAssignCohort(userIds: string[], cohortId: string) {
  await prisma.userCohort.createMany({
    data: userIds.map((userId) => ({ userId, cohortId })),
    skipDuplicates: true,
  });
  await Promise.all(userIds.map((userId) => autoJoinCohortGroup(userId, cohortId)));
  return userIds.length;
}

/** Extends from the current expiry if it's in the future, otherwise from now — so extending an already-expired enrollment doesn't backdate. */
export async function bulkExtendValidity(enrollmentIds: string[], additionalDays: number) {
  const enrollments = await prisma.enrollment.findMany({ where: { id: { in: enrollmentIds } } });
  const now = new Date();
  await Promise.all(
    enrollments.map((e) => {
      const base = e.expiresAt && e.expiresAt > now ? e.expiresAt : now;
      const newExpiresAt = new Date(base.getTime() + additionalDays * 24 * 60 * 60 * 1000);
      return prisma.enrollment.update({ where: { id: e.id }, data: { expiresAt: newExpiresAt } });
    })
  );
  return enrollments.length;
}

export async function bulkAwardXp(userIds: string[], xpAmount: number) {
  const result = await prisma.user.updateMany({ where: { id: { in: userIds } }, data: { xp: { increment: xpAmount } } });
  return result.count;
}

export async function bulkAwardBadge(userIds: string[], badgeId: string) {
  await prisma.userBadge.createMany({
    data: userIds.map((userId) => ({ userId, badgeId })),
    skipDuplicates: true,
  });
  return userIds.length;
}

export async function bulkArchiveCourses(courseIds: string[]) {
  const result = await prisma.course.updateMany({ where: { id: { in: courseIds } }, data: { status: "ARCHIVED" } });
  return result.count;
}

export async function getUsersForExport(userIds?: string[]) {
  return prisma.user.findMany({
    where: userIds ? { id: { in: userIds } } : undefined,
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      memberType: true,
      status: true,
      xp: true,
      reputationLevel: true,
      createdAt: true,
    },
  });
}
