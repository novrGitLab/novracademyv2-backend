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
Object.defineProperty(exports, "__esModule", { value: true });
exports.issueCertificateForEnrollment = issueCertificateForEnrollment;
exports.getCertificateByUid = getCertificateByUid;
exports.getCertificateDownloadUrl = getCertificateDownloadUrl;
exports.getCertificateForEnrollment = getCertificateForEnrollment;
const db_1 = require("@novr/db");
const errors_1 = require("../lib/errors");
const emailQueue_1 = require("../queues/emailQueue");
const certificateDocument_1 = require("./certificateDocument");
const r2Service = __importStar(require("./r2Service"));
/**
 * Issues a certificate for a completed enrollment: renders the PDF,
 * uploads it to R2, and creates the Certificate row. Idempotent — safe to
 * call more than once for the same enrollment (e.g. a redelivered queue
 * job) since Certificate.enrollmentId is unique.
 */
async function issueCertificateForEnrollment(enrollmentId) {
    const existing = await db_1.prisma.certificate.findUnique({ where: { enrollmentId } });
    if (existing)
        return existing;
    const enrollment = await db_1.prisma.enrollment.findUnique({
        where: { id: enrollmentId },
        include: { user: true, course: true },
    });
    if (!enrollment || !enrollment.course)
        throw new errors_1.NotFoundError("Enrollment not found");
    // Create first to obtain the certUid (used as both the PDF's visible ID
    // and its R2 object key), then fill in pdfUrl once the upload completes.
    const certificate = await db_1.prisma.certificate.create({
        data: {
            userId: enrollment.userId,
            courseId: enrollment.courseId,
            enrollmentId: enrollment.id,
        },
    });
    const pdfBuffer = await (0, certificateDocument_1.generateCertificatePdf)({
        learnerName: enrollment.user.name ?? enrollment.user.email,
        courseTitle: enrollment.course.title,
        issuedAtLabel: certificate.issuedAt.toLocaleDateString("en-US", {
            year: "numeric",
            month: "long",
            day: "numeric",
        }),
        certUid: certificate.certUid,
    });
    const key = r2Service.certificateObjectKey(certificate.certUid);
    await r2Service.uploadBuffer(key, pdfBuffer, "application/pdf");
    const issued = await db_1.prisma.certificate.update({ where: { id: certificate.id }, data: { pdfUrl: key } });
    await (0, emailQueue_1.enqueueCertificateIssuedEmail)(issued.id);
    return issued;
}
/** Public lookup for the verification page — no auth, so no PII beyond name/course. */
async function getCertificateByUid(certUid) {
    const certificate = await db_1.prisma.certificate.findUnique({
        where: { certUid },
        include: { user: { select: { name: true, email: true } }, course: { select: { title: true } } },
    });
    if (!certificate)
        throw new errors_1.NotFoundError("Certificate not found");
    return certificate;
}
async function getCertificateDownloadUrl(pdfKey) {
    return r2Service.createPdfViewUrl(pdfKey);
}
async function getCertificateForEnrollment(userId, courseId) {
    return db_1.prisma.certificate.findFirst({ where: { userId, courseId } });
}
