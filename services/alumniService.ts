import crypto from "crypto";
import bcrypt from "bcryptjs";
import { prisma } from "@novr/db";
import { MemberType, UserRole, UserStatus } from "@novr/types";
import { ApiError, NotFoundError } from "../lib/errors";
import { enqueueLegacyCertificateGeneration } from "../queues/certificateQueue";
import { enqueueAlumniInviteEmail } from "../queues/emailQueue";
import { generateCertificatePdf } from "./certificateDocument";
import * as cohortService from "./cohortService";
import { autoJoinCohortGroup, autoJoinGeneral } from "./groupService";
import * as r2Service from "./r2Service";

export interface AlumniRecordInput {
  fullName: string;
  email?: string;
  phone?: string;
  courseName: string;
  completionDate?: Date;
  score?: number;
  cohortLabel?: string;
}

async function createSingleRecord(input: AlumniRecordInput, importBatchId?: string) {
  const cohort = input.cohortLabel ? await cohortService.findOrCreateCohortByLabel(input.cohortLabel) : null;
  const claimToken = crypto.randomBytes(24).toString("hex");

  const record = await prisma.alumniRecord.create({
    data: {
      fullName: input.fullName,
      email: input.email,
      phone: input.phone,
      courseName: input.courseName,
      completionDate: input.completionDate,
      score: input.score,
      cohortLabel: input.cohortLabel,
      cohortId: cohort?.id,
      claimToken,
      importBatchId,
    },
  });

  // Certificate PDF is generated eagerly (queued, not inline) so it's
  // "waiting for them on arrival" — ready the moment they claim, not
  // generated on demand at claim time.
  await enqueueLegacyCertificateGeneration(record.id);
  if (input.email) {
    await enqueueAlumniInviteEmail(record.id);
  }
  return record;
}

/** Bulk CSV import — rows are parsed client-side and posted as JSON (see routes/alumni.ts). */
export async function importAlumniRecords(records: AlumniRecordInput[]) {
  const importBatchId = crypto.randomUUID();
  const created = await Promise.all(records.map((r) => createSingleRecord(r, importBatchId)));
  return { importBatchId, count: created.length };
}

/** Manual single-record entry for edge cases the CSV doesn't cover. */
export async function createManualRecord(input: AlumniRecordInput) {
  return createSingleRecord(input);
}

export interface ListAlumniParams {
  claimed?: boolean;
  search?: string;
  page?: number;
  pageSize?: number;
}

export async function listAlumniRecords(params: ListAlumniParams) {
  const page = Math.max(1, params.page ?? 1);
  const pageSize = Math.min(100, Math.max(1, params.pageSize ?? 20));

  const where = {
    claimed: params.claimed,
    ...(params.search
      ? {
          OR: [
            { fullName: { contains: params.search, mode: "insensitive" as const } },
            { email: { contains: params.search, mode: "insensitive" as const } },
          ],
        }
      : {}),
  };

  const [records, total] = await Promise.all([
    prisma.alumniRecord.findMany({
      where,
      orderBy: { importedAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
      include: { cohort: { select: { id: true, name: true } } },
    }),
    prisma.alumniRecord.count({ where }),
  ]);

  return { records, total, page, pageSize };
}

/**
 * Called by the certificate worker right after import. Idempotent: the
 * worker may redeliver the job, and this only ever generates once per
 * record (checked via legacyCertPdfKey already being set).
 */
export async function generateLegacyCertificatePdf(alumniRecordId: string) {
  const record = await prisma.alumniRecord.findUnique({ where: { id: alumniRecordId } });
  if (!record || record.legacyCertPdfKey) return;

  const certUid = crypto.randomUUID();
  const pdfBuffer = await generateCertificatePdf({
    learnerName: record.fullName,
    courseTitle: record.courseName,
    issuedAtLabel: (record.completionDate ?? record.importedAt).toLocaleDateString("en-US", {
      year: "numeric",
      month: "long",
      day: "numeric",
    }),
    certUid,
  });

  const key = r2Service.certificateObjectKey(certUid);
  await r2Service.uploadBuffer(key, pdfBuffer, "application/pdf");

  await prisma.alumniRecord.update({
    where: { id: alumniRecordId },
    data: { legacyCertUid: certUid, legacyCertPdfKey: key },
  });
}

export async function getClaimInfo(claimToken: string) {
  const record = await prisma.alumniRecord.findUnique({ where: { claimToken } });
  if (!record || record.claimed) throw new NotFoundError("This claim link is invalid or has already been used");
  return {
    fullName: record.fullName,
    courseName: record.courseName,
    cohortLabel: record.cohortLabel,
    hasExistingAccount: record.email ? Boolean(await prisma.user.findUnique({ where: { email: record.email } })) : false,
  };
}

export interface ClaimInput {
  claimToken: string;
  password?: string;
  /** The currently-authenticated caller's email, if any — required to prove ownership when linking to an existing account. */
  requestingUserEmail?: string;
}

/**
 * Claims an alumni record: links it to a User (creating one if this email
 * has no account yet), tags cohort membership, and materializes the
 * Certificate row using the PDF that was already generated at import time.
 *
 * Security note: if a User already exists for this email, we must not link
 * the record just because the emails match — anyone with the claim link
 * could otherwise attach someone else's training history to their own
 * account search. Linking to an *existing* account requires the caller to
 * already be authenticated as that same email; only the brand-new-account
 * path (no existing user) is allowed anonymously, since that's equivalent
 * to signing up.
 */
export async function claimRecord(input: ClaimInput) {
  const record = await prisma.alumniRecord.findUnique({ where: { claimToken: input.claimToken } });
  if (!record || record.claimed) throw new NotFoundError("This claim link is invalid or has already been used");
  if (!record.email) throw new ApiError(400, "This record has no email on file and can't be self-claimed");

  let user = await prisma.user.findUnique({ where: { email: record.email } });

  if (!user) {
    if (!input.password || input.password.length < 8) {
      throw new ApiError(400, "Choose a password (at least 8 characters) to create your account");
    }
    const passwordHash = await bcrypt.hash(input.password, 10);
    user = await prisma.user.create({
      data: {
        email: record.email,
        name: record.fullName,
        passwordHash,
        role: UserRole.LEGACY_ALUMNI,
        memberType: MemberType.LEGACY_ALUMNI,
        status: UserStatus.ACTIVE,
      },
    });
  } else {
    if (input.requestingUserEmail !== record.email) {
      throw new ApiError(403, "An account with this email already exists — log in with that account first, then open this link again");
    }
    await prisma.user.update({ where: { id: user.id }, data: { memberType: MemberType.LEGACY_ALUMNI } });
  }

  await prisma.alumniRecord.update({
    where: { id: record.id },
    data: { userId: user.id, claimed: true, claimedAt: new Date() },
  });

  await autoJoinGeneral(user.id);

  if (record.cohortId) {
    await prisma.userCohort.upsert({
      where: { userId_cohortId: { userId: user.id, cohortId: record.cohortId } },
      create: { userId: user.id, cohortId: record.cohortId },
      update: {},
    });
    await autoJoinCohortGroup(user.id, record.cohortId);
  }

  if (record.legacyCertUid && record.legacyCertPdfKey) {
    await prisma.certificate.upsert({
      where: { alumniRecordId: record.id },
      create: {
        userId: user.id,
        alumniRecordId: record.id,
        isLegacy: true,
        certUid: record.legacyCertUid,
        pdfUrl: record.legacyCertPdfKey,
      },
      update: { userId: user.id },
    });
  }

  return user;
}
