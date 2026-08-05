import { Router } from "express";
import { z } from "zod";
import { authenticate } from "../middleware/auth";
import * as mentorService from "../services/mentorService";

const router = Router();

router.use(authenticate);

router.get("/", async (req, res) => {
  const parsed = z.object({ topic: z.string().optional() }).safeParse(req.query);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }
  const mentors = await mentorService.listMentors(parsed.data);
  res.json({ mentors });
});

// GET /mentors/me — the current user's own mentor profile (opted in or not).
router.get("/me", async (req, res) => {
  const profile = await mentorService.getMentorProfile(req.user!.id);
  res.json(profile);
});

const upsertProfileSchema = z.object({
  topics: z.array(z.string().min(1)).min(1),
  availability: z.string().optional(),
  capacityPerMonth: z.number().int().positive().optional(),
  isActive: z.boolean().optional(),
});

router.put("/me", async (req, res) => {
  const parsed = upsertProfileSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }
  const profile = await mentorService.upsertMentorProfile(req.user!.id, parsed.data);
  res.json(profile);
});

router.get("/sessions", async (req, res) => {
  const sessions = await mentorService.listMySessions(req.user!.id);
  res.json(sessions);
});

const requestSessionSchema = z.object({
  mentorId: z.string(),
  topic: z.string().min(1).max(500),
  scheduledAt: z.coerce.date().optional(),
});

router.post("/sessions", async (req, res) => {
  const parsed = requestSessionSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }
  const session = await mentorService.requestSession({ ...parsed.data, menteeId: req.user!.id });
  res.status(201).json(session);
});

const respondSchema = z.object({ accept: z.boolean() });

router.post("/sessions/:id/respond", async (req, res) => {
  const parsed = respondSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }
  const session = await mentorService.respondToSession(req.params.id, req.user!.id, parsed.data.accept);
  res.json(session);
});

router.post("/sessions/:id/cancel", async (req, res) => {
  const session = await mentorService.cancelSession(req.params.id, req.user!.id);
  res.json(session);
});

const completeSchema = z.object({
  rating: z.number().int().min(1).max(5).optional(),
  feedback: z.string().max(2000).optional(),
});

router.post("/sessions/:id/complete", async (req, res) => {
  const parsed = completeSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }
  const session = await mentorService.completeSession(req.params.id, req.user!.id, parsed.data);
  res.json(session);
});

export default router;
