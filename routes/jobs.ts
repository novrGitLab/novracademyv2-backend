import { Router } from "express";
import { z } from "zod";
import { ADMIN_ROLES, JobListingStatus, JobLocationType } from "@novr/types";
import { authenticate, requireRole } from "../middleware/auth";
import * as jobService from "../services/jobService";

const router = Router();

router.use(authenticate);

router.get("/", async (req, res) => {
  const parsed = z.object({ status: z.nativeEnum(JobListingStatus).optional() }).safeParse(req.query);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }
  const isAdmin = ADMIN_ROLES.includes(req.user!.role);
  const listings = await jobService.listListings({
    status: isAdmin ? parsed.data.status : undefined,
    viewerRole: req.user!.role,
  });
  res.json({ listings });
});

const createListingSchema = z.object({
  title: z.string().min(1),
  company: z.string().min(1),
  locationType: z.nativeEnum(JobLocationType),
  location: z.string().optional(),
  link: z.string().url().optional(),
  description: z.string().optional(),
  expiresAt: z.coerce.date().optional(),
});

router.post("/", async (req, res) => {
  const parsed = createListingSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }
  const listing = await jobService.createListing({ ...parsed.data, postedById: req.user!.id });
  res.status(201).json(listing);
});

router.patch("/:id/status", requireRole(...ADMIN_ROLES), async (req, res) => {
  const parsed = z.object({ status: z.nativeEnum(JobListingStatus) }).safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }
  const listing = await jobService.updateListingStatus(req.params.id, parsed.data.status);
  res.json(listing);
});

router.patch("/:id/featured", requireRole(...ADMIN_ROLES), async (req, res) => {
  const parsed = z.object({ isFeatured: z.boolean() }).safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }
  const listing = await jobService.toggleFeatured(req.params.id, parsed.data.isFeatured);
  res.json(listing);
});

router.delete("/:id", async (req, res) => {
  const isAdmin = ADMIN_ROLES.includes(req.user!.role);
  await jobService.deleteListing(req.params.id, req.user!.id, isAdmin);
  res.status(204).send();
});

export default router;
