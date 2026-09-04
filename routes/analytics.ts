import { Router } from "express";
import { ADMIN_ROLES, UserRole } from "@novr/types";
import { authenticate, requireRole } from "../middleware/auth";
import * as analyticsService from "../services/analyticsService";
import * as assessmentService from "../services/assessmentService";

const router = Router();

router.use(authenticate, requireRole(...ADMIN_ROLES));

router.get("/overview", async (_req, res) => {
  res.json(await analyticsService.getOverviewMetrics());
});

// Platform-wide analytics for the Super Admin dashboard. Guarded to
// SUPER_ADMIN only — ORG_ADMIN/INSTITUTION_ADMIN get the org-scoped
// endpoints instead.
router.get("/platform", requireRole(UserRole.SUPER_ADMIN), async (_req, res) => {
  res.json(await analyticsService.getPlatformAnalytics());
});

router.get("/lms/course-health", async (_req, res) => {
  res.json({ courses: await analyticsService.getCourseHealth() });
});

router.get("/lms/drop-off/:courseId", async (req, res) => {
  res.json({ lessons: await analyticsService.getDropOffAnalysis(req.params.courseId) });
});

router.get("/lms/cohort-performance", async (_req, res) => {
  res.json({ cohorts: await analyticsService.getCohortPerformance() });
});

router.get("/lms/enrollment-validity", async (_req, res) => {
  res.json(await analyticsService.getEnrollmentValidityDashboard());
});

router.get("/community", async (_req, res) => {
  res.json(await analyticsService.getCommunityAnalytics());
});

router.get("/revenue", async (_req, res) => {
  res.json(await analyticsService.getRevenueSummary());
});

router.get("/assessments", async (_req, res) => {
  res.json(await assessmentService.getAssessmentAnalytics());
});

export default router;
