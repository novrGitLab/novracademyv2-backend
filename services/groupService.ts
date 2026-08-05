import { prisma } from "@novr/db";
import { GroupType } from "@novr/types";

function slugify(name: string) {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

async function uniqueSlug(name: string, excludeId?: string): Promise<string> {
  const base = slugify(name) || "group";
  let slug = base;
  let suffix = 1;
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const existing = await prisma.communityGroup.findUnique({ where: { slug } });
    if (!existing || existing.id === excludeId) return slug;
    suffix += 1;
    slug = `${base}-${suffix}`;
  }
}

/** Every member is auto-joined to this single, platform-wide channel. */
export async function ensureGeneralGroup() {
  const existing = await prisma.communityGroup.findFirst({ where: { type: GroupType.GENERAL } });
  if (existing) return existing;
  return prisma.communityGroup.create({ data: { name: "General", slug: "general", type: GroupType.GENERAL } });
}

export async function joinGroup(userId: string, groupId: string) {
  return prisma.groupMember.upsert({
    where: { userId_groupId: { userId, groupId } },
    create: { userId, groupId },
    update: {},
  });
}

export async function autoJoinGeneral(userId: string) {
  const general = await ensureGeneralGroup();
  return joinGroup(userId, general.id);
}

/** Cohort channels are created alongside the cohort itself, ready before anyone's joined yet. */
export async function ensureCohortGroup(cohortId: string, cohortName: string) {
  const existing = await prisma.communityGroup.findFirst({ where: { cohortId } });
  if (existing) return existing;
  const slug = await uniqueSlug(cohortName);
  return prisma.communityGroup.create({
    data: { name: cohortName, slug, type: GroupType.COHORT, cohortId },
  });
}

export async function autoJoinCohortGroup(userId: string, cohortId: string) {
  const cohort = await prisma.cohort.findUnique({ where: { id: cohortId } });
  if (!cohort) return;
  const group = await ensureCohortGroup(cohortId, cohort.name);
  await joinGroup(userId, group.id);
}

export async function leaveGroup(userId: string, groupId: string) {
  await prisma.groupMember.deleteMany({ where: { userId, groupId } });
}

export interface ListGroupsParams {
  type?: GroupType;
  viewerId: string;
  includeArchived?: boolean;
}

export async function listGroups(params: ListGroupsParams) {
  const groups = await prisma.communityGroup.findMany({
    where: { type: params.type, isArchived: params.includeArchived ? undefined : false },
    orderBy: [{ isPinned: "desc" }, { name: "asc" }],
    include: { _count: { select: { members: true } } },
  });

  const memberships = await prisma.groupMember.findMany({
    where: { userId: params.viewerId, groupId: { in: groups.map((g) => g.id) } },
    select: { groupId: true },
  });
  const joinedIds = new Set(memberships.map((m) => m.groupId));

  return groups.map((g) => ({ ...g, isMember: joinedIds.has(g.id) }));
}

export async function getGroupById(id: string) {
  return prisma.communityGroup.findUnique({
    where: { id },
    include: {
      _count: { select: { members: true } },
      members: { take: 50, include: { user: { select: { id: true, name: true, email: true, avatarUrl: true } } } },
    },
  });
}

export interface CreateGroupInput {
  name: string;
  description?: string;
  type: GroupType;
  courseId?: string;
  cohortId?: string;
}

export async function createGroup(input: CreateGroupInput) {
  const slug = await uniqueSlug(input.name);
  return prisma.communityGroup.create({ data: { ...input, slug } });
}

export interface UpdateGroupInput {
  name?: string;
  description?: string;
  isArchived?: boolean;
  isPinned?: boolean;
}

export async function updateGroup(id: string, input: UpdateGroupInput) {
  const data: UpdateGroupInput & { slug?: string } = { ...input };
  if (input.name) data.slug = await uniqueSlug(input.name, id);
  return prisma.communityGroup.update({ where: { id }, data });
}

export async function deleteGroup(id: string) {
  await prisma.communityGroup.delete({ where: { id } });
}

export async function getUserGroupIds(userId: string) {
  const memberships = await prisma.groupMember.findMany({ where: { userId }, select: { groupId: true } });
  return memberships.map((m) => m.groupId);
}
