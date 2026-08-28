import { Router } from "express";
import { authenticate } from "../middleware/auth";
import {
  getUserGamification,
  getLeaderboard,
  getAllBadgesWithStatus,
} from "../services/gamificationService";
import { prisma } from "@novr/db";

const router = Router();
router.use(authenticate);

router.get("/me", async (req, res) => {
  const data = await getUserGamification(req.user!.id);
  res.json(data);
});

router.get("/leaderboard", async (req, res) => {
  const limit = Math.min(100, Math.max(1, parseInt(req.query.limit as string) || 50));
  const offset = Math.max(0, parseInt(req.query.offset as string) || 0);
  const entries = await getLeaderboard(limit, offset);
  const total = await prisma.user.count({ where: { role: "LEARNER" } });
  res.json({ entries, total, limit, offset });
});

router.get("/badges", async (req, res) => {
  const badges = await getAllBadgesWithStatus(req.user!.id);
  res.json({ badges });
});

router.get("/xp-log", async (req, res) => {
  const limit = Math.min(100, Math.max(1, parseInt(req.query.limit as string) || 20));
  const logs = await prisma.xpLog.findMany({
    where: { userId: req.user!.id },
    orderBy: { createdAt: "desc" },
    take: limit,
  });
  res.json({ logs });
});

export default router;
