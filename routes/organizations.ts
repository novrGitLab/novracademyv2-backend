import crypto from "crypto";
import { Router } from "express";
import { z } from "zod";
import { UserRole, ADMIN_ROLES } from "@novr/types";
import { prisma } from "@novr/db";
import { authenticate, requireRole } from "../middleware/auth";
import * as userService from "../services/userService";
import { enqueueAdminWelcomeEmail } from "../queues/emailQueue";

const router = Router();

router.use(authenticate);

const createOrgSchema = z.object({
  name: z.string().min(1),
  slug: z
    .string()
    .min(2)
    .regex(/^[a-z0-9-]+$/, "Slug must be lowercase letters, numbers and hyphens"),
  plan: z.string().default("free"),
  adminName: z.string().min(1).optional(),
  adminEmail: z.string().email(),
});

const brandingColor = z
  .string()
  .regex(/^#[0-9a-fA-F]{6,8}$/, "Colors must be hex like #683290")
  .nullable()
  .optional();

const brandingSchema = z.object({
  logoUrl: z.string().max(3_000_000).nullable().optional(),
  primaryColor: brandingColor,
  secondaryColor: brandingColor,
  accentColor: brandingColor,
  backgroundColor: brandingColor,
  textColor: brandingColor,
});

const logoUrlSchema = z.object({
  logoUrl: z
    .string()
    .regex(/^data:image\/(png|jpeg|jpg|webp|gif|svg\+xml);base64,/, "logoUrl must be a base64 image data URL")
    .max(3_000_000),
});

/** Org-scoped permission: super admins pass; admins must belong to the org. */
async function canManageOrg(userId: string, orgId: string, role: UserRole): Promise<boolean> {
  if (role === UserRole.SUPER_ADMIN) return true;
  if (!ADMIN_ROLES.includes(role)) return false;
  const member = await prisma.user.findFirst({ where: { id: userId, organizationId: orgId } });
  return !!member;
}

// POST /organizations — SUPER_ADMIN only. Creates the org, an ORG_ADMIN with a
// generated temporary password, and emails the admin their credentials.
router.post("/", requireRole(UserRole.SUPER_ADMIN), async (req, res) => {
  const parsed = createOrgSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  const { name, slug, plan, adminName, adminEmail } = parsed.data;

  const slugTaken = await prisma.organization.findUnique({ where: { slug } });
  if (slugTaken) return res.status(409).json({ error: "Organization slug already exists" });

  const emailTaken = await prisma.user.findUnique({ where: { email: adminEmail } });
  if (emailTaken) return res.status(409).json({ error: "An account with that email already exists" });

  const organization = await prisma.organization.create({ data: { name, slug, plan } });

  const tempPassword = crypto.randomBytes(6).toString("base64url");
  const admin = await userService.createUser({
    email: adminEmail,
    name: adminName,
    role: UserRole.ORG_ADMIN,
    organizationId: organization.id,
    password: tempPassword,
  });

  await enqueueAdminWelcomeEmail(admin.id, tempPassword);

  res.status(201).json({
    organization,
    admin: { id: admin.id, email: admin.email, name: admin.name },
    tempPassword,
  });
});

// GET /organizations — admins only.
router.get("/", requireRole(...ADMIN_ROLES), async (_req, res) => {
  const organizations = await prisma.organization.findMany({
    orderBy: { createdAt: "desc" },
    include: { _count: { select: { users: true } } },
  });
  res.json(organizations);
});

// GET /organizations/:id
router.get("/:id", requireRole(...ADMIN_ROLES), async (req, res) => {
  const organization = await prisma.organization.findUnique({
    where: { id: req.params.id },
    include: { _count: { select: { users: true } } },
  });
  if (!organization) return res.status(404).json({ error: "Organization not found" });
  res.json(organization);
});

// PATCH /organizations/:id/branding — the org's own admin or a super admin.
router.patch("/:id/branding", async (req, res) => {
  const organization = await prisma.organization.findUnique({ where: { id: req.params.id } });
  if (!organization) return res.status(404).json({ error: "Organization not found" });

  if (!(await canManageOrg(req.user!.id, organization.id, req.user!.role))) {
    return res.status(403).json({ error: "Insufficient permissions" });
  }

  const parsed = brandingSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  const updated = await prisma.organization.update({
    where: { id: organization.id },
    data: parsed.data,
  });
  res.json(updated);
});

// POST /organizations/:id/logo — upload a base64 image data URL to be stored
// on the org record (no external storage dependency in this deployment).
router.post("/:id/logo", async (req, res) => {
  const organization = await prisma.organization.findUnique({ where: { id: req.params.id } });
  if (!organization) return res.status(404).json({ error: "Organization not found" });

  if (!(await canManageOrg(req.user!.id, organization.id, req.user!.role))) {
    return res.status(403).json({ error: "Insufficient permissions" });
  }

  const parsed = logoUrlSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  const updated = await prisma.organization.update({
    where: { id: organization.id },
    data: { logoUrl: parsed.data.logoUrl },
  });
  res.json(updated);
});

export default router;
