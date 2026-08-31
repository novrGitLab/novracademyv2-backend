import { Router } from "express";
import { z } from "zod";
import { prisma } from "@novr/db";
import { UserRole, ADMIN_ROLES } from "@novr/types";
import { authenticate, requireRole } from "../middleware/auth";
import * as itf from "../services/itfExportService";
import * as itfClaim from "../services/itfClaimService";

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

// ── ITF Claims ────────────────────────────────────────────────────────────

function requireOrgId(req: any, res: any): string | null {
  const orgId = getOrgId(req);
  if (!orgId) {
    res.status(400).json({ error: "No organization associated with your account" });
    return null;
  }
  return orgId;
}

function parseYearParam(value: string): number | null {
  const year = parseInt(value, 10);
  if (isNaN(year) || year < 2000 || year > new Date().getFullYear()) return null;
  return year;
}

// GET /itf/claims — list all claims for the org.
router.get("/claims", requireRole(...ADMIN_ROLES), async (req, res) => {
  const orgId = requireOrgId(req, res);
  if (!orgId) return;
  const claims = await itfClaim.listClaims(orgId);
  res.json({ claims });
});

// GET /itf/claims/:year — get-or-create the draft claim for a training year.
// The UI calls this when "Start a Claim" is clicked.
router.get("/claims/:year", requireRole(...ADMIN_ROLES), async (req, res) => {
  const orgId = requireOrgId(req, res);
  if (!orgId) return;
  const year = parseYearParam(req.params.year);
  if (year === null) return res.status(400).json({ error: "Invalid training year" });

  const claim = await itfClaim.getOrCreateDraftClaim(orgId, year, req.user!.id);
  res.json({ claim });
});

// POST /itf/claims/:year/submit — submit a DRAFT claim with an ITF reference.
router.post("/claims/:year/submit", requireRole(...ADMIN_ROLES), async (req, res) => {
  const orgId = requireOrgId(req, res);
  if (!orgId) return;
  const year = parseYearParam(req.params.year);
  if (year === null) return res.status(400).json({ error: "Invalid training year" });

  const parsed = z
    .object({
      itfReference: z.string().min(1).optional(),
      submittedAt: z.coerce.date().optional(),
      submissionNotes: z.string().nullable().optional(),
    })
    .safeParse(req.body ?? {});
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  const claim = await itfClaim.submitClaim(orgId, year, parsed.data, req.user!.id);
  res.json({ claim });
});

// POST /itf/claims/:year/approve — approve a SUBMITTED claim.
router.post("/claims/:year/approve", requireRole(...ADMIN_ROLES), async (req, res) => {
  const orgId = requireOrgId(req, res);
  if (!orgId) return;
  const year = parseYearParam(req.params.year);
  if (year === null) return res.status(400).json({ error: "Invalid training year" });

  const parsed = z
    .object({
      approvedAmountNgn: z.number().min(0).optional(),
      approvedAt: z.coerce.date().optional(),
      approvalNotes: z.string().nullable().optional(),
    })
    .safeParse(req.body ?? {});
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  const claim = await itfClaim.approveClaim(orgId, year, parsed.data, req.user!.id);
  res.json({ claim });
});

// POST /itf/claims/:year/reject — reject a SUBMITTED claim.
router.post("/claims/:year/reject", requireRole(...ADMIN_ROLES), async (req, res) => {
  const orgId = requireOrgId(req, res);
  if (!orgId) return;
  const year = parseYearParam(req.params.year);
  if (year === null) return res.status(400).json({ error: "Invalid training year" });

  const parsed = z
    .object({
      rejectionReason: z.string().min(1).optional(),
      rejectedAt: z.coerce.date().optional(),
    })
    .safeParse(req.body ?? {});
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  const claim = await itfClaim.rejectClaim(orgId, year, parsed.data, req.user!.id);
  res.json({ claim });
});

// POST /itf/claims/:year/reopen — reopen an APPROVED/REJECTED claim to DRAFT.
router.post("/claims/:year/reopen", requireRole(...ADMIN_ROLES), async (req, res) => {
  const orgId = requireOrgId(req, res);
  if (!orgId) return;
  const year = parseYearParam(req.params.year);
  if (year === null) return res.status(400).json({ error: "Invalid training year" });

  const claim = await itfClaim.reopenClaim(orgId, year, req.user!.id);
  res.json({ claim });
});

export default router;
