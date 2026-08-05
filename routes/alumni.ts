import { Router } from "express";
import { z } from "zod";
import { ADMIN_ROLES } from "@novr/types";
import { authenticate, optionalAuthenticate, requireRole } from "../middleware/auth";
import * as alumniService from "../services/alumniService";

const router = Router();

const recordSchema = z.object({
  fullName: z.string().min(1),
  email: z.string().email().optional(),
  phone: z.string().optional(),
  courseName: z.string().min(1),
  completionDate: z.coerce.date().optional(),
  score: z.number().optional(),
  cohortLabel: z.string().optional(),
});

// POST /alumni/import — admin, bulk CSV import (rows parsed client-side, posted as JSON).
router.post("/import", authenticate, requireRole(...ADMIN_ROLES), async (req, res) => {
  const parsed = z.object({ records: z.array(recordSchema).min(1) }).safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }
  const result = await alumniService.importAlumniRecords(parsed.data.records);
  res.status(201).json(result);
});

// POST /alumni — admin, manual single-record entry for edge cases.
router.post("/", authenticate, requireRole(...ADMIN_ROLES), async (req, res) => {
  const parsed = recordSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }
  const record = await alumniService.createManualRecord(parsed.data);
  res.status(201).json(record);
});

const listQuerySchema = z.object({
  claimed: z.enum(["true", "false"]).transform((v) => v === "true").optional(),
  search: z.string().optional(),
  page: z.coerce.number().int().positive().optional(),
  pageSize: z.coerce.number().int().positive().optional(),
});

// GET /alumni — admin listing.
router.get("/", authenticate, requireRole(...ADMIN_ROLES), async (req, res) => {
  const parsed = listQuerySchema.safeParse(req.query);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }
  const result = await alumniService.listAlumniRecords(parsed.data);
  res.json(result);
});

// GET /alumni/claim/:token — public, no auth: the claim landing page needs
// this before the visitor necessarily has an account.
router.get("/claim/:token", async (req, res) => {
  const info = await alumniService.getClaimInfo(req.params.token);
  res.json(info);
});

const claimSchema = z.object({
  claimToken: z.string(),
  password: z.string().min(8).optional(),
});

// POST /alumni/claim — optionalAuthenticate: an anonymous visitor can claim
// a record with no existing account (creates one), but linking to an
// *existing* account requires being logged in as that same email.
router.post("/claim", optionalAuthenticate, async (req, res) => {
  const parsed = claimSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }
  const user = await alumniService.claimRecord({ ...parsed.data, requestingUserEmail: req.user?.email });
  res.json({ userId: user.id, email: user.email });
});

export default router;
