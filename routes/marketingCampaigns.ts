import { Router } from "express";
import { z } from "zod";
import { ADMIN_ROLES } from "@novr/types";
import { authenticate, requireRole } from "../middleware/auth";
import * as marketingCampaignService from "../services/marketingCampaignService";

const router = Router();

router.use(authenticate, requireRole(...ADMIN_ROLES));

router.get("/", async (_req, res) => {
  const campaigns = await marketingCampaignService.listCampaigns();
  res.json(campaigns);
});

router.get("/:id", async (req, res) => {
  const campaign = await marketingCampaignService.getCampaign(req.params.id);
  res.json(campaign);
});

const createSchema = z.object({
  title: z.string().min(1),
  subject: z.string().min(1),
  bodyHtml: z.string().min(1),
  scheduledAt: z.coerce.date().optional(),
});

router.post("/", async (req, res) => {
  const parsed = createSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }
  const campaign = await marketingCampaignService.createCampaign({ ...parsed.data, createdById: req.user!.id });
  res.status(201).json(campaign);
});

const updateSchema = z.object({
  title: z.string().min(1).optional(),
  subject: z.string().min(1).optional(),
  bodyHtml: z.string().min(1).optional(),
  scheduledAt: z.coerce.date().nullable().optional(),
});

router.patch("/:id", async (req, res) => {
  const parsed = updateSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }
  const campaign = await marketingCampaignService.updateCampaign(req.params.id, parsed.data);
  res.json(campaign);
});

// POST /marketing-campaigns/:id/send — sends immediately to all ACTIVE
// subscribers (queued via BullMQ if REDIS_URL is set, otherwise inline).
router.post("/:id/send", async (req, res) => {
  const campaign = await marketingCampaignService.sendCampaignNow(req.params.id);
  res.json(campaign);
});

router.delete("/:id", async (req, res) => {
  await marketingCampaignService.deleteCampaign(req.params.id);
  res.status(204).send();
});

export default router;
