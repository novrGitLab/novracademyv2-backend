import { Router } from "express";
import { z } from "zod";
import { prisma } from "@novr/db";
import { UserRole, ADMIN_ROLES } from "@novr/types";
import { authenticate, requireRole } from "../middleware/auth";

const router = Router();
router.use(authenticate);

function getOrgId(req: any): string | null {
  if (req.user.role === UserRole.SUPER_ADMIN) {
    return (req.query.organizationId as string) || req.user.organizationId;
  }
  return req.user.organizationId;
}

async function canManageOrg(userId: string, orgId: string, role: string): Promise<boolean> {
  if (role === UserRole.SUPER_ADMIN) return true;
  if (!ADMIN_ROLES.includes(role as any)) return false;
  const member = await prisma.user.findFirst({ where: { id: userId, organizationId: orgId } });
  return !!member;
}

// Saved senders are display-only — the actual SMTP transport is a single
// shared relay configured via env (GOPHISH_SMTP_*). Each org just picks
// the From display name and From address.
const createSchema = z.object({
  name: z.string().min(1).max(80),
  senderName: z.string().min(1).max(120),
  senderEmail: z.string().email(),
  smtpHost: z.string().optional().nullable(),
  smtpPort: z.number().int().min(1).max(65535).optional().nullable(),
  smtpUsername: z.string().optional().nullable(),
  smtpPassword: z.string().optional().nullable(),
  isDefault: z.boolean().optional().default(false),
});

const updateSchema = createSchema.partial();

// GET /sending-profiles — list profiles for the org
router.get("/", requireRole(...ADMIN_ROLES), async (req, res) => {
  const orgId = getOrgId(req);
  const where = orgId ? { organizationId: orgId } : {};
  const profiles = await prisma.sendingProfile.findMany({
    where,
    orderBy: [{ isDefault: "desc" }, { createdAt: "desc" }],
  });
  res.json({ profiles });
});

// GET /sending-profiles/:id — get one
router.get("/:id", requireRole(...ADMIN_ROLES), async (req, res) => {
  const profile = await prisma.sendingProfile.findUnique({ where: { id: req.params.id } });
  if (!profile) return res.status(404).json({ error: "Not found" });
  const orgId = getOrgId(req);
  if (orgId && profile.organizationId !== orgId) {
    return res.status(403).json({ error: "Insufficient permissions" });
  }
  res.json({ profile });
});

// POST /sending-profiles — create
router.post("/", requireRole(...ADMIN_ROLES), async (req, res) => {
  const parsed = createSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const data = parsed.data;

  const orgId = getOrgId(req);
  if (!orgId) return res.status(400).json({ error: "No organization associated with your account" });
  if (!(await canManageOrg(req.user!.id, orgId, req.user!.role))) {
    return res.status(403).json({ error: "Insufficient permissions" });
  }

  // If marking default, unset other defaults in this org
  if (data.isDefault) {
    await prisma.sendingProfile.updateMany({
      where: { organizationId: orgId, isDefault: true },
      data: { isDefault: false },
    });
  }

  // Default SMTP fields to the shared relay if the user didn't supply them.
  // Kept on the row for legacy / future per-tenant relays.
  const sharedHost = process.env.GOPHISH_SMTP_HOST ?? "mailhog";
  const sharedPort = parseInt(process.env.GOPHISH_SMTP_PORT ?? "1025", 10);
  const sharedUser = process.env.GOPHISH_SMTP_USERNAME ?? null;
  const sharedPass = process.env.GOPHISH_SMTP_PASSWORD ?? null;

  try {
    const profile = await prisma.sendingProfile.create({
      data: {
        organizationId: orgId,
        name: data.name.trim(),
        senderName: data.senderName.trim(),
        senderEmail: data.senderEmail.trim(),
        smtpHost: data.smtpHost?.trim() || sharedHost,
        smtpPort: data.smtpPort ?? sharedPort,
        smtpUsername: data.smtpUsername?.trim() || sharedUser,
        smtpPassword: data.smtpPassword ?? sharedPass,
        isDefault: data.isDefault ?? false,
        createdById: req.user!.id,
      },
    });
    res.status(201).json({ profile });
  } catch (err: any) {
    if (err?.code === "P2002") {
      return res.status(409).json({ error: "A sender with that name already exists for this organization" });
    }
    throw err;
  }
});

// PATCH /sending-profiles/:id — update
router.patch("/:id", requireRole(...ADMIN_ROLES), async (req, res) => {
  const parsed = updateSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const data = parsed.data;

  const existing = await prisma.sendingProfile.findUnique({ where: { id: req.params.id } });
  if (!existing) return res.status(404).json({ error: "Not found" });

  const orgId = getOrgId(req);
  if (orgId && existing.organizationId !== orgId) {
    return res.status(403).json({ error: "Insufficient permissions" });
  }
  if (!(await canManageOrg(req.user!.id, existing.organizationId ?? orgId ?? "", req.user!.role))) {
    return res.status(403).json({ error: "Insufficient permissions" });
  }

  if (data.isDefault) {
    await prisma.sendingProfile.updateMany({
      where: { organizationId: existing.organizationId, isDefault: true, id: { not: existing.id } },
      data: { isDefault: false },
    });
  }

  try {
    const profile = await prisma.sendingProfile.update({
      where: { id: existing.id },
      data: {
        ...(data.name !== undefined ? { name: data.name.trim() } : {}),
        ...(data.senderName !== undefined ? { senderName: data.senderName.trim() } : {}),
        ...(data.senderEmail !== undefined ? { senderEmail: data.senderEmail.trim() } : {}),
        // SMTP fields are display-only; leave them untouched on update so the
        // shared relay config isn't accidentally overwritten.
        ...(data.isDefault !== undefined ? { isDefault: data.isDefault } : {}),
      },
    });
    res.json({ profile });
  } catch (err: any) {
    if (err?.code === "P2002") {
      return res.status(409).json({ error: "A sender with that name already exists for this organization" });
    }
    throw err;
  }
});

// DELETE /sending-profiles/:id
router.delete("/:id", requireRole(...ADMIN_ROLES), async (req, res) => {
  const existing = await prisma.sendingProfile.findUnique({ where: { id: req.params.id } });
  if (!existing) return res.status(404).json({ error: "Not found" });
  const orgId = getOrgId(req);
  if (orgId && existing.organizationId !== orgId) {
    return res.status(403).json({ error: "Insufficient permissions" });
  }
  await prisma.sendingProfile.delete({ where: { id: existing.id } });
  res.status(204).send();
});

export default router;
