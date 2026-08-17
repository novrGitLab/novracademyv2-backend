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

// GET /me/enrollments — the current user's enrollments with course + progress
router.get("/enrollments", async (req, res) => {
  const enrollments = await prisma.enrollment.findMany({
    where: { userId: req.user!.id },
    orderBy: { createdAt: "desc" },
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

export default router;
