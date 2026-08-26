import { Router } from "express";
import { prisma } from "@novr/db";
import { UserRole, ADMIN_ROLES } from "@novr/types";
import { authenticate, requireRole } from "../middleware/auth";
import * as itf from "../services/itfExportService";

const router = Router();
router.use(authenticate);

function getOrgId(req: any): string | null {
  if (req.user.role === UserRole.SUPER_ADMIN) {
    return (req.query.organizationId as string) || req.user.organizationId;
  }
  return req.user.organizationId;
}

// GET /itf/preview?year=2024 — JSON summary for the UI
router.get("/preview", requireRole(...ADMIN_ROLES), async (req, res) => {
  const orgId = getOrgId(req);
  if (!orgId) {
    return res.status(400).json({ error: "No organization associated with your account" });
  }

  const year = parseInt(req.query.year as string, 10);
  if (isNaN(year) || year < 2000 || year > new Date().getFullYear()) {
    return res.status(400).json({ error: "Invalid training year" });
  }

  const data = await itf.getItfPreview(orgId, year);
  res.json(data);
});

// GET /itf/export?year=2024 — XLSX download
router.get("/export", requireRole(...ADMIN_ROLES), async (req, res) => {
  const orgId = getOrgId(req);
  if (!orgId) {
    return res.status(400).json({ error: "No organization associated with your account" });
  }

  const year = parseInt(req.query.year as string, 10);
  if (isNaN(year) || year < 2000 || year > new Date().getFullYear()) {
    return res.status(400).json({ error: "Invalid training year" });
  }

  const preview = await itf.getItfPreview(orgId, year);
  const buffer = await itf.generateItfExport(orgId, year);

  // Audit log
  await prisma.itfExport.create({
    data: {
      organizationId: orgId,
      generatedById: req.user!.id,
      trainingYear: year,
      rowCount: preview.totalTrainees,
      totalHours: preview.totalHours,
      totalCostNgn: preview.totalCostNgn,
      format: "xlsx",
    },
  });

  const slug = preview.orgName.toLowerCase().replace(/[^a-z0-9]/g, "-");
  res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
  res.setHeader("Content-Disposition", `attachment; filename="ITF_Reclaim_${slug}_${year}.xlsx"`);
  res.send(buffer);
});

// GET /itf/audit — recent export history for this org
router.get("/audit", requireRole(...ADMIN_ROLES), async (req, res) => {
  const orgId = getOrgId(req);
  const exports = await prisma.itfExport.findMany({
    where: { organizationId: orgId },
    include: { generatedBy: { select: { name: true, email: true } } },
    orderBy: { generatedAt: "desc" },
    take: 20,
  });
  res.json({ exports });
});

export default router;
