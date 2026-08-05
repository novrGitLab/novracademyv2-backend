import { Router } from "express";
import { z } from "zod";
import { ADMIN_ROLES, UserStatus } from "@novr/types";
import { toCsv } from "../lib/csv";
import { authenticate, requireRole } from "../middleware/auth";
import * as bulkActionService from "../services/bulkActionService";

const router = Router();

router.use(authenticate, requireRole(...ADMIN_ROLES));

router.post("/unenroll", async (req, res) => {
  const parsed = z.object({ enrollmentIds: z.array(z.string()).min(1) }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const count = await bulkActionService.bulkUnenroll(parsed.data.enrollmentIds);
  res.json({ count });
});

router.post("/extend-validity", async (req, res) => {
  const parsed = z
    .object({ enrollmentIds: z.array(z.string()).min(1), additionalDays: z.number().int().positive() })
    .safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const count = await bulkActionService.bulkExtendValidity(parsed.data.enrollmentIds, parsed.data.additionalDays);
  res.json({ count });
});

router.post("/user-status", async (req, res) => {
  const parsed = z.object({ userIds: z.array(z.string()).min(1), status: z.nativeEnum(UserStatus) }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const count = await bulkActionService.bulkSetUserStatus(parsed.data.userIds, parsed.data.status);
  res.json({ count });
});

router.post("/assign-cohort", async (req, res) => {
  const parsed = z.object({ userIds: z.array(z.string()).min(1), cohortId: z.string() }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const count = await bulkActionService.bulkAssignCohort(parsed.data.userIds, parsed.data.cohortId);
  res.json({ count });
});

router.post("/award-xp", async (req, res) => {
  const parsed = z.object({ userIds: z.array(z.string()).min(1), xpAmount: z.number().int() }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const count = await bulkActionService.bulkAwardXp(parsed.data.userIds, parsed.data.xpAmount);
  res.json({ count });
});

router.post("/award-badge", async (req, res) => {
  const parsed = z.object({ userIds: z.array(z.string()).min(1), badgeId: z.string() }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const count = await bulkActionService.bulkAwardBadge(parsed.data.userIds, parsed.data.badgeId);
  res.json({ count });
});

router.post("/archive-courses", async (req, res) => {
  const parsed = z.object({ courseIds: z.array(z.string()).min(1) }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const count = await bulkActionService.bulkArchiveCourses(parsed.data.courseIds);
  res.json({ count });
});

router.get("/export-users", async (req, res) => {
  const userIds = typeof req.query.userIds === "string" ? req.query.userIds.split(",") : undefined;
  const users = await bulkActionService.getUsersForExport(userIds);
  res.setHeader("Content-Type", "text/csv");
  res.setHeader("Content-Disposition", 'attachment; filename="users.csv"');
  res.send(toCsv(users));
});

export default router;
