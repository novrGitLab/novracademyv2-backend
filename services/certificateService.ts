import { prisma } from "@novr/db";
import { NotFoundError } from "../lib/errors";
import { enqueueCertificateIssuedEmail } from "../queues/emailQueue";
import { generateCertificatePdf } from "./certificateDocument";
import * as r2Service from "./r2Service";

/**
 * Issues a certificate for a completed enrollment: renders the PDF,
 * uploads it to R2, and creates the Certificate row. Idempotent — safe to
 * call more than once for the same enrollment (e.g. a redelivered queue
 * job) since Certificate.enrollmentId is unique.
 */
export async function issueCertificateForEnrollment(enrollmentId: string) {
  const existing = await prisma.certificate.findUnique({ where: { enrollmentId } });
  if (existing) return existing;

  const enrollment = await prisma.enrollment.findUnique({
    where: { id: enrollmentId },
    include: { user: true, course: true },
  });
  if (!enrollment || !enrollment.course) throw new NotFoundError("Enrollment not found");

  // Create first to obtain the certUid (used as both the PDF's visible ID
  // and its R2 object key), then fill in pdfUrl once the upload completes.
  const certificate = await prisma.certificate.create({
    data: {
      userId: enrollment.userId,
      courseId: enrollment.courseId,
      enrollmentId: enrollment.id,
    },
  });

  const pdfBuffer = await generateCertificatePdf({
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

  const issued = await prisma.certificate.update({ where: { id: certificate.id }, data: { pdfUrl: key } });
  await enqueueCertificateIssuedEmail(issued.id);
  return issued;
}

/** Public lookup for the verification page — no auth, so no PII beyond name/course. */
export async function getCertificateByUid(certUid: string) {
  const certificate = await prisma.certificate.findUnique({
    where: { certUid },
    include: { user: { select: { name: true, email: true } }, course: { select: { title: true } } },
  });
  if (!certificate) throw new NotFoundError("Certificate not found");
  return certificate;
}

export async function getCertificateDownloadUrl(pdfKey: string) {
  return r2Service.createPdfViewUrl(pdfKey);
}

export async function getCertificateForEnrollment(userId: string, courseId: string) {
  return prisma.certificate.findFirst({ where: { userId, courseId } });
}
