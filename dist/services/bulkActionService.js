"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.bulkUnenroll = bulkUnenroll;
exports.bulkSetUserStatus = bulkSetUserStatus;
exports.bulkAssignCohort = bulkAssignCohort;
exports.bulkExtendValidity = bulkExtendValidity;
exports.bulkAwardXp = bulkAwardXp;
exports.bulkAwardBadge = bulkAwardBadge;
exports.bulkArchiveCourses = bulkArchiveCourses;
exports.getUsersForExport = getUsersForExport;
const db_1 = require("@novr/db");
const types_1 = require("@novr/types");
const groupService_1 = require("./groupService");
async function bulkUnenroll(enrollmentIds) {
    const result = await db_1.prisma.enrollment.updateMany({
        where: { id: { in: enrollmentIds } },
        data: { status: types_1.EnrollmentStatus.CANCELLED },
    });
    return result.count;
}
async function bulkSetUserStatus(userIds, status) {
    const result = await db_1.prisma.user.updateMany({ where: { id: { in: userIds } }, data: { status } });
    return result.count;
}
async function bulkAssignCohort(userIds, cohortId) {
    await db_1.prisma.userCohort.createMany({
        data: userIds.map((userId) => ({ userId, cohortId })),
        skipDuplicates: true,
    });
    await Promise.all(userIds.map((userId) => (0, groupService_1.autoJoinCohortGroup)(userId, cohortId)));
    return userIds.length;
}
/** Extends from the current expiry if it's in the future, otherwise from now — so extending an already-expired enrollment doesn't backdate. */
async function bulkExtendValidity(enrollmentIds, additionalDays) {
    const enrollments = await db_1.prisma.enrollment.findMany({ where: { id: { in: enrollmentIds } } });
    const now = new Date();
    await Promise.all(enrollments.map((e) => {
        const base = e.expiresAt && e.expiresAt > now ? e.expiresAt : now;
        const newExpiresAt = new Date(base.getTime() + additionalDays * 24 * 60 * 60 * 1000);
        return db_1.prisma.enrollment.update({ where: { id: e.id }, data: { expiresAt: newExpiresAt } });
    }));
    return enrollments.length;
}
async function bulkAwardXp(userIds, xpAmount) {
    const result = await db_1.prisma.user.updateMany({ where: { id: { in: userIds } }, data: { xp: { increment: xpAmount } } });
    return result.count;
}
async function bulkAwardBadge(userIds, badgeId) {
    await db_1.prisma.userBadge.createMany({
        data: userIds.map((userId) => ({ userId, badgeId })),
        skipDuplicates: true,
    });
    return userIds.length;
}
async function bulkArchiveCourses(courseIds) {
    const result = await db_1.prisma.course.updateMany({ where: { id: { in: courseIds } }, data: { status: "ARCHIVED" } });
    return result.count;
}
async function getUsersForExport(userIds) {
    return db_1.prisma.user.findMany({
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
