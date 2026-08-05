import { Router } from "express";
import { z } from "zod";
import { ADMIN_ROLES } from "@novr/types";
import { authenticate, requireRole } from "../middleware/auth";
import * as notificationService from "../services/notificationService";

const router = Router();

router.use(authenticate);

router.get("/", async (req, res) => {
  const notifications = await notificationService.listMyNotifications(req.user!.id);
  res.json({ notifications });
});

router.get("/unread-count", async (req, res) => {
  const count = await notificationService.getUnreadCount(req.user!.id);
  res.json({ count });
});

router.post("/:id/read", async (req, res) => {
  await notificationService.markNotificationRead(req.params.id, req.user!.id);
  res.status(204).send();
});

router.post("/read-all", async (req, res) => {
  await notificationService.markAllRead(req.user!.id);
  res.status(204).send();
});

const composeSchema = z.object({
  segment: z.enum(["all", "inactive", "mentors", "open_to_work"]),
  title: z.string().min(1).max(200),
  content: z.string().min(1).max(5000),
  channels: z.array(z.enum(["in_app", "email"])).min(1),
});

router.post("/compose", requireRole(...ADMIN_ROLES), async (req, res) => {
  const parsed = composeSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }
  const result = await notificationService.composeToSegment(parsed.data);
  res.status(201).json(result);
});

router.get("/history", requireRole(...ADMIN_ROLES), async (_req, res) => {
  const history = await notificationService.getNotificationHistory();
  res.json({ history });
});

export default router;
