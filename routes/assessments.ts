import { Router } from "express";
import { z } from "zod";
import { AssessmentScope, AssessmentType, QuestionType, UserRole } from "@novr/types";
import { authenticate, requireRole } from "../middleware/auth";
import * as assessmentService from "../services/assessmentService";

const router = Router();

router.use(authenticate);

const ASSESSMENT_ADMIN_ROLES: UserRole[] = [UserRole.SUPER_ADMIN, UserRole.ORG_ADMIN];

// GET /assessments — admins get the assessments they manage; everyone else
// gets the learner view (pending baseline, released closing, due monthly).
router.get("/", async (req, res) => {
  if (ASSESSMENT_ADMIN_ROLES.includes(req.user!.role)) {
    return res.json(await assessmentService.listAssessmentsForAdmin(req.user!));
  }
  res.json(await assessmentService.listAssessmentsForLearner(req.user!));
});

const createSchema = z.object({
  title: z.string().min(1),
  type: z.nativeEnum(AssessmentType),
  scope: z.nativeEnum(AssessmentScope).optional(),
  organizationId: z.string().nullable().optional(),
  scheduledFor: z.coerce.date().optional(),
  month: z.number().int().min(1).max(12).optional(),
  year: z.number().int().optional(),
});

router.post("/", requireRole(...ASSESSMENT_ADMIN_ROLES), async (req, res) => {
  const parsed = createSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }
  const assessment = await assessmentService.createAssessment(parsed.data, req.user!);
  res.status(201).json(assessment);
});

router.get("/:id", async (req, res) => {
  const assessment = await assessmentService.getAssessment(req.params.id);
  res.json(assessment);
});

const questionSchema = z.object({
  prompt: z.string().min(1),
  type: z.nativeEnum(QuestionType),
  options: z.unknown().optional(),
  correctAnswer: z.unknown(),
  points: z.number().int().positive().optional(),
});

router.post("/:id/questions", requireRole(...ASSESSMENT_ADMIN_ROLES), async (req, res) => {
  const parsed = questionSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }
  const question = await assessmentService.addQuestion(req.params.id, parsed.data);
  res.status(201).json(question);
});

const updateQuestionSchema = questionSchema.partial().extend({ order: z.number().int().optional() });

router.patch("/:id/questions/:qId", requireRole(...ASSESSMENT_ADMIN_ROLES), async (req, res) => {
  const parsed = updateQuestionSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }
  const question = await assessmentService.updateQuestion(req.params.qId, parsed.data);
  res.json(question);
});

router.delete("/:id/questions/:qId", requireRole(...ASSESSMENT_ADMIN_ROLES), async (req, res) => {
  await assessmentService.deleteQuestion(req.params.qId);
  res.status(204).send();
});

// POST /assessments/:id/release — admin manually releases the CLOSING pass
// (same Assessment record as BASELINE) to a user or a whole cohort.
const releaseSchema = z.object({ userId: z.string().optional(), cohortId: z.string().optional() });

router.post("/:id/release", requireRole(...ASSESSMENT_ADMIN_ROLES), async (req, res) => {
  const parsed = releaseSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }
  const release = await assessmentService.releaseClosing(req.params.id, parsed.data);
  res.status(201).json(release);
});

const attemptSchema = z.object({
  type: z.nativeEnum(AssessmentType).optional(),
  answers: z.record(z.unknown()),
});

router.post("/:id/attempt", async (req, res) => {
  const parsed = attemptSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }
  const result = await assessmentService.submitAttempt(req.params.id, req.user!, {
    type: parsed.data.type ?? AssessmentType.BASELINE,
    answers: parsed.data.answers,
  });
  res.status(201).json(result);
});

router.get("/:id/results", async (req, res) => {
  const results = await assessmentService.getResults(req.params.id, req.user!);
  res.json(results);
});

export default router;
