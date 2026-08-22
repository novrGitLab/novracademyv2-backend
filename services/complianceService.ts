import { prisma } from "@novr/db";
import type { UserRole } from "@novr/types";
import { NotFoundError } from "../lib/errors";

export interface CreatePolicyInput {
  tenantId: string;
  name: string;
  courseId: string;
  roleName: UserRole;
  deadline?: Date;
}

export async function createPolicy(input: CreatePolicyInput) {
  return prisma.compliancePolicy.create({ data: input });
}

export async function listPolicies(tenantId?: string) {
  return prisma.compliancePolicy.findMany({
    where: tenantId ? { tenantId } : undefined,
    include: { course: { select: { id: true, title: true } } },
    orderBy: { createdAt: "desc" },
  });
}

export async function getPolicyById(id: string) {
  return prisma.compliancePolicy.findUnique({
    where: { id },
    include: { course: { select: { id: true, title: true } } },
  });
}

export async function deletePolicy(id: string) {
  await prisma.compliancePolicy.delete({ where: { id } });
}

export type ComplianceStatus = "COMPLIANT" | "PARTIAL" | "NON_COMPLIANT";

export interface PolicyStatusRow {
  userId: string;
  name: string | null;
  email: string;
  role: UserRole;
  progressPct: number;
  completedAt: string | null;
  status: ComplianceStatus;
}

/**
 * For every user in the policy's tenant holding roleName, joins against
 * their (most recent) Enrollment in the policy's course to derive a
 * compliance status:
 *  - COMPLIANT     — enrollment completed (completedAt set)
 *  - PARTIAL       — enrolled, in progress
 *  - NON_COMPLIANT — never enrolled in the required course
 */
export async function getPolicyStatus(policyId: string): Promise<{
  policy: NonNullable<Awaited<ReturnType<typeof getPolicyById>>>;
  rows: PolicyStatusRow[];
}> {
  const policy = await getPolicyById(policyId);
  if (!policy) throw new NotFoundError("Compliance policy not found");

  const subjects = await prisma.user.findMany({
    where: { tenantId: policy.tenantId, role: policy.roleName as UserRole },
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      enrollmentsAsAssignee: {
        where: { courseId: policy.courseId },
        orderBy: { enrolledAt: "desc" },
        take: 1,
        select: { progressPct: true, completedAt: true },
      },
    },
  });

  const rows: PolicyStatusRow[] = subjects.map((u) => {
    const enrollment = u.enrollmentsAsAssignee[0];
    const status: ComplianceStatus = !enrollment
      ? "NON_COMPLIANT"
      : enrollment.completedAt
        ? "COMPLIANT"
        : "PARTIAL";
    return {
      userId: u.id,
      name: u.name,
      email: u.email,
      role: u.role,
      progressPct: Math.round(enrollment?.progressPct ?? 0),
      completedAt: enrollment?.completedAt?.toISOString() ?? null,
      status,
    };
  });

  return { policy, rows };
}
