"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.listUsers = listUsers;
exports.lookupUserByEmail = lookupUserByEmail;
exports.getUserById = getUserById;
exports.createUser = createUser;
exports.updateUser = updateUser;
exports.deleteUser = deleteUser;
const db_1 = require("@novr/db");
const bcryptjs_1 = __importDefault(require("bcryptjs"));
const groupService_1 = require("./groupService");
const listSelect = {
    id: true,
    email: true,
    name: true,
    avatarUrl: true,
    role: true,
    memberType: true,
    status: true,
    xp: true,
    reputationLevel: true,
    createdAt: true,
};
async function listUsers(params) {
    const page = Math.max(1, params.page ?? 1);
    const pageSize = Math.min(100, Math.max(1, params.pageSize ?? 20));
    const where = {
        role: params.role,
        memberType: params.memberType,
        status: params.status,
        ...(params.search
            ? {
                OR: [
                    { name: { contains: params.search, mode: "insensitive" } },
                    { email: { contains: params.search, mode: "insensitive" } },
                ],
            }
            : {}),
    };
    const [users, total] = await Promise.all([
        db_1.prisma.user.findMany({
            where,
            select: listSelect,
            orderBy: { createdAt: "desc" },
            skip: (page - 1) * pageSize,
            take: pageSize,
        }),
        db_1.prisma.user.count({ where }),
    ]);
    return { users, total, page, pageSize };
}
/**
 * Exact-email lookup available to any authenticated member (not just
 * admins) — needed so anyone can start a DM with anyone else. Deliberately
 * exact-match only (not a partial search) so it can't be used to enumerate
 * the member directory.
 */
async function lookupUserByEmail(email) {
    return db_1.prisma.user.findUnique({
        where: { email },
        select: { id: true, name: true, email: true, avatarUrl: true },
    });
}
async function getUserById(id) {
    return db_1.prisma.user.findUnique({
        where: { id },
        include: {
            alumniRecord: true,
            mentorProfile: true,
            cohorts: { include: { cohort: true } },
            userBadges: { include: { badge: true } },
        },
    });
}
async function createUser(input) {
    const passwordHash = input.password ? await bcryptjs_1.default.hash(input.password, 10) : undefined;
    const user = await db_1.prisma.user.create({
        data: {
            email: input.email,
            name: input.name,
            role: input.role,
            memberType: input.memberType,
            managerId: input.managerId,
            ...(passwordHash && { passwordHash }),
        },
        select: listSelect,
    });
    await (0, groupService_1.autoJoinGeneral)(user.id);
    return user;
}
async function updateUser(id, input) {
    return db_1.prisma.user.update({
        where: { id },
        data: input,
        select: listSelect,
    });
}
async function deleteUser(id) {
    await db_1.prisma.user.delete({ where: { id } });
}
