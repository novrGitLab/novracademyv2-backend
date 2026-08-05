"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const zod_1 = require("zod");
const types_1 = require("@novr/types");
const quizSanitize_1 = require("../lib/quizSanitize");
const auth_1 = require("../middleware/auth");
const aiAssistantService = __importStar(require("../services/aiAssistantService"));
const certificateService = __importStar(require("../services/certificateService"));
const courseService = __importStar(require("../services/courseService"));
const progressService = __importStar(require("../services/progressService"));
const enrollments_1 = __importDefault(require("./enrollments"));
const lessons_1 = __importDefault(require("./lessons"));
const router = (0, express_1.Router)();
router.use(auth_1.authenticate);
const listQuerySchema = zod_1.z.object({
    status: zod_1.z.nativeEnum(types_1.CourseStatus).optional(),
    search: zod_1.z.string().optional(),
    page: zod_1.z.coerce.number().int().positive().optional(),
    pageSize: zod_1.z.coerce.number().int().positive().optional(),
});
// GET /courses — learners see published only; admins can filter by any status.
router.get("/", async (req, res) => {
    const parsed = listQuerySchema.safeParse(req.query);
    if (!parsed.success) {
        return res.status(400).json({ error: parsed.error.flatten() });
    }
    const isAdmin = types_1.ADMIN_ROLES.includes(req.user.role);
    const status = isAdmin ? parsed.data.status : types_1.CourseStatus.PUBLISHED;
    const result = await courseService.listCourses({ ...parsed.data, status });
    res.json(result);
});
router.get("/:id", async (req, res) => {
    const course = await courseService.getCourseById(req.params.id);
    if (!course)
        return res.status(404).json({ error: "Course not found" });
    const isAdmin = types_1.ADMIN_ROLES.includes(req.user.role);
    if (course.status !== types_1.CourseStatus.PUBLISHED && !isAdmin) {
        return res.status(403).json({ error: "Course is not published" });
    }
    res.json((0, quizSanitize_1.sanitizeCourseForViewer)(course, isAdmin));
});
const createCourseSchema = zod_1.z.object({
    title: zod_1.z.string().min(1),
    description: zod_1.z.string().optional(),
    thumbnailUrl: zod_1.z.string().url().optional(),
    priceCents: zod_1.z.number().int().min(0).optional(),
    currency: zod_1.z.string().length(3).optional(),
    passMarkPct: zod_1.z.number().int().min(0).max(100).optional(),
    allowForwardScrub: zod_1.z.boolean().optional(),
    defaultValidityDays: zod_1.z.number().int().positive().optional(),
});
router.post("/", (0, auth_1.requireRole)(...types_1.ADMIN_ROLES), async (req, res) => {
    const parsed = createCourseSchema.safeParse(req.body);
    if (!parsed.success) {
        return res.status(400).json({ error: parsed.error.flatten() });
    }
    const course = await courseService.createCourse({ ...parsed.data, createdById: req.user.id });
    res.status(201).json(course);
});
const updateCourseSchema = createCourseSchema.partial().extend({
    status: zod_1.z.nativeEnum(types_1.CourseStatus).optional(),
});
router.patch("/:id", (0, auth_1.requireRole)(...types_1.ADMIN_ROLES), async (req, res) => {
    const parsed = updateCourseSchema.safeParse(req.body);
    if (!parsed.success) {
        return res.status(400).json({ error: parsed.error.flatten() });
    }
    const course = await courseService.updateCourse(req.params.id, parsed.data);
    res.json(course);
});
router.delete("/:id", (0, auth_1.requireRole)(...types_1.ADMIN_ROLES), async (req, res) => {
    await courseService.deleteCourse(req.params.id);
    res.status(204).send();
});
// GET /courses/:id/progress — per-lesson unlock/completion state for the
// current user's active enrollment.
router.get("/:id/progress", async (req, res) => {
    const progress = await progressService.getCourseProgress(req.user.id, req.params.id);
    res.json(progress);
});
// GET /courses/:id/certificate — the current user's own certificate for
// this course, if one has been issued yet (issuance is async via a queue,
// so this may 404 for a few seconds right after completing the course).
router.get("/:id/certificate", async (req, res) => {
    const certificate = await certificateService.getCertificateForEnrollment(req.user.id, req.params.id);
    if (!certificate)
        return res.status(404).json({ error: "No certificate issued yet" });
    res.json(certificate);
});
// GET /courses/:id/assistant/messages — the current user's own
// conversation history with the course-scoped AI assistant.
router.get("/:id/assistant/messages", async (req, res) => {
    const history = await aiAssistantService.getConversationHistory(req.user.id, req.params.id);
    res.json(history);
});
// POST /courses/:id/assistant/messages — ask the assistant a question.
// Scoped to this course's content via the system prompt (see
// anthropicService); enrollment is required, same as other course content.
const askSchema = zod_1.z.object({ question: zod_1.z.string().min(1).max(2000) });
router.post("/:id/assistant/messages", async (req, res) => {
    const parsed = askSchema.safeParse(req.body);
    if (!parsed.success) {
        return res.status(400).json({ error: parsed.error.flatten() });
    }
    const message = await aiAssistantService.askQuestion(req.user.id, req.params.id, parsed.data.question);
    res.status(201).json(message);
});
router.use("/:courseId/lessons", lessons_1.default);
router.use("/:courseId/enroll", enrollments_1.default);
exports.default = router;
