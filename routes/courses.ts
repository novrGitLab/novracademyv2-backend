import { Router } from "express";
import { z } from "zod";
import { ADMIN_ROLES, CourseStatus } from "@novr/types";
import { sanitizeCourseForViewer } from "../lib/quizSanitize";
import { authenticate, requireRole } from "../middleware/auth";
import * as aiAssistantService from "../services/aiAssistantService";
import * as certificateService from "../services/certificateService";
import * as courseService from "../services/courseService";
import * as progressService from "../services/progressService";
import enrollmentsRouter from "./enrollments";
import lessonsRouter from "./lessons";

const router = Router();

router.use(authenticate);

const listQuerySchema = z.object({
  status: z.nativeEnum(CourseStatus).optional(),
  search: z.string().optional(),
  page: z.coerce.number().int().positive().optional(),
  pageSize: z.coerce.number().int().positive().optional(),
});

// GET /courses — learners see published only; admins can filter by any status.
router.get("/", async (req, res) => {
  const parsed = listQuerySchema.safeParse(req.query);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }

  const isAdmin = ADMIN_ROLES.includes(req.user!.role);
  const status = isAdmin ? parsed.data.status : CourseStatus.PUBLISHED;

  const result = await courseService.listCourses({ ...parsed.data, status });
  res.json(result);
});

router.get("/:id", async (req, res) => {
  const course = await courseService.getCourseById(req.params.id);
  if (!course) return res.status(404).json({ error: "Course not found" });

  const isAdmin = ADMIN_ROLES.includes(req.user!.role);
  if (course.status !== CourseStatus.PUBLISHED && !isAdmin) {
    return res.status(403).json({ error: "Course is not published" });
  }
  res.json(sanitizeCourseForViewer(course, isAdmin));
});

const createCourseSchema = z.object({
  title: z.string().min(1),
  description: z.string().optional(),
  thumbnailUrl: z.string().url().optional(),
  priceCents: z.number().int().min(0).optional(),
  currency: z.string().length(3).optional(),
  passMarkPct: z.number().int().min(0).max(100).optional(),
  allowForwardScrub: z.boolean().optional(),
  defaultValidityDays: z.number().int().positive().optional(),
});

router.post("/", requireRole(...ADMIN_ROLES), async (req, res) => {
  const parsed = createCourseSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }
  const course = await courseService.createCourse({ ...parsed.data, createdById: req.user!.id });
  res.status(201).json(course);
});

const updateCourseSchema = createCourseSchema.partial().extend({
  status: z.nativeEnum(CourseStatus).optional(),
});

router.patch("/:id", requireRole(...ADMIN_ROLES), async (req, res) => {
  const parsed = updateCourseSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }
  const course = await courseService.updateCourse(req.params.id, parsed.data);
  res.json(course);
});

router.delete("/:id", requireRole(...ADMIN_ROLES), async (req, res) => {
  await courseService.deleteCourse(req.params.id);
  res.status(204).send();
});

// GET /courses/:id/progress — per-lesson unlock/completion state for the
// current user's active enrollment.
router.get("/:id/progress", async (req, res) => {
  const progress = await progressService.getCourseProgress(req.user!.id, req.params.id);
  res.json(progress);
});

// GET /courses/:id/certificate — the current user's own certificate for
// this course, if one has been issued yet (issuance is async via a queue,
// so this may 404 for a few seconds right after completing the course).
router.get("/:id/certificate", async (req, res) => {
  const certificate = await certificateService.getCertificateForEnrollment(req.user!.id, req.params.id);
  if (!certificate) return res.status(404).json({ error: "No certificate issued yet" });
  res.json(certificate);
});

// GET /courses/:id/assistant/messages — the current user's own
// conversation history with the course-scoped AI assistant.
router.get("/:id/assistant/messages", async (req, res) => {
  const history = await aiAssistantService.getConversationHistory(req.user!.id, req.params.id);
  res.json(history);
});

// POST /courses/:id/assistant/messages — ask the assistant a question.
// Scoped to this course's content via the system prompt (see
// anthropicService); enrollment is required, same as other course content.
const askSchema = z.object({ question: z.string().min(1).max(2000) });

router.post("/:id/assistant/messages", async (req, res) => {
  const parsed = askSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }
  const message = await aiAssistantService.askQuestion(req.user!.id, req.params.id, parsed.data.question);
  res.status(201).json(message);
});

router.use("/:courseId/lessons", lessonsRouter);
router.use("/:courseId/enroll", enrollmentsRouter);

export default router;
