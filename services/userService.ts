import { prisma } from "@novr/db";
import type { MemberType, UserRole, UserStatus } from "@novr/types";
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
  createdAt: true,
} as const;

export interface ListUsersParams {
  role?: UserRole;
  memberType?: MemberType;
  status?: UserStatus;
  search?: string;
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
  password?: string;
}

export async function createUser(input: CreateUserInput) {
  const passwordHash = input.password ? await bcrypt.hash(input.password, 10) : undefined;
  const user = await prisma.user.create({
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
  await autoJoinGeneral(user.id);
  return user;
}

export interface UpdateUserInput {
  name?: string;
  role?: UserRole;
  memberType?: MemberType;
  status?: UserStatus;
  managerId?: string | null;
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
