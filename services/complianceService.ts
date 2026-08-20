import { prisma } from "@novr/db";
import { EnrollmentStatus } from "@novr/types";
import { NotFoundError } from "../lib/errors";

export async function getComplianceSettings(organizationId: string) {
  return prisma.complianceSetting.findUnique({ where: { organizationId } });
}

export async function updateComplianceSettings(organizationId: string, data: { deadline?: Date; threshold?: number; autoSuspend?: boolean }) {
  const createData: { organizationId: string; deadline: Date; threshold?: number; autoSuspend?: boolean } = {
    organizationId,
    deadline: data.deadline ?? new Date(),
  };
  if (data.threshold !== undefined) createData.threshold = data.threshold;
  if (data.autoSuspend !== undefined) createData.autoSuspend = data.autoSuspend;

  return prisma.complianceSetting.upsert({
    where: { organizationId },
    create: createData,
    update: data,
  });
}

export async function getMandatoryCourses(organizationId: string) {
  return prisma.complianceAssignment.findMany({
    where: { organizationId },
    include: { course: { select: { id: true, title: true, slug: true, status: true } } },
    orderBy: { createdAt: "desc" },
  });
}

export async function assignMandatoryCourse(organizationId: string, courseId: string) {
  const course = await prisma.course.findUnique({ where: { id: courseId } });
  if (!course) throw new NotFoundError("Course not found");

  return prisma.complianceAssignment.upsert({
    where: { courseId_organizationId: { courseId, organizationId } },
    create: { courseId, organizationId },
    update: {},
  });
}

export async function removeMandatoryCourse(organizationId: string, courseId: string) {
  const deleted = await prisma.complianceAssignment.deleteMany({
    where: { courseId, organizationId },
  });
  return deleted.count > 0;
}

export interface ComplianceRecord {
  userId: string;
  name: string | null;
  email: string;
  totalRequired: number;
  completed: number;
  progressPct: number;
  status: "COMPLIANT" | "PARTIAL" | "NON_COMPLIANT";
  lastCompletedAt: Date | null;
  dueDate: Date | null;
  phishingClicked: boolean;
  campaignCount: number;
}

export async function getComplianceRecords(organizationId: string, filters?: { status?: string; search?: string; page?: number; pageSize?: number }) {
  const page = Math.max(1, filters?.page ?? 1);
  const pageSize = Math.min(100, Math.max(1, filters?.pageSize ?? 20));

  const mandatoryCourses = await prisma.complianceAssignment.findMany({
    where: { organizationId },
    select: { courseId: true },
  });
  const mandatoryCourseIds = mandatoryCourses.map((c) => c.courseId);

  const orgUsers = await prisma.user.findMany({
    where: { organizationId },
    select: { id: true, name: true, email: true },
  });

  // Fetch phishing campaign data for this org
  const orgCampaigns = await prisma.campaign.findMany({
    where: { organizationId },
    select: { id: true },
  });
  const campaignIds = orgCampaigns.map((c) => c.id);

  // Find users who clicked any phishing link
  const phishingClickers = await prisma.campaignResult.findMany({
    where: {
      campaignId: { in: campaignIds },
      eventType: "clicked",
    },
    select: { userId: true },
    distinct: ["userId"],
  });
  const clickedUserIds = new Set(phishingClickers.filter((r) => r.userId).map((r) => r.userId));

  const records: ComplianceRecord[] = [];

  for (const user of orgUsers) {
    if (mandatoryCourseIds.length === 0) {
      records.push({
        userId: user.id,
        name: user.name,
        email: user.email,
        totalRequired: 0,
        completed: 0,
        progressPct: clickedUserIds.has(user.id) ? 0 : 100,
        status: clickedUserIds.has(user.id) ? "NON_COMPLIANT" : "COMPLIANT",
        lastCompletedAt: null,
        dueDate: null,
        phishingClicked: clickedUserIds.has(user.id),
        campaignCount: campaignIds.length,
      });
      continue;
    }

    const enrollments = await prisma.enrollment.findMany({
      where: {
        userId: user.id,
        courseId: { in: mandatoryCourseIds },
      },
      select: { courseId: true, completedAt: true, progressPct: true },
    });

    const completedCount = enrollments.filter((e) => e.completedAt !== null).length;

    const setting = await prisma.complianceSetting.findUnique({ where: { organizationId } });
    const threshold = setting?.threshold ?? 80;

    const hasPhishing = clickedUserIds.has(user.id);
    const courseProgressPct = Math.round((completedCount / mandatoryCourseIds.length) * 100);
    const progressPct = hasPhishing && campaignIds.length > 0 ? 0 : courseProgressPct;
    const status = hasPhishing && campaignIds.length > 0
      ? "NON_COMPLIANT"
      : progressPct >= threshold
        ? "COMPLIANT"
        : completedCount > 0
          ? "PARTIAL"
          : "NON_COMPLIANT";

    const lastCompleted = enrollments
      .filter((e) => e.completedAt)
      .sort((a, b) => (b.completedAt!.getTime() - a.completedAt!.getTime()))[0]?.completedAt ?? null;

    records.push({
      userId: user.id,
      name: user.name,
      email: user.email,
      totalRequired: mandatoryCourseIds.length,
      completed: completedCount,
      progressPct,
      status: hasPhishing ? "NON_COMPLIANT" : status,
      lastCompletedAt: lastCompleted,
      dueDate: setting?.deadline ?? null,
      phishingClicked: hasPhishing,
      campaignCount: campaignIds.length,
    });
  }

  let filtered = records;
  if (filters?.status) {
    filtered = records.filter((r) => r.status === filters.status);
  }
  if (filters?.search) {
    const term = filters.search.toLowerCase();
    filtered = filtered.filter((r) => r.name?.toLowerCase().includes(term) || r.email.toLowerCase().includes(term));
  }

  const total = filtered.length;
  const paged = filtered.slice((page - 1) * pageSize, page * pageSize);

  return { records: paged, total, page, pageSize };
}

export async function getComplianceRate(organizationId: string) {
  const records = await getComplianceRecords(organizationId, { pageSize: 10000 });
  if (records.total === 0) return { rate: 100, compliant: 0, partial: 0, nonCompliant: 0, total: 0 };

  const compliant = records.records.filter((r) => r.status === "COMPLIANT").length;
  const partial = records.records.filter((r) => r.status === "PARTIAL").length;
  const nonCompliant = records.records.filter((r) => r.status === "NON_COMPLIANT").length;
  const rate = Math.round((compliant / records.total) * 100);

  return { rate, compliant, partial, nonCompliant, total: records.total };
}

export interface UserComplianceDetail {
  userId: string;
  name: string | null;
  email: string;
  overallStatus: "COMPLIANT" | "PARTIAL" | "NON_COMPLIANT";
  courseBreakdown: {
    courseId: string;
    courseTitle: string;
    status: "COMPLETED" | "IN_PROGRESS" | "NOT_STARTED";
    progressPct: number;
    completedAt: Date | null;
    isMandatory: boolean;
  }[];
  phishingBreakdown: {
    campaignId: string;
    campaignName: string;
    eventType: string;
    occurredAt: Date | null;
  }[];
}

export async function getUserComplianceDetail(organizationId: string, userId: string): Promise<UserComplianceDetail | null> {
  const user = await prisma.user.findFirst({ where: { id: userId, organizationId }, select: { id: true, name: true, email: true } });
  if (!user) return null;

  // Get mandatory course IDs
  const mandatoryCourses = await prisma.complianceAssignment.findMany({
    where: { organizationId },
    select: { courseId: true },
  });
  const mandatoryCourseIds = new Set(mandatoryCourses.map((c) => c.courseId));

  // Get ALL enrollments for this user (not just mandatory)
  const enrollments = await prisma.enrollment.findMany({
    where: { userId },
    select: { courseId: true, completedAt: true, progressPct: true },
  });

  // Fetch course titles for all enrolled courses
  const enrolledCourseIds = enrollments.map((e) => e.courseId);
  const allCourseIds = [...new Set([...enrolledCourseIds, ...mandatoryCourseIds])];
  const courses = await prisma.course.findMany({
    where: { id: { in: allCourseIds } },
    select: { id: true, title: true },
  });
  const courseTitleMap = new Map(courses.map((c) => [c.id, c.title]));
  const enrollmentMap = new Map(enrollments.map((e) => [e.courseId, e]));

  // Build breakdown for ALL relevant courses
  const courseBreakdown = allCourseIds.map((courseId) => {
    const enrollment = enrollmentMap.get(courseId);
    return {
      courseId,
      courseTitle: courseTitleMap.get(courseId) ?? "Unknown Course",
      status: enrollment?.completedAt ? "COMPLETED" as const : enrollment ? "IN_PROGRESS" as const : "NOT_STARTED" as const,
      progressPct: enrollment?.progressPct ?? 0,
      completedAt: enrollment?.completedAt ?? null,
      isMandatory: mandatoryCourseIds.has(courseId),
    };
  });

  // Sort: mandatory first, then by status (in progress, not started, completed)
  const statusOrder = { IN_PROGRESS: 0, NOT_STARTED: 1, COMPLETED: 2 };
  courseBreakdown.sort((a, b) => {
    if (a.isMandatory !== b.isMandatory) return a.isMandatory ? -1 : 1;
    return statusOrder[a.status] - statusOrder[b.status];
  });

  // Get phishing campaign results for this user
  const orgCampaigns = await prisma.campaign.findMany({
    where: { organizationId },
    select: { id: true, name: true },
  });
  const campaignMap = new Map(orgCampaigns.map((c) => [c.id, c.name]));

  const userResults = await prisma.campaignResult.findMany({
    where: { userId, campaignId: { in: orgCampaigns.map((c) => c.id) } },
    select: { campaignId: true, eventType: true, createdAt: true },
    orderBy: { createdAt: "desc" },
  });

  const phishingBreakdown = userResults.map((r) => ({
    campaignId: r.campaignId,
    campaignName: campaignMap.get(r.campaignId) ?? "Unknown Campaign",
    eventType: r.eventType,
    occurredAt: r.createdAt,
  }));

  // Determine overall status
  const setting = await prisma.complianceSetting.findUnique({ where: { organizationId } });
  const threshold = setting?.threshold ?? 80;
  const mandatoryEnrollments = enrollments.filter((e) => mandatoryCourseIds.has(e.courseId));
  const completedCount = mandatoryEnrollments.filter((e) => e.completedAt !== null).length;
  const courseProgressPct = mandatoryCourseIds.size > 0 ? Math.round((completedCount / mandatoryCourseIds.size) * 100) : 100;
  const hasPhishingClick = phishingBreakdown.some((r) => r.eventType === "clicked");

  const overallStatus = hasPhishingClick ? "NON_COMPLIANT"
    : courseProgressPct >= threshold ? "COMPLIANT"
    : completedCount > 0 ? "PARTIAL"
    : "NON_COMPLIANT";

  return {
    userId: user.id,
    name: user.name,
    email: user.email,
    overallStatus,
    courseBreakdown,
    phishingBreakdown,
  };
}
