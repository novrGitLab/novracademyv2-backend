import { prisma } from "@novr/db";
import { NotFoundError } from "../lib/errors";
import { enqueueCertificateIssuedEmail } from "../queues/emailQueue";
import { generateCertificatePdf } from "./certificateDocument";
import * as r2Service from "./r2Service";

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";

/** Renders + uploads a certificate PDF for an already-created Certificate row, pulling branding from its course's Organization. Shared by issuance and admin-triggered regeneration. */
async function renderAndUploadCertificatePdf(certificateId: string) {
  const certificate = await prisma.certificate.findUniqueOrThrow({
    where: { id: certificateId },
    include: { user: true, course: { include: { organization: true } } },
  });

  const pdfBuffer = await generateCertificatePdf({
    learnerName: certificate.user.name ?? certificate.user.email,
    courseTitle: certificate.course?.title ?? "Novr Academy course",
    issuedAtLabel: certificate.issuedAt.toLocaleDateString("en-US", {
      year: "numeric",
      month: "long",
      day: "numeric",
    }),
    certUid: certificate.certUid,
    verificationUrl: `${APP_URL}/certificates/${certificate.certUid}`,
    orgName: certificate.course?.organization?.name ?? null,
    orgLogoUrl: certificate.course?.organization?.logoUrl ?? null,
    orgPrimaryColor: certificate.course?.organization?.primaryColor ?? null,
  });

  const key = r2Service.certificateObjectKey(certificate.certUid);
  await r2Service.uploadBuffer(key, pdfBuffer, "application/pdf");
  return prisma.certificate.update({ where: { id: certificate.id }, data: { pdfUrl: key } });
}

/**
 * Issues a certificate for a completed enrollment: renders the PDF,
 * uploads it to R2, and creates the Certificate row. Idempotent — safe to
 * call more than once for the same enrollment (e.g. a redelivered queue
 * job) since Certificate.enrollmentId is unique.
 */
export async function issueCertificateForEnrollment(enrollmentId: string) {
  const existing = await prisma.certificate.findUnique({ where: { enrollmentId } });
  if (existing) return existing;

  const enrollment = await prisma.enrollment.findUnique({ where: { id: enrollmentId } });
  if (!enrollment) throw new NotFoundError("Enrollment not found");

  // Create first to obtain the certUid (used as both the PDF's visible ID
  // and its R2 object key), then fill in pdfUrl once the upload completes.
  const certificate = await prisma.certificate.create({
    data: {
      userId: enrollment.userId,
      courseId: enrollment.courseId,
      enrollmentId: enrollment.id,
    },
  });

  const issued = await renderAndUploadCertificatePdf(certificate.id);
  await enqueueCertificateIssuedEmail(issued.id);

  // Award XP + notify for earning a certificate (idempotent — guarded by the
  // "existing" check at the top, so this only runs on first issuance).
  try {
    const { awardXP, checkAndAwardBadges } = await import("./gamificationService");
    await awardXP(enrollment.userId, 150, "certificate_earned", { courseId: enrollment.courseId, certUid: issued.certUid });
    await checkAndAwardBadges(enrollment.userId);
  } catch (err) {
    console.error("Gamification failed on certificate issuance:", err);
  }

  try {
    await prisma.notification.create({
      data: {
        userId: enrollment.userId,
        type: "CERTIFICATE_ISSUED",
        title: "Certificate earned!",
        content: `Congratulations — you earned a certificate for ${enrollment.courseId ? "your completed course" : "your training"}.`,
      },
    });
  } catch (err) {
    console.error("Failed to create certificate notification:", err instanceof Error ? err.message : err);
  }

  return issued;
}

/** Re-renders every certificate for a course — used after the template or an organization's branding changes. */
export async function regenerateCertificatesForCourse(courseId: string) {
  const certificates = await prisma.certificate.findMany({ where: { courseId }, select: { id: true } });
  let count = 0;
  for (const c of certificates) {
    await renderAndUploadCertificatePdf(c.id);
    count++;
  }
  return { count };
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
