import { prisma } from "@novr/db";
import { Prisma } from "@prisma/client";
import { getItfPreview, computeItfEstimate, ItfEstimate } from "./itfExportService";

export type { ItfEstimate };

export class ItfClaimError extends Error {
  status: number;
  constructor(message: string, status = 400) {
    super(message);
    this.status = status;
  }
}

function validateYear(year: number) {
  const thisYear = new Date().getFullYear();
  if (!Number.isInteger(year) || year < 2000 || year > thisYear) {
    throw new ItfClaimError("Invalid training year", 400);
  }
}

function claimInclude() {
  return {
    createdBy: { select: { id: true, name: true, email: true } },
    submittedBy: { select: { id: true, name: true, email: true } },
    approvedBy: { select: { id: true, name: true, email: true } },
    rejectedBy: { select: { id: true, name: true, email: true } },
  } satisfies Prisma.ItfClaimInclude;
}

async function findOpenClaim(orgId: string, year: number) {
  return prisma.itfClaim.findFirst({
    where: {
      organizationId: orgId,
      trainingYear: year,
      status: { in: ["DRAFT", "SUBMITTED"] },
    },
    include: claimInclude(),
  });
}

export async function getOrCreateDraftClaim(orgId: string, year: number, userId: string) {
  validateYear(year);

  const existing = await findOpenClaim(orgId, year);
  if (existing) {
    // If it's already SUBMITTED, surface it as-is; the caller decides what to do.
    return existing;
  }

  const preview = await getItfPreview(orgId, year);
  const org = await prisma.organization.findUnique({
    where: { id: orgId },
    select: { itfEmployeeHeadcount: true },
  });
  const estimate = computeItfEstimate(preview.categories, org?.itfEmployeeHeadcount ?? null);

  return prisma.itfClaim.create({
    data: {
      organizationId: orgId,
      trainingYear: year,
      status: "DRAFT",
      estimatedAmountNgn: estimate.estimatedAmountNgn,
      totalTrainingCostNgn: preview.totalCostNgn,
      totalTrainees: preview.totalTrainees,
      totalHours: preview.totalHours,
      createdById: userId,
    },
    include: claimInclude(),
  });
}

export async function submitClaim(
  orgId: string,
  year: number,
  payload: { itfReference?: string; submittedAt?: string | Date; submissionNotes?: string | null },
  userId: string,
) {
  validateYear(year);

  const claim = await prisma.itfClaim.findFirst({
    where: { organizationId: orgId, trainingYear: year, status: "DRAFT" },
  });
  if (!claim) {
    throw new ItfClaimError("No DRAFT claim found for this year", 404);
  }

  const itfReference = (payload.itfReference ?? "").trim();
  if (!itfReference) {
    throw new ItfClaimError("ITF reference is required", 400);
  }

  const submittedAt = payload.submittedAt ? new Date(payload.submittedAt) : new Date();
  if (Number.isNaN(submittedAt.getTime())) {
    throw new ItfClaimError("Invalid submission date", 400);
  }

  return prisma.itfClaim.update({
    where: { id: claim.id },
    data: {
      status: "SUBMITTED",
      itfReference,
      submittedAt,
      submittedById: userId,
      submissionNotes: payload.submissionNotes?.trim() || null,
    },
    include: claimInclude(),
  });
}

export async function approveClaim(
  orgId: string,
  year: number,
  payload: { approvedAmountNgn?: number; approvedAt?: string | Date; approvalNotes?: string | null },
  userId: string,
) {
  validateYear(year);

  const claim = await prisma.itfClaim.findFirst({
    where: { organizationId: orgId, trainingYear: year, status: "SUBMITTED" },
  });
  if (!claim) {
    throw new ItfClaimError("No SUBMITTED claim found for this year", 404);
  }

  const amount = Number(payload.approvedAmountNgn);
  if (!Number.isFinite(amount) || amount < 0) {
    throw new ItfClaimError("Approved amount must be a non-negative number", 400);
  }

  const approvedAt = payload.approvedAt ? new Date(payload.approvedAt) : new Date();
  if (Number.isNaN(approvedAt.getTime())) {
    throw new ItfClaimError("Invalid approval date", 400);
  }

  return prisma.itfClaim.update({
    where: { id: claim.id },
    data: {
      status: "APPROVED",
      approvedAmountNgn: Math.round(amount),
      approvedAt,
      approvedById: userId,
      approvalNotes: payload.approvalNotes?.trim() || null,
    },
    include: claimInclude(),
  });
}

export async function rejectClaim(
  orgId: string,
  year: number,
  payload: { rejectionReason?: string; rejectedAt?: string | Date },
  userId: string,
) {
  validateYear(year);

  const claim = await prisma.itfClaim.findFirst({
    where: { organizationId: orgId, trainingYear: year, status: "SUBMITTED" },
  });
  if (!claim) {
    throw new ItfClaimError("No SUBMITTED claim found for this year", 404);
  }

  const rejectionReason = (payload.rejectionReason ?? "").trim();
  if (!rejectionReason) {
    throw new ItfClaimError("Rejection reason is required", 400);
  }

  const rejectedAt = payload.rejectedAt ? new Date(payload.rejectedAt) : new Date();
  if (Number.isNaN(rejectedAt.getTime())) {
    throw new ItfClaimError("Invalid rejection date", 400);
  }

  return prisma.itfClaim.update({
    where: { id: claim.id },
    data: {
      status: "REJECTED",
      rejectedAt,
      rejectedById: userId,
      rejectionReason,
    },
    include: claimInclude(),
  });
}

export async function reopenClaim(orgId: string, year: number, _userId: string) {
  validateYear(year);

  const claim = await prisma.itfClaim.findFirst({
    where: {
      organizationId: orgId,
      trainingYear: year,
      status: { in: ["APPROVED", "REJECTED"] },
    },
    orderBy: { updatedAt: "desc" },
  });
  if (!claim) {
    throw new ItfClaimError("No APPROVED or REJECTED claim to reopen", 404);
  }

  return prisma.itfClaim.update({
    where: { id: claim.id },
    data: {
      status: "DRAFT",
      // Clear lifecycle fields so the row is back to a clean DRAFT.
      itfReference: null,
      submittedAt: null,
      submittedById: null,
      submissionNotes: null,
      approvedAmountNgn: null,
      approvedAt: null,
      approvedById: null,
      approvalNotes: null,
      rejectedAt: null,
      rejectedById: null,
      rejectionReason: null,
    },
    include: claimInclude(),
  });
}

export async function listClaims(orgId: string) {
  return prisma.itfClaim.findMany({
    where: { organizationId: orgId },
    include: claimInclude(),
    orderBy: [{ trainingYear: "desc" }, { updatedAt: "desc" }],
  });
}
