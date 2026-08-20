import { Router } from "express";
import crypto from "crypto";
import { z } from "zod";
import { MemberType, UserRole, UserStatus, ADMIN_ROLES } from "@novr/types";
import { prisma } from "@novr/db";
import { authenticate, requireRole } from "../middleware/auth";
import * as userService from "../services/userService";
import { enqueueAdminWelcomeEmail } from "../queues/emailQueue";

const router = Router();

router.use(authenticate);

const listQuerySchema = z.object({
  role: z.nativeEnum(UserRole).optional(),
  memberType: z.nativeEnum(MemberType).optional(),
  status: z.nativeEnum(UserStatus).optional(),
  search: z.string().optional(),
  page: z.coerce.number().int().positive().optional(),
  pageSize: z.coerce.number().int().positive().optional(),
});

// GET /users — admins/managers only (managers browsing their org).
// ORG_ADMIN/INSTITUTION_ADMIN see only their org's users.
router.get("/", requireRole(...ADMIN_ROLES, UserRole.MANAGER), async (req, res) => {
  const parsed = listQuerySchema.safeParse(req.query);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }

  const orgId = req.user!.role === UserRole.SUPER_ADMIN
    ? undefined
    : req.user!.organizationId;

  const result = await userService.listUsers({
    ...parsed.data,
    organizationId: orgId ?? null,
  });
  res.json(result);
});

// GET /users/lookup?email=... — any authenticated member, exact match only
// (see userService.lookupUserByEmail) — used to start a DM with someone.
router.get("/lookup", async (req, res) => {
  const parsed = z.object({ email: z.string().email() }).safeParse(req.query);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }
  const user = await userService.lookupUserByEmail(parsed.data.email);
  if (!user) return res.status(404).json({ error: "No member found with that email" });
  res.json(user);
});

// GET /users/:id — self, or admins/managers.
router.get("/:id", async (req, res) => {
  const isSelf = req.user!.id === req.params.id;
  const isPrivileged = [...ADMIN_ROLES, UserRole.MANAGER].includes(req.user!.role);
  if (!isSelf && !isPrivileged) {
    return res.status(403).json({ error: "Insufficient permissions" });
  }
  const user = await userService.getUserById(req.params.id);
  if (!user) return res.status(404).json({ error: "User not found" });
  res.json(user);
});

const createUserSchema = z.object({
  email: z.string().email(),
  name: z.string().min(1).optional(),
  role: z.nativeEnum(UserRole).optional(),
  memberType: z.nativeEnum(MemberType).optional(),
  managerId: z.string().optional(),
  password: z.string().min(8).optional(),
});

// POST /users — admins only.
// ORG_ADMIN creates users under their org with a generated temp password.
router.post("/", requireRole(...ADMIN_ROLES), async (req, res) => {
  const parsed = createUserSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }

  const orgId = req.user!.role === UserRole.SUPER_ADMIN
    ? req.body.organizationId
    : req.user!.organizationId;

  // Generate temp password if not provided
  const tempPassword = parsed.data.password || crypto.randomBytes(8).toString("base64url");

  try {
    const user = await userService.createUser({
      ...parsed.data,
      password: tempPassword,
      organizationId: orgId,
      mustChangePassword: !parsed.data.password,
    });

    // Send welcome email with temp password
    await enqueueAdminWelcomeEmail(user.id, tempPassword);

    res.status(201).json({
      ...user,
      tempPassword: !parsed.data.password ? tempPassword : undefined,
    });
  } catch (err: any) {
    if (err.message?.includes("already exists")) {
      return res.status(409).json({ error: err.message });
    }
    throw err;
  }
});

const updateUserSchema = z.object({
  name: z.string().min(1).optional(),
  role: z.nativeEnum(UserRole).optional(),
  memberType: z.nativeEnum(MemberType).optional(),
  status: z.nativeEnum(UserStatus).optional(),
  managerId: z.string().nullable().optional(),
  bio: z.string().optional(),
  location: z.string().optional(),
  openToWork: z.boolean().optional(),
});

// PATCH /users/:id — self may edit profile fields; only admins may change role/status.
router.patch("/:id", async (req, res) => {
  const isSelf = req.user!.id === req.params.id;
  const isAdmin = ADMIN_ROLES.includes(req.user!.role);
  if (!isSelf && !isAdmin) {
    return res.status(403).json({ error: "Insufficient permissions" });
  }

  const parsed = updateUserSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }

  const { role, status, managerId, ...profileFields } = parsed.data;
  if ((role || status || managerId !== undefined) && !isAdmin) {
    return res.status(403).json({ error: "Only admins can change role, status, or manager" });
  }

  const cleanData = Object.fromEntries(
    Object.entries(parsed.data).filter(([, v]) => v !== null)
  );
  const user = await userService.updateUser(req.params.id, cleanData);
  res.json(user);
});

// DELETE /users/:id — super/org admins only.
router.delete("/:id", requireRole(...ADMIN_ROLES), async (req, res) => {
  await userService.deleteUser(req.params.id);
  res.status(204).send();
});

const resetPasswordSchema = z.object({
  password: z.string().min(8),
});

// PATCH /users/:id/password — self or admins can reset password.
router.patch("/:id/password", async (req, res) => {
  const isSelf = req.user!.id === req.params.id;
  const isAdmin = ADMIN_ROLES.includes(req.user!.role);
  if (!isSelf && !isAdmin) {
    return res.status(403).json({ error: "Insufficient permissions" });
  }

  const parsed = resetPasswordSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }

  const bcrypt = await import("bcryptjs");
  const passwordHash = await bcrypt.default.hash(parsed.data.password, 10);

  await prisma.user.update({
    where: { id: req.params.id },
    data: { passwordHash, mustChangePassword: false } as any,
  });
  res.json({ success: true });
});

export default router;
