import { prisma } from "@novr/db";
import { MemberType, UserRole, UserStatus } from "@novr/types";
import bcrypt from "bcryptjs";
import { autoJoinGeneral } from "./groupService";

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
  lastLoginAt: true,
  createdAt: true,
  organization: { select: { id: true, name: true } },
} as const;

/** List of organizations, for the super-admin tenant filter. */
export async function listOrganizations() {
  return prisma.organization.findMany({
    orderBy: { name: "asc" },
    select: { id: true, name: true },
  });
}

export interface ListUsersParams {
  role?: UserRole;
  memberType?: MemberType;
  status?: UserStatus;
  search?: string;
  organizationId?: string | null;
  page?: number;
  pageSize?: number;
}

export async function listUsers(params: ListUsersParams) {
  const page = Math.max(1, params.page ?? 1);
  const pageSize = Math.min(100, Math.max(1, params.pageSize ?? 20));

  const where = {
    role: params.role,
    memberType: params.memberType,
    status: params.status,
    ...(params.organizationId !== undefined && { organizationId: params.organizationId }),
    ...(params.search
      ? {
          OR: [
            { name: { contains: params.search, mode: "insensitive" as const } },
            { email: { contains: params.search, mode: "insensitive" as const } },
          ],
        }
      : {}),
  };

  const [users, total] = await Promise.all([
    prisma.user.findMany({
      where,
      select: listSelect,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.user.count({ where }),
  ]);

  return { users, total, page, pageSize };
}

/**
 * Exact-email lookup available to any authenticated member (not just
 * admins) — needed so anyone can start a DM with anyone else. Deliberately
 * exact-match only (not a partial search) so it can't be used to enumerate
 * the member directory.
 */
export async function lookupUserByEmail(email: string) {
  return prisma.user.findUnique({
    where: { email },
    select: { id: true, name: true, email: true, avatarUrl: true },
  });
}

/**
 * Batch status update for bulk admin actions (suspend/reactivate a selection
 * of users). Guards: never change the caller's own status, and never suspend
 * or change the last remaining SUPER_ADMIN.
 */
export async function bulkUpdateUserStatus(
  userIds: string[],
  status: UserStatus,
  actor: { id: string; role: UserRole }
) {
  const ids = [...new Set(userIds)].filter((id) => id !== actor.id);
  if (ids.length === 0) return { updated: 0 };

  const targets = await prisma.user.findMany({
    where: { id: { in: ids } },
    select: { id: true, role: true, status: true },
  });
  const targetIds = targets.map((t) => t.id);

  // Safety: if we'd suspend/demote a SUPER_ADMIN, refuse unless the actor is
  // also a SUPER_ADMIN and there would still be >= 1 active super admin.
  const superAdmins = await prisma.user.count({ where: { role: UserRole.SUPER_ADMIN, status: UserStatus.ACTIVE } });
  const superTargets = targets.filter((t) => t.role === UserRole.SUPER_ADMIN);
  const wouldDisableLastSuper =
    actor.role !== UserRole.SUPER_ADMIN ||
    (superTargets.length > 0 && status !== UserStatus.ACTIVE && superAdmins - superTargets.length < 1);

  if (wouldDisableLastSuper) {
    throw new Error("Cannot suspend or disable the last active super admin");
  }

  await prisma.user.updateMany({ where: { id: { in: targetIds } }, data: { status } });
  return { updated: targetIds.length };
}

export async function getUserById(id: string) {
  return prisma.user.findUnique({
    where: { id },
    include: {
      alumniRecord: true,
      mentorProfile: true,
      cohorts: { include: { cohort: true } },
      userBadges: { include: { badge: true } },
    },
  });
}

export interface CreateUserInput {
  email: string;
  name?: string;
  role?: UserRole;
  memberType?: MemberType;
  managerId?: string;
  organizationId?: string;
  password?: string;
  mustChangePassword?: boolean;
}

export async function createUser(input: CreateUserInput) {
  // Check if user already exists
  const existing = await prisma.user.findUnique({ where: { email: input.email } });
  if (existing) {
    throw new Error("An account with that email already exists");
  }

  const passwordHash = input.password ? await bcrypt.hash(input.password, 10) : undefined;
  const user = await prisma.user.create({
    data: {
      email: input.email,
      name: input.name,
      role: input.role,
      memberType: input.memberType,
      managerId: input.managerId,
      organizationId: input.organizationId,
      mustChangePassword: input.mustChangePassword ?? false,
      ...(passwordHash && { passwordHash }),
    },
    select: listSelect,
  });
  await autoJoinGeneral(user.id);
  return user;
}

export interface UpdateUserInput {
  name?: string;
  role?: UserRole;
  memberType?: MemberType;
  status?: UserStatus;
  managerId?: string;
  bio?: string;
  location?: string;
  openToWork?: boolean;
}

export async function updateUser(id: string, input: UpdateUserInput) {
  return prisma.user.update({
    where: { id },
    data: input,
    select: listSelect,
  });
}

export async function deleteUser(id: string) {
  await prisma.user.delete({ where: { id } });
}
