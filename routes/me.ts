import { Router } from "express";
import { prisma } from "@novr/db";
import { authenticate } from "../middleware/auth";

const router = Router();

router.use(authenticate);

// GET /me/org — the current user's organization (includes the logo data URL,
// which is deliberately NOT embedded in the JWT/session to keep it small).
router.get("/org", async (req, res) => {
  const user = await prisma.user.findUnique({
    where: { id: req.user!.id },
    select: { organizationId: true },
  });
  if (!user?.organizationId) return res.json(null);
  const organization = await prisma.organization.findUnique({
    where: { id: user.organizationId },
  });
  res.json(organization);
});

// GET /me/enrollments — the current user's enrollments with course + progress.
// Capped to the most recent 200 (a learner realistically has far fewer; the
// cap keeps the payload bounded for power users).
router.get("/enrollments", async (req, res) => {
  const enrollments = await prisma.enrollment.findMany({
    where: { userId: req.user!.id },
    orderBy: { createdAt: "desc" },
    take: 200,
    include: {
      course: { select: { id: true, title: true, slug: true, thumbnailUrl: true } },
    },
  });
  res.json(
    enrollments.map((e) => ({
      id: e.id,
      status: e.status,
      progressPct: e.progressPct ?? 0,
      expiresAt: e.expiresAt,
      completedAt: e.completedAt,
      enrolledAt: e.createdAt,
      course: e.course,
    }))
  );
});

// GET /me/certificates — the current user's issued certificates.
router.get("/certificates", async (req, res) => {
  const certificates = await prisma.certificate.findMany({
    where: { userId: req.user!.id },
    orderBy: { issuedAt: "desc" },
    include: {
      course: { select: { id: true, title: true } },
    },
  });
  res.json(
    certificates.map((c) => ({
      id: c.id,
      certUid: c.certUid,
      courseTitle: c.course?.title ?? null,
      issuedAt: c.issuedAt,
      isLegacy: c.isLegacy,
      pdfUrl: c.pdfUrl,
    }))
  );
});

// GET /me/certificates/:courseId — the current user's certificate for one
// course, if one has been issued.
router.get("/certificates/:courseId", async (req, res) => {
  const certificate = await prisma.certificate.findFirst({
    where: { userId: req.user!.id, courseId: req.params.courseId },
    include: { course: { select: { id: true, title: true } } },
  });
  if (!certificate) return res.status(404).json({ error: "No certificate issued for this course yet" });
  res.json({
    id: certificate.id,
    certUid: certificate.certUid,
    courseTitle: certificate.course?.title ?? null,
    issuedAt: certificate.issuedAt,
    isLegacy: certificate.isLegacy,
    pdfUrl: certificate.pdfUrl,
  });
});

// POST /me/certificates/:courseId/generate — issues a certificate for a
// completed enrollment. Idempotent: returns the existing certificate if one
// already exists; otherwise generates + uploads the PDF to R2.
router.post("/certificates/:courseId/generate", async (req, res) => {
  const certificateService = await import("../services/certificateService");

  const existing = await prisma.certificate.findFirst({
    where: { userId: req.user!.id, courseId: req.params.courseId },
  });
  if (existing) {
    return res.json({ certificate: existing });
  }

  const enrollment = await prisma.enrollment.findFirst({
    where: { userId: req.user!.id, courseId: req.params.courseId, status: "ACTIVE" },
  });
  if (!enrollment || !enrollment.completedAt) {
    return res.status(400).json({ error: "Course must be completed before generating a certificate" });
  }

  const certificate = await certificateService.issueCertificateForEnrollment(enrollment.id);
  res.status(201).json({ certificate });
});

export default router;
