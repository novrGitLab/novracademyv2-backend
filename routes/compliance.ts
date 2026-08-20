import { Router } from "express";
import { z } from "zod";
import { UserRole, ADMIN_ROLES } from "@novr/types";
import { authenticate, requireRole } from "../middleware/auth";
import * as complianceService from "../services/complianceService";
import { prisma } from "@novr/db";
import { toCsv } from "../lib/csv";

const router = Router();
router.use(authenticate);

async function canManageOrg(userId: string, orgId: string, role: string): Promise<boolean> {
  if (role === UserRole.SUPER_ADMIN) return true;
  if (!ADMIN_ROLES.includes(role as any)) return false;
  const member = await prisma.user.findFirst({ where: { id: userId, organizationId: orgId } });
  return !!member;
}

function getOrgId(req: any): string | null {
  if (req.user.role === UserRole.SUPER_ADMIN) {
    return (req.query.organizationId as string) || req.user.organizationId;
  }
  return req.user.organizationId;
}

const settingsSchema = z.object({
  deadline: z.string().datetime().optional().transform((v) => (v ? new Date(v) : undefined)),
  threshold: z.number().min(0).max(100).optional(),
  autoSuspend: z.boolean().optional(),
});

// GET /compliance/settings
router.get("/settings", requireRole(...ADMIN_ROLES), async (req, res) => {
  const orgId = getOrgId(req);
  if (!orgId) return res.status(400).json({ error: "No organization associated with your account" });

  const settings = await complianceService.getComplianceSettings(orgId);
  res.json(settings ?? { organizationId: orgId, deadline: null, threshold: 80, autoSuspend: false });
});

// PUT /compliance/settings
router.put("/settings", requireRole(...ADMIN_ROLES), async (req, res) => {
  const orgId = getOrgId(req);
  if (!orgId) return res.status(400).json({ error: "No organization associated with your account" });

  if (!(await canManageOrg(req.user!.id, orgId, req.user!.role))) {
    return res.status(403).json({ error: "Insufficient permissions" });
  }

  const parsed = settingsSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  const settings = await complianceService.updateComplianceSettings(orgId, parsed.data);
  res.json(settings);
});

// GET /compliance/assignments
router.get("/assignments", requireRole(...ADMIN_ROLES), async (req, res) => {
  const orgId = getOrgId(req);
  if (!orgId) return res.status(400).json({ error: "No organization associated with your account" });

  const assignments = await complianceService.getMandatoryCourses(orgId);
  res.json(assignments);
});

// POST /compliance/assignments
const assignSchema = z.object({ courseId: z.string() });

router.post("/assignments", requireRole(...ADMIN_ROLES), async (req, res) => {
  const orgId = getOrgId(req);
  if (!orgId) return res.status(400).json({ error: "No organization associated with your account" });

  if (!(await canManageOrg(req.user!.id, orgId, req.user!.role))) {
    return res.status(403).json({ error: "Insufficient permissions" });
  }

  const parsed = assignSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  const assignment = await complianceService.assignMandatoryCourse(orgId, parsed.data.courseId);
  res.status(201).json(assignment);
});

// DELETE /compliance/assignments/:courseId
router.delete("/assignments/:courseId", requireRole(...ADMIN_ROLES), async (req, res) => {
  const orgId = getOrgId(req);
  if (!orgId) return res.status(400).json({ error: "No organization associated with your account" });

  if (!(await canManageOrg(req.user!.id, orgId, req.user!.role))) {
    return res.status(403).json({ error: "Insufficient permissions" });
  }

  const removed = await complianceService.removeMandatoryCourse(orgId, req.params.courseId);
  if (!removed) return res.status(404).json({ error: "Assignment not found" });
  res.json({ success: true });
});

// GET /compliance/records
router.get("/records", requireRole(...ADMIN_ROLES), async (req, res) => {
  const orgId = getOrgId(req);
  if (!orgId) return res.status(400).json({ error: "No organization associated with your account" });

  const result = await complianceService.getComplianceRecords(orgId, {
    status: req.query.status as string | undefined,
    search: req.query.search as string | undefined,
    page: parseInt(req.query.page as string) || 1,
    pageSize: parseInt(req.query.pageSize as string) || 20,
  });
  res.json(result);
});

// GET /compliance/stats
router.get("/stats", requireRole(...ADMIN_ROLES), async (req, res) => {
  const orgId = getOrgId(req);
  if (!orgId) return res.status(400).json({ error: "No organization associated with your account" });

  const stats = await complianceService.getComplianceRate(orgId);
  res.json(stats);
});

// GET /compliance/records/:userId — per-user compliance detail
router.get("/records/:userId", requireRole(...ADMIN_ROLES), async (req, res) => {
  const orgId = getOrgId(req);
  if (!orgId) return res.status(400).json({ error: "No organization associated with your account" });

  const detail = await complianceService.getUserComplianceDetail(orgId, req.params.userId);
  if (!detail) return res.status(404).json({ error: "User not found in this organization" });
  res.json(detail);
});

// GET /compliance/export
router.get("/export", requireRole(...ADMIN_ROLES), async (req, res) => {
  const orgId = getOrgId(req);
  if (!orgId) return res.status(400).json({ error: "No organization associated with your account" });

  const result = await complianceService.getComplianceRecords(orgId, {
    status: req.query.status as string | undefined,
    search: req.query.search as string | undefined,
    pageSize: 10000,
  });

  const csv = toCsv(
    result.records.map((r) => ({
      "Employee Name": r.name ?? "",
      Email: r.email,
      "Total Required": r.totalRequired,
      Completed: r.completed,
      "Progress %": r.progressPct,
      Status: r.status,
      "Last Completed": r.lastCompletedAt?.toISOString() ?? "",
      "Due Date": r.dueDate?.toISOString() ?? "",
    }))
  );

  res.setHeader("Content-Type", "text/csv");
  res.setHeader("Content-Disposition", `attachment; filename="compliance-report-${orgId}.csv"`);
  res.send(csv);
});

export default router;
