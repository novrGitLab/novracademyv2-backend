import { Router } from "express";
import { z } from "zod";
import { ADMIN_ROLES, UserRole } from "@novr/types";
import { authenticate, requireRole } from "../middleware/auth";
import * as complianceService from "../services/complianceService";

const router = Router();

router.use(authenticate, requireRole(...ADMIN_ROLES));

// Super Admin can see every tenant's policies (optionally filtered via
// ?tenantId=); a tenant's own admin only ever sees their own tenant's.
function scopedTenantId(req: import("express").Request): string | undefined {
  if (req.user!.role === UserRole.SUPER_ADMIN) {
    const q = req.query.tenantId;
    return typeof q === "string" ? q : undefined;
  }
  return req.user!.tenantId ?? undefined;
}

router.get("/policies", async (req, res) => {
  const tenantId = scopedTenantId(req);
  const policies = await complianceService.listPolicies(tenantId);
  res.json(policies);
});

const createPolicySchema = z.object({
  name: z.string().min(1),
  courseId: z.string().min(1),
  roleName: z.nativeEnum(UserRole),
  deadline: z.coerce.date().optional(),
  // Super Admin must say which tenant this policy belongs to; a tenant
  // admin can only ever create policies for their own tenant.
  tenantId: z.string().min(1).optional(),
});

router.post("/policies", async (req, res) => {
  const parsed = createPolicySchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }

  const isSuperAdmin = req.user!.role === UserRole.SUPER_ADMIN;
  const tenantId = isSuperAdmin ? parsed.data.tenantId : req.user!.tenantId ?? undefined;
  if (!tenantId) {
    return res.status(400).json({ error: "tenantId is required" });
  }
  if (!isSuperAdmin && parsed.data.tenantId && parsed.data.tenantId !== req.user!.tenantId) {
    return res.status(403).json({ error: "Cannot create a policy for another tenant" });
  }

  const policy = await complianceService.createPolicy({ ...parsed.data, tenantId });
  res.status(201).json(policy);
});

router.get("/policies/:id", async (req, res) => {
  const policy = await complianceService.getPolicyById(req.params.id);
  if (!policy) return res.status(404).json({ error: "Compliance policy not found" });
  res.json(policy);
});

// GET /compliance/policies/:id/status — per-user completion status for a
// policy, derived by joining tenant members in roleName against their
// enrollment/completion in the required course.
router.get("/policies/:id/status", async (req, res) => {
  const { policy, rows } = await complianceService.getPolicyStatus(req.params.id);

  if (req.user!.role !== UserRole.SUPER_ADMIN && policy.tenantId !== req.user!.tenantId) {
    return res.status(403).json({ error: "Not authorized for this tenant's compliance data" });
  }

  const compliant = rows.filter((r) => r.status === "COMPLIANT").length;
  res.json({
    policy,
    rows,
    summary: {
      total: rows.length,
      compliant,
      partial: rows.filter((r) => r.status === "PARTIAL").length,
      nonCompliant: rows.filter((r) => r.status === "NON_COMPLIANT").length,
      compliancePct: rows.length > 0 ? Math.round((compliant / rows.length) * 100) : 0,
    },
  });
});

router.delete("/policies/:id", async (req, res) => {
  await complianceService.deletePolicy(req.params.id);
  res.status(204).send();
});

export default router;
