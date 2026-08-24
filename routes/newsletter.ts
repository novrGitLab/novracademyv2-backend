import { Router } from "express";
import { z } from "zod";
import { ADMIN_ROLES } from "@novr/types";
import { authenticate, requireRole } from "../middleware/auth";
import * as newsletterService from "../services/newsletterService";

const router = Router();

const subscribeSchema = z.object({
  email: z.string().email(),
  firstName: z.string().optional(),
  lastName: z.string().optional(),
});

// POST /newsletter/subscribe — public, no auth. Meant for the marketing
// website's embedded signup form.
router.post("/subscribe", async (req, res) => {
  const parsed = subscribeSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }
  const subscriber = await newsletterService.subscribe(parsed.data);
  res.status(201).json({ id: subscriber.id, email: subscriber.email });
});

// DELETE /newsletter/unsubscribe?token=xxx — public. The token is the
// subscriber's unique unsubscribeToken, embedded in every campaign email's
// footer link (see emailService.sendMarketingCampaignBatch). The frontend's
// /unsubscribe page is what learners actually click through to, and it
// calls this endpoint on their behalf.
router.delete("/unsubscribe", async (req, res) => {
  const parsed = z.object({ token: z.string().min(1) }).safeParse(req.query);
  if (!parsed.success) {
    return res.status(400).json({ error: "Missing or invalid token" });
  }
  await newsletterService.unsubscribeByToken(parsed.data.token);
  res.json({ success: true });
});

router.use(authenticate, requireRole(...ADMIN_ROLES));

const listQuerySchema = z.object({
  search: z.string().optional(),
  page: z.coerce.number().int().positive().optional(),
  pageSize: z.coerce.number().int().positive().optional(),
});

// GET /newsletter/subscribers — admin only, paginated + searchable.
router.get("/subscribers", async (req, res) => {
  const parsed = listQuerySchema.safeParse(req.query);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }
  const result = await newsletterService.listSubscribers(parsed.data);
  res.json(result);
});

// POST /newsletter/subscribers — admin manually adds one subscriber.
router.post("/subscribers", async (req, res) => {
  const parsed = subscribeSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }
  const subscriber = await newsletterService.addSubscriberManually(parsed.data);
  res.status(201).json(subscriber);
});

const importSchema = z.object({
  rows: z
    .array(
      z.object({
        email: z.string(),
        firstName: z.string().optional(),
        lastName: z.string().optional(),
      })
    )
    .min(1),
});

// POST /newsletter/subscribers/import — admin bulk CSV import. Rows are
// parsed client-side and posted as JSON, same pattern as alumni import.
router.post("/subscribers/import", async (req, res) => {
  const parsed = importSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }
  const result = await newsletterService.importSubscribers(parsed.data.rows);
  res.status(201).json(result);
});

export default router;
