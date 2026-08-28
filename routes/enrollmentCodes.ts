import { Router } from "express";
import { z } from "zod";
import { ADMIN_ROLES, DiscountType } from "@novr/types";
import { authenticate, requireRole } from "../middleware/auth";
import * as enrollmentCodeService from "../services/enrollmentCodeService";

const router = Router();

router.use(authenticate, requireRole(...ADMIN_ROLES));

// GET /enrollment-codes — admin lists all codes with usedCount/maxUses,
// expiry status. Optionally scoped to one course via ?courseId=.
router.get("/", async (req, res) => {
  const courseId = typeof req.query.courseId === "string" ? req.query.courseId : undefined;
  const codes = courseId ? await enrollmentCodeService.listCodesForCourse(courseId) : await enrollmentCodeService.listCodes();
  res.json(codes);
});

const createSchema = z.object({
  code: z.string().min(3).optional(),
  courseId: z.string(),
  discountType: z.nativeEnum(DiscountType).optional(),
  discountValue: z.number().int().min(0).optional(),
  maxUses: z.number().int().positive().optional(),
  expiresAt: z.coerce.date().optional(),
});

// POST /enrollment-codes — admin creates a code. Auto-generates a short
// unique code (NOVR-XXXX-XXXX) if one isn't provided.
router.post("/", async (req, res) => {
  const parsed = createSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }
  const code = await enrollmentCodeService.createCode({ ...parsed.data, createdById: req.user!.id });
  res.status(201).json(code);
});

// DELETE /enrollment-codes/:id — deactivates a code (soft delete — usage history stays).
router.delete("/:id", async (req, res) => {
  await enrollmentCodeService.deactivateCode(req.params.id);
  res.status(204).send();
});

export default router;
