import { Router } from "express";
import { z } from "zod";
import { ADMIN_ROLES } from "@novr/types";
import { authenticate, requireRole } from "../middleware/auth";
import * as cohortService from "../services/cohortService";

const router = Router();

router.use(authenticate, requireRole(...ADMIN_ROLES));

router.get("/", async (_req, res) => {
  const cohorts = await cohortService.listCohorts();
  res.json({ cohorts });
});

router.get("/:id", async (req, res) => {
  const cohort = await cohortService.getCohortById(req.params.id);
  if (!cohort) return res.status(404).json({ error: "Cohort not found" });
  res.json(cohort);
});

const createCohortSchema = z.object({
  name: z.string().min(1),
  year: z.number().int().positive().optional(),
  description: z.string().optional(),
});

router.post("/", async (req, res) => {
  const parsed = createCohortSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }
  const cohort = await cohortService.createCohort(parsed.data);
  res.status(201).json(cohort);
});

const updateCohortSchema = createCohortSchema.partial();

router.patch("/:id", async (req, res) => {
  const parsed = updateCohortSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }
  const cohort = await cohortService.updateCohort(req.params.id, parsed.data);
  res.json(cohort);
});

router.delete("/:id", async (req, res) => {
  await cohortService.deleteCohort(req.params.id);
  res.status(204).send();
});

export default router;
