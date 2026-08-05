"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ensureGeneralGroup = ensureGeneralGroup;
exports.joinGroup = joinGroup;
exports.autoJoinGeneral = autoJoinGeneral;
exports.ensureCohortGroup = ensureCohortGroup;
exports.autoJoinCohortGroup = autoJoinCohortGroup;
exports.leaveGroup = leaveGroup;
exports.listGroups = listGroups;
exports.getGroupById = getGroupById;
exports.createGroup = createGroup;
exports.updateGroup = updateGroup;
exports.deleteGroup = deleteGroup;
exports.getUserGroupIds = getUserGroupIds;
const db_1 = require("@novr/db");
const types_1 = require("@novr/types");
function slugify(name) {
    return name
        .toLowerCase()
        .trim()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/(^-|-$)/g, "");
}
async function uniqueSlug(name, excludeId) {
    const base = slugify(name) || "group";
    let slug = base;
    let suffix = 1;
    // eslint-disable-next-line no-constant-condition
    while (true) {
        const existing = await db_1.prisma.communityGroup.findUnique({ where: { slug } });
        if (!existing || existing.id === excludeId)
            return slug;
        suffix += 1;
        slug = `${base}-${suffix}`;
    }
}
/** Every member is auto-joined to this single, platform-wide channel. */
async function ensureGeneralGroup() {
    const existing = await db_1.prisma.communityGroup.findFirst({ where: { type: types_1.GroupType.GENERAL } });
    if (existing)
        return existing;
    return db_1.prisma.communityGroup.create({ data: { name: "General", slug: "general", type: types_1.GroupType.GENERAL } });
}
async function joinGroup(userId, groupId) {
    return db_1.prisma.groupMember.upsert({
        where: { userId_groupId: { userId, groupId } },
        create: { userId, groupId },
        update: {},
    });
}
async function autoJoinGeneral(userId) {
    const general = await ensureGeneralGroup();
    return joinGroup(userId, general.id);
}
/** Cohort channels are created alongside the cohort itself, ready before anyone's joined yet. */
async function ensureCohortGroup(cohortId, cohortName) {
    const existing = await db_1.prisma.communityGroup.findFirst({ where: { cohortId } });
    if (existing)
        return existing;
    const slug = await uniqueSlug(cohortName);
    return db_1.prisma.communityGroup.create({
        data: { name: cohortName, slug, type: types_1.GroupType.COHORT, cohortId },
    });
}
async function autoJoinCohortGroup(userId, cohortId) {
    const cohort = await db_1.prisma.cohort.findUnique({ where: { id: cohortId } });
    if (!cohort)
        return;
    const group = await ensureCohortGroup(cohortId, cohort.name);
    await joinGroup(userId, group.id);
}
async function leaveGroup(userId, groupId) {
    await db_1.prisma.groupMember.deleteMany({ where: { userId, groupId } });
}
async function listGroups(params) {
    const groups = await db_1.prisma.communityGroup.findMany({
        where: { type: params.type, isArchived: params.includeArchived ? undefined : false },
        orderBy: [{ isPinned: "desc" }, { name: "asc" }],
        include: { _count: { select: { members: true } } },
    });
    const memberships = await db_1.prisma.groupMember.findMany({
        where: { userId: params.viewerId, groupId: { in: groups.map((g) => g.id) } },
        select: { groupId: true },
    });
    const joinedIds = new Set(memberships.map((m) => m.groupId));
    return groups.map((g) => ({ ...g, isMember: joinedIds.has(g.id) }));
}
async function getGroupById(id) {
    return db_1.prisma.communityGroup.findUnique({
        where: { id },
        include: {
            _count: { select: { members: true } },
            members: { take: 50, include: { user: { select: { id: true, name: true, email: true, avatarUrl: true } } } },
        },
    });
}
async function createGroup(input) {
    const slug = await uniqueSlug(input.name);
    return db_1.prisma.communityGroup.create({ data: { ...input, slug } });
}
async function updateGroup(id, input) {
    const data = { ...input };
    if (input.name)
        data.slug = await uniqueSlug(input.name, id);
    return db_1.prisma.communityGroup.update({ where: { id }, data });
}
async function deleteGroup(id) {
    await db_1.prisma.communityGroup.delete({ where: { id } });
}
async function getUserGroupIds(userId) {
    const memberships = await db_1.prisma.groupMember.findMany({ where: { userId }, select: { groupId: true } });
    return memberships.map((m) => m.groupId);
}
