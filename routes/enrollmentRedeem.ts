import { Router } from "express";
import { z } from "zod";
import { authenticate } from "../middleware/auth";
import * as enrollmentCodeService from "../services/enrollmentCodeService";

const router = Router();

router.use(authenticate);

const redeemSchema = z.object({ code: z.string().min(1) });

// POST /enrollments/code — learner submits a code. FREE codes enroll
// immediately; PERCENTAGE/FIXED_AMOUNT codes return the discounted price
// for the payment flow (see routes/courses -> enrollments checkout, which
// accepts the returned codeId to apply the discount).
router.post("/code", async (req, res) => {
  const parsed = redeemSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }
  const result = await enrollmentCodeService.redeemCode(req.user!.id, parsed.data.code);
  res.status(result.enrolled ? 201 : 200).json(result);
});

export default router;
