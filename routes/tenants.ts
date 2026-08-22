import { Router } from "express";
import { z } from "zod";
import { ADMIN_ROLES, UserRole } from "@novr/types";
import { authenticate, requireRole } from "../middleware/auth";
import * as tenantService from "../services/tenantService";

const router = Router();

router.use(authenticate);

// Full CRUD is Super Admin only — tenants are the top-level billing/isolation
// boundary, so creating or deleting one is a platform-operator action, not
// something a tenant's own admin can do to themselves.
router.get("/", requireRole(UserRole.SUPER_ADMIN), async (_req, res) => {
  const tenants = await tenantService.listTenants();
  res.json(tenants);
});

// Reading a single tenant is also allowed for that tenant's own admins (the
// branding settings page needs to load its own tenant's current values).
router.get("/:id", requireRole(...ADMIN_ROLES), async (req, res) => {
  const isSuperAdmin = req.user!.role === UserRole.SUPER_ADMIN;
  if (!isSuperAdmin && req.user!.tenantId !== req.params.id) {
    return res.status(403).json({ error: "Cannot view another tenant" });
  }
  const tenant = await tenantService.getTenantById(req.params.id);
  if (!tenant) return res.status(404).json({ error: "Tenant not found" });
  res.json(tenant);
});

const slugPattern = /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/;

const createTenantSchema = z.object({
  name: z.string().min(1),
  slug: z.string().min(1).regex(slugPattern, "Slug must be lowercase letters, numbers, and hyphens"),
  plan: z.string().min(1).optional(),
  logoUrl: z.string().url().optional(),
  primaryColor: z.string().optional(),
});

router.post("/", requireRole(UserRole.SUPER_ADMIN), async (req, res) => {
  const parsed = createTenantSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }
  try {
    const tenant = await tenantService.createTenant(parsed.data);
    res.status(201).json(tenant);
  } catch (err) {
    res.status(409).json({ error: err instanceof Error ? err.message : "Could not create tenant" });
  }
});

const updateTenantSchema = z.object({
  name: z.string().min(1).optional(),
  slug: z.string().min(1).regex(slugPattern).optional(),
  plan: z.string().min(1).optional(),
  isActive: z.boolean().optional(),
});

router.patch("/:id", requireRole(UserRole.SUPER_ADMIN), async (req, res) => {
  const parsed = updateTenantSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }
  const tenant = await tenantService.updateTenant(req.params.id, parsed.data);
  res.json(tenant);
});

router.delete("/:id", requireRole(UserRole.SUPER_ADMIN), async (req, res) => {
  await tenantService.deleteTenant(req.params.id);
  res.status(204).send();
});

// Branding is also editable by that tenant's own admins — this is the
// endpoint the admin settings/branding page saves to — but never for a
// tenant other than their own; Super Admin can edit any tenant's branding.
const brandingSchema = z.object({
  logoUrl: z.string().url().optional(),
  primaryColor: z.string().optional(),
  secondaryColor: z.string().optional(),
  accentColor: z.string().optional(),
});

router.patch("/:id/branding", requireRole(...ADMIN_ROLES), async (req, res) => {
  const isSuperAdmin = req.user!.role === UserRole.SUPER_ADMIN;
  if (!isSuperAdmin && req.user!.tenantId !== req.params.id) {
    return res.status(403).json({ error: "Cannot modify another tenant's branding" });
  }
  const parsed = brandingSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }
  const tenant = await tenantService.updateBranding(req.params.id, parsed.data);
  res.json(tenant);
});

export default router;
