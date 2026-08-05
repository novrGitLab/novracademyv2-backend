import { Router, type Response } from "express";
import { ADMIN_ROLES } from "@novr/types";
import { toCsv } from "../lib/csv";
import { authenticate, requireRole } from "../middleware/auth";
import * as reportService from "../services/reportService";

const router = Router();

router.use(authenticate, requireRole(...ADMIN_ROLES));

function sendCsv(res: Response, filename: string, rows: Record<string, unknown>[]) {
  res.setHeader("Content-Type", "text/csv");
  res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
  res.send(toCsv(rows));
}

router.get("/quiz-results", async (_req, res) => {
  sendCsv(res, "quiz-results.csv", await reportService.getQuizResultsReport());
});

router.get("/course-completion", async (_req, res) => {
  sendCsv(res, "course-completion.csv", await reportService.getCourseCompletionReport());
});

router.get("/enrollments", async (_req, res) => {
  sendCsv(res, "enrollments.csv", await reportService.getEnrollmentReport());
});

router.get("/time-spent", async (_req, res) => {
  sendCsv(res, "time-spent.csv", await reportService.getTimeSpentReport());
});

router.get("/learner-progress", async (req, res) => {
  const userId = String(req.query.userId ?? "");
  if (!userId) return res.status(400).json({ error: "userId query param is required" });
  sendCsv(res, "learner-progress.csv", await reportService.getLearnerProgressReport(userId));
});

router.get("/revenue", async (_req, res) => {
  sendCsv(res, "revenue.csv", await reportService.getRevenueReport());
});

router.get("/community-engagement", async (_req, res) => {
  sendCsv(res, "community-engagement.csv", await reportService.getCommunityEngagementReport());
});

export default router;
