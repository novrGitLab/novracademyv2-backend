import { Router } from "express";
import { prisma } from "@novr/db";
import { authenticate } from "../middleware/auth";

const router = Router();

// Read-only for now — full badge management (create/edit, auto-award
// triggers) is Phase 6.
router.get("/", authenticate, async (_req, res) => {
  const badges = await prisma.badge.findMany({ orderBy: { name: "asc" } });
  res.json({ badges });
});

export default router;
