"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.importAlumniRecords = importAlumniRecords;
exports.createManualRecord = createManualRecord;
exports.listAlumniRecords = listAlumniRecords;
exports.generateLegacyCertificatePdf = generateLegacyCertificatePdf;
exports.getClaimInfo = getClaimInfo;
exports.claimRecord = claimRecord;
const crypto_1 = __importDefault(require("crypto"));
const bcryptjs_1 = __importDefault(require("bcryptjs"));
const db_1 = require("@novr/db");
const types_1 = require("@novr/types");
const errors_1 = require("../lib/errors");
const certificateQueue_1 = require("../queues/certificateQueue");
const emailQueue_1 = require("../queues/emailQueue");
const certificateDocument_1 = require("./certificateDocument");
const cohortService = __importStar(require("./cohortService"));
const groupService_1 = require("./groupService");
const r2Service = __importStar(require("./r2Service"));
async function createSingleRecord(input, importBatchId) {
    const cohort = input.cohortLabel ? await cohortService.findOrCreateCohortByLabel(input.cohortLabel) : null;
    const claimToken = crypto_1.default.randomBytes(24).toString("hex");
    const record = await db_1.prisma.alumniRecord.create({
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
    await (0, certificateQueue_1.enqueueLegacyCertificateGeneration)(record.id);
    if (input.email) {
        await (0, emailQueue_1.enqueueAlumniInviteEmail)(record.id);
    }
    return record;
}
/** Bulk CSV import — rows are parsed client-side and posted as JSON (see routes/alumni.ts). */
async function importAlumniRecords(records) {
    const importBatchId = crypto_1.default.randomUUID();
    const created = await Promise.all(records.map((r) => createSingleRecord(r, importBatchId)));
    return { importBatchId, count: created.length };
}
/** Manual single-record entry for edge cases the CSV doesn't cover. */
async function createManualRecord(input) {
    return createSingleRecord(input);
}
async function listAlumniRecords(params) {
    const page = Math.max(1, params.page ?? 1);
    const pageSize = Math.min(100, Math.max(1, params.pageSize ?? 20));
    const where = {
        claimed: params.claimed,
        ...(params.search
            ? {
                OR: [
                    { fullName: { contains: params.search, mode: "insensitive" } },
                    { email: { contains: params.search, mode: "insensitive" } },
                ],
            }
            : {}),
    };
    const [records, total] = await Promise.all([
        db_1.prisma.alumniRecord.findMany({
            where,
            orderBy: { importedAt: "desc" },
            skip: (page - 1) * pageSize,
            take: pageSize,
            include: { cohort: { select: { id: true, name: true } } },
        }),
        db_1.prisma.alumniRecord.count({ where }),
    ]);
    return { records, total, page, pageSize };
}
/**
 * Called by the certificate worker right after import. Idempotent: the
 * worker may redeliver the job, and this only ever generates once per
 * record (checked via legacyCertPdfKey already being set).
 */
async function generateLegacyCertificatePdf(alumniRecordId) {
    const record = await db_1.prisma.alumniRecord.findUnique({ where: { id: alumniRecordId } });
    if (!record || record.legacyCertPdfKey)
        return;
    const certUid = crypto_1.default.randomUUID();
    const pdfBuffer = await (0, certificateDocument_1.generateCertificatePdf)({
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
    await db_1.prisma.alumniRecord.update({
        where: { id: alumniRecordId },
        data: { legacyCertUid: certUid, legacyCertPdfKey: key },
    });
}
async function getClaimInfo(claimToken) {
    const record = await db_1.prisma.alumniRecord.findUnique({ where: { claimToken } });
    if (!record || record.claimed)
        throw new errors_1.NotFoundError("This claim link is invalid or has already been used");
    return {
        fullName: record.fullName,
        courseName: record.courseName,
        cohortLabel: record.cohortLabel,
        hasExistingAccount: record.email ? Boolean(await db_1.prisma.user.findUnique({ where: { email: record.email } })) : false,
    };
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
async function claimRecord(input) {
    const record = await db_1.prisma.alumniRecord.findUnique({ where: { claimToken: input.claimToken } });
    if (!record || record.claimed)
        throw new errors_1.NotFoundError("This claim link is invalid or has already been used");
    if (!record.email)
        throw new errors_1.ApiError(400, "This record has no email on file and can't be self-claimed");
    let user = await db_1.prisma.user.findUnique({ where: { email: record.email } });
    if (!user) {
        if (!input.password || input.password.length < 8) {
            throw new errors_1.ApiError(400, "Choose a password (at least 8 characters) to create your account");
        }
        const passwordHash = await bcryptjs_1.default.hash(input.password, 10);
        user = await db_1.prisma.user.create({
            data: {
                email: record.email,
                name: record.fullName,
                passwordHash,
                role: types_1.UserRole.LEGACY_ALUMNI,
                memberType: types_1.MemberType.LEGACY_ALUMNI,
                status: types_1.UserStatus.ACTIVE,
            },
        });
    }
    else {
        if (input.requestingUserEmail !== record.email) {
            throw new errors_1.ApiError(403, "An account with this email already exists — log in with that account first, then open this link again");
        }
        await db_1.prisma.user.update({ where: { id: user.id }, data: { memberType: types_1.MemberType.LEGACY_ALUMNI } });
    }
    await db_1.prisma.alumniRecord.update({
        where: { id: record.id },
        data: { userId: user.id, claimed: true, claimedAt: new Date() },
    });
    await (0, groupService_1.autoJoinGeneral)(user.id);
    if (record.cohortId) {
        await db_1.prisma.userCohort.upsert({
            where: { userId_cohortId: { userId: user.id, cohortId: record.cohortId } },
            create: { userId: user.id, cohortId: record.cohortId },
            update: {},
        });
        await (0, groupService_1.autoJoinCohortGroup)(user.id, record.cohortId);
    }
    if (record.legacyCertUid && record.legacyCertPdfKey) {
        await db_1.prisma.certificate.upsert({
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
