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
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const zod_1 = require("zod");
const types_1 = require("@novr/types");
const errors_1 = require("../lib/errors");
const quizSanitize_1 = require("../lib/quizSanitize");
const auth_1 = require("../middleware/auth");
const emailQueue_1 = require("../queues/emailQueue");
const dailyService = __importStar(require("../services/dailyService"));
const lessonService = __importStar(require("../services/lessonService"));
const liveAttendanceService = __importStar(require("../services/liveAttendanceService"));
const muxService = __importStar(require("../services/muxService"));
const progressService = __importStar(require("../services/progressService"));
const quizAttemptService = __importStar(require("../services/quizAttemptService"));
const quizService = __importStar(require("../services/quizService"));
const r2Service = __importStar(require("../services/r2Service"));
const router = (0, express_1.Router)({ mergeParams: true });
// mergeParams: true brings `courseId` in at runtime from the parent
// /courses router, but Express's route-string type inference only sees
// this sub-router's own patterns, so it isn't reflected in req.params'
// type. Read it through this small helper instead of casting inline
// everywhere.
function courseIdOf(req) {
    return req.params.courseId;
}
// GET /courses/:courseId/lessons/:lessonId — authenticate is already applied
// by the parent /courses router.
router.get("/:lessonId", async (req, res) => {
    const lesson = await lessonService.getLessonById(req.params.lessonId);
    if (!lesson || lesson.courseId !== courseIdOf(req)) {
        return res.status(404).json({ error: "Lesson not found" });
    }
    const isAdmin = types_1.ADMIN_ROLES.includes(req.user.role);
    res.json((0, quizSanitize_1.sanitizeLessonForViewer)(lesson, isAdmin));
});
const createLessonSchema = zod_1.z.object({
    title: zod_1.z.string().min(1),
    type: zod_1.z.nativeEnum(types_1.LessonType),
    contentUrl: zod_1.z.string().url().optional(),
    minWatchPct: zod_1.z.number().int().min(0).max(100).optional(),
    durationSeconds: zod_1.z.number().int().positive().optional(),
    liveScheduledAt: zod_1.z.coerce.date().optional(),
    liveMeetingUrl: zod_1.z.string().url().optional(),
    quizPassMarkPct: zod_1.z.number().int().min(0).max(100).optional(),
    quizMaxAttempts: zod_1.z.number().int().positive().optional(),
});
router.post("/", (0, auth_1.requireRole)(...types_1.ADMIN_ROLES), async (req, res) => {
    const parsed = createLessonSchema.safeParse(req.body);
    if (!parsed.success) {
        return res.status(400).json({ error: parsed.error.flatten() });
    }
    const lesson = await lessonService.createLesson({
        courseId: courseIdOf(req),
        ...parsed.data,
    });
    res.status(201).json(lesson);
});
const updateLessonSchema = zod_1.z.object({
    title: zod_1.z.string().min(1).optional(),
    contentUrl: zod_1.z.string().url().optional(),
    minWatchPct: zod_1.z.number().int().min(0).max(100).optional(),
    durationSeconds: zod_1.z.number().int().positive().optional(),
    liveScheduledAt: zod_1.z.coerce.date().nullable().optional(),
    liveMeetingUrl: zod_1.z.string().url().optional(),
    pdfAllowDownload: zod_1.z.boolean().optional(),
});
router.patch("/:lessonId", (0, auth_1.requireRole)(...types_1.ADMIN_ROLES), async (req, res) => {
    const parsed = updateLessonSchema.safeParse(req.body);
    if (!parsed.success) {
        return res.status(400).json({ error: parsed.error.flatten() });
    }
    const lesson = await lessonService.updateLesson(req.params.lessonId, parsed.data);
    res.json(lesson);
});
router.delete("/:lessonId", (0, auth_1.requireRole)(...types_1.ADMIN_ROLES), async (req, res) => {
    await lessonService.deleteLesson(req.params.lessonId);
    res.status(204).send();
});
// POST /courses/:courseId/lessons/:lessonId/video/upload-url — admin only.
// Creates a Mux direct upload and returns the URL the browser should PUT
// the video file to. The resulting asset is linked back via webhook.
router.post("/:lessonId/video/upload-url", (0, auth_1.requireRole)(...types_1.ADMIN_ROLES), async (req, res) => {
    const lesson = await lessonService.getLessonById(req.params.lessonId);
    if (!lesson || lesson.courseId !== courseIdOf(req)) {
        return res.status(404).json({ error: "Lesson not found" });
    }
    if (lesson.type !== types_1.LessonType.VIDEO) {
        return res.status(400).json({ error: "Lesson is not a video lesson" });
    }
    const result = await muxService.createDirectUpload(lesson.id);
    if (!result) {
        return res.status(503).json({ error: "Video upload is not configured" });
    }
    await lessonService.setLessonUpload(lesson.id, result.uploadId);
    res.status(201).json({ uploadId: result.uploadId, uploadUrl: result.uploadUrl });
});
// GET /courses/:courseId/lessons/:lessonId/video/playback-token — any
// enrolled + unlocked learner. Mints a short-lived signed Mux playback
// token; the raw playback ID alone can't stream the signed-policy asset.
router.get("/:lessonId/video/playback-token", async (req, res) => {
    const lesson = await lessonService.getLessonById(req.params.lessonId);
    if (!lesson || lesson.courseId !== courseIdOf(req)) {
        throw new errors_1.NotFoundError("Lesson not found");
    }
    if (lesson.type !== types_1.LessonType.VIDEO || !lesson.muxPlaybackId) {
        return res.status(400).json({ error: "Lesson has no ready video" });
    }
    // Enforces enrollment + lesson-unlock before handing out a token.
    const progress = await progressService.getCourseProgress(req.user.id, courseIdOf(req));
    const entry = progress.lessons.find((l) => l.lessonId === lesson.id);
    if (!entry?.unlocked) {
        return res.status(403).json({ error: "Complete the previous lesson first" });
    }
    const token = await muxService.signPlaybackId(lesson.muxPlaybackId);
    res.json({ playbackId: lesson.muxPlaybackId, token });
});
// POST /courses/:courseId/lessons/:lessonId/heartbeat — learner's player
// reports playback position roughly every 5s. Server clamps/validates and
// is the sole source of truth for watchPct and lesson completion.
const heartbeatSchema = zod_1.z.object({
    positionSeconds: zod_1.z.number().min(0),
    durationSeconds: zod_1.z.number().positive(),
});
router.post("/:lessonId/heartbeat", async (req, res) => {
    const parsed = heartbeatSchema.safeParse(req.body);
    if (!parsed.success) {
        return res.status(400).json({ error: parsed.error.flatten() });
    }
    const progress = await progressService.recordHeartbeat({
        userId: req.user.id,
        courseId: courseIdOf(req),
        lessonId: req.params.lessonId,
        ...parsed.data,
    });
    res.json(progress);
});
// POST /courses/:courseId/lessons/:lessonId/pdf/upload-url — admin only.
// Presigned R2 PUT URL; the browser uploads the PDF straight to R2.
router.post("/:lessonId/pdf/upload-url", (0, auth_1.requireRole)(...types_1.ADMIN_ROLES), async (req, res) => {
    const lesson = await lessonService.getLessonById(req.params.lessonId);
    if (!lesson || lesson.courseId !== courseIdOf(req)) {
        throw new errors_1.NotFoundError("Lesson not found");
    }
    if (lesson.type !== types_1.LessonType.PDF) {
        return res.status(400).json({ error: "Lesson is not a PDF lesson" });
    }
    const result = await r2Service.createPdfUploadUrl(lesson.id);
    if (!result) {
        return res.status(503).json({ error: "File storage is not configured" });
    }
    await lessonService.setLessonPdfKey(lesson.id, result.key);
    res.status(201).json({ uploadUrl: result.uploadUrl });
});
// GET /courses/:courseId/lessons/:lessonId/pdf/view-url — any enrolled +
// unlocked learner. Short-lived presigned GET URL for in-browser viewing.
router.get("/:lessonId/pdf/view-url", async (req, res) => {
    const lesson = await lessonService.getLessonById(req.params.lessonId);
    if (!lesson || lesson.courseId !== courseIdOf(req)) {
        throw new errors_1.NotFoundError("Lesson not found");
    }
    if (lesson.type !== types_1.LessonType.PDF || !lesson.contentUrl) {
        return res.status(400).json({ error: "Lesson has no uploaded PDF" });
    }
    const isAdmin = types_1.ADMIN_ROLES.includes(req.user.role);
    if (!isAdmin) {
        const progress = await progressService.getCourseProgress(req.user.id, courseIdOf(req));
        const entry = progress.lessons.find((l) => l.lessonId === lesson.id);
        if (!entry?.unlocked) {
            return res.status(403).json({ error: "Complete the previous lesson first" });
        }
    }
    const viewUrl = await r2Service.createPdfViewUrl(lesson.contentUrl);
    res.json({ viewUrl, allowDownload: lesson.pdfAllowDownload });
});
// POST /courses/:courseId/lessons/:lessonId/pdf/complete — learner marks
// the PDF as read (called once the viewer reaches the last page).
router.post("/:lessonId/pdf/complete", async (req, res) => {
    const progress = await progressService.markPdfLessonComplete(req.user.id, courseIdOf(req), req.params.lessonId);
    res.json(progress);
});
// PATCH /courses/:courseId/lessons/:lessonId/quiz — admin only.
const updateQuizSettingsSchema = zod_1.z.object({
    title: zod_1.z.string().min(1).optional(),
    passMarkPct: zod_1.z.number().int().min(0).max(100).optional(),
    maxAttempts: zod_1.z.number().int().positive().optional(),
});
router.patch("/:lessonId/quiz", (0, auth_1.requireRole)(...types_1.ADMIN_ROLES), async (req, res) => {
    const parsed = updateQuizSettingsSchema.safeParse(req.body);
    if (!parsed.success) {
        return res.status(400).json({ error: parsed.error.flatten() });
    }
    const quiz = await quizService.updateQuizSettings(req.params.lessonId, parsed.data);
    res.json(quiz);
});
// Correct-answer shape is validated per question type so authoring can't
// save a quiz that the scoring engine (item 6) wouldn't be able to grade.
const questionSchema = zod_1.z
    .discriminatedUnion("type", [
    zod_1.z.object({
        type: zod_1.z.literal(types_1.QuestionType.MULTIPLE_CHOICE),
        prompt: zod_1.z.string().min(1),
        options: zod_1.z.array(zod_1.z.string().min(1)).min(2),
        correctAnswer: zod_1.z.number().int().min(0),
        points: zod_1.z.number().int().positive().optional(),
    }),
    zod_1.z.object({
        type: zod_1.z.literal(types_1.QuestionType.TRUE_FALSE),
        prompt: zod_1.z.string().min(1),
        correctAnswer: zod_1.z.boolean(),
        points: zod_1.z.number().int().positive().optional(),
    }),
    zod_1.z.object({
        type: zod_1.z.literal(types_1.QuestionType.SHORT_ANSWER),
        prompt: zod_1.z.string().min(1),
        correctAnswer: zod_1.z.string().min(1),
        points: zod_1.z.number().int().positive().optional(),
    }),
])
    .refine((q) => q.type !== types_1.QuestionType.MULTIPLE_CHOICE || q.correctAnswer < q.options.length, { message: "correctAnswer must be a valid index into options", path: ["correctAnswer"] });
router.post("/:lessonId/quiz/questions", (0, auth_1.requireRole)(...types_1.ADMIN_ROLES), async (req, res) => {
    const parsed = questionSchema.safeParse(req.body);
    if (!parsed.success) {
        return res.status(400).json({ error: parsed.error.flatten() });
    }
    const { type, prompt, points, correctAnswer } = parsed.data;
    const options = "options" in parsed.data ? parsed.data.options : undefined;
    const question = await quizService.createQuestion(req.params.lessonId, {
        type,
        prompt,
        points,
        options,
        correctAnswer,
    });
    res.status(201).json(question);
});
const updateQuestionSchema = zod_1.z.object({
    prompt: zod_1.z.string().min(1).optional(),
    options: zod_1.z.array(zod_1.z.string().min(1)).min(2).optional(),
    correctAnswer: zod_1.z.union([zod_1.z.number().int().min(0), zod_1.z.boolean(), zod_1.z.string().min(1)]).optional(),
    points: zod_1.z.number().int().positive().optional(),
});
router.patch("/:lessonId/quiz/questions/:questionId", (0, auth_1.requireRole)(...types_1.ADMIN_ROLES), async (req, res) => {
    const parsed = updateQuestionSchema.safeParse(req.body);
    if (!parsed.success) {
        return res.status(400).json({ error: parsed.error.flatten() });
    }
    const question = await quizService.updateQuestion(req.params.questionId, parsed.data);
    res.json(question);
});
router.delete("/:lessonId/quiz/questions/:questionId", (0, auth_1.requireRole)(...types_1.ADMIN_ROLES), async (req, res) => {
    await quizService.deleteQuestion(req.params.questionId);
    res.status(204).send();
});
router.post("/:lessonId/quiz/questions/:questionId/reorder", (0, auth_1.requireRole)(...types_1.ADMIN_ROLES), async (req, res) => {
    const direction = req.body?.direction;
    if (direction !== "up" && direction !== "down") {
        return res.status(400).json({ error: "direction must be 'up' or 'down'" });
    }
    const question = await quizService.reorderQuestion(req.params.questionId, direction);
    res.json(question);
});
// GET /courses/:courseId/lessons/:lessonId/quiz/attempts — current user's
// own attempt history for this quiz (score/pass per attempt, no answers).
router.get("/:lessonId/quiz/attempts", async (req, res) => {
    const quiz = await quizService.getQuizByLessonId(req.params.lessonId);
    if (!quiz)
        throw new errors_1.NotFoundError("This lesson has no quiz");
    const attempts = await quizAttemptService.getAttemptHistory(req.user.id, quiz.id);
    res.json({ attempts, maxAttempts: quiz.maxAttempts, passMarkPct: quiz.passMarkPct });
});
// POST /courses/:courseId/lessons/:lessonId/quiz/attempts — learner submits
// all answers in one call. Scoring happens entirely server-side (see
// quizAttemptService); the response never includes correct answers, only a
// per-question correct/incorrect flag plus the aggregate score.
const submitAttemptSchema = zod_1.z.object({
    answers: zod_1.z.record(zod_1.z.string(), zod_1.z.union([zod_1.z.number(), zod_1.z.boolean(), zod_1.z.string()])),
});
router.post("/:lessonId/quiz/attempts", async (req, res) => {
    const parsed = submitAttemptSchema.safeParse(req.body);
    if (!parsed.success) {
        return res.status(400).json({ error: parsed.error.flatten() });
    }
    const result = await quizAttemptService.submitAttempt({
        userId: req.user.id,
        courseId: courseIdOf(req),
        lessonId: req.params.lessonId,
        answers: parsed.data.answers,
    });
    res.status(201).json(result);
});
// PATCH /courses/:courseId/lessons/:lessonId/live — admin only. Schedules
// (and creates, if needed) the Daily.co room for this live lesson.
const scheduleLiveSchema = zod_1.z.object({ liveScheduledAt: zod_1.z.coerce.date() });
router.patch("/:lessonId/live", (0, auth_1.requireRole)(...types_1.ADMIN_ROLES), async (req, res) => {
    const parsed = scheduleLiveSchema.safeParse(req.body);
    if (!parsed.success) {
        return res.status(400).json({ error: parsed.error.flatten() });
    }
    const lesson = await lessonService.getLessonById(req.params.lessonId);
    if (!lesson || lesson.courseId !== courseIdOf(req))
        throw new errors_1.NotFoundError("Lesson not found");
    if (lesson.type !== types_1.LessonType.LIVE) {
        return res.status(400).json({ error: "Lesson is not a live class" });
    }
    const room = await dailyService.createRoom(lesson.id, parsed.data.liveScheduledAt);
    if (!room) {
        return res.status(503).json({ error: "Live classes are not configured" });
    }
    const updated = await lessonService.setLessonLiveRoom(lesson.id, {
        dailyRoomName: room.name,
        liveMeetingUrl: room.url,
        liveScheduledAt: parsed.data.liveScheduledAt,
    });
    (0, emailQueue_1.enqueueLiveClassReminders)(lesson.id, parsed.data.liveScheduledAt);
    res.json(updated);
});
// GET /courses/:courseId/lessons/:lessonId/live/join — enrolled + unlocked
// learner, or admin. Mints a per-user Daily.co meeting token; attendance
// is tracked from Daily's participant-joined webhook, not from this call.
router.get("/:lessonId/live/join", async (req, res) => {
    const lesson = await lessonService.getLessonById(req.params.lessonId);
    if (!lesson || lesson.courseId !== courseIdOf(req))
        throw new errors_1.NotFoundError("Lesson not found");
    if (lesson.type !== types_1.LessonType.LIVE || !lesson.dailyRoomName) {
        return res.status(400).json({ error: "This live class has not been scheduled yet" });
    }
    const isAdmin = types_1.ADMIN_ROLES.includes(req.user.role);
    if (!isAdmin) {
        const progress = await progressService.getCourseProgress(req.user.id, courseIdOf(req));
        const entry = progress.lessons.find((l) => l.lessonId === lesson.id);
        if (!entry?.unlocked) {
            return res.status(403).json({ error: "Complete the previous lesson first" });
        }
    }
    const token = await dailyService.createMeetingToken({
        roomName: lesson.dailyRoomName,
        userId: req.user.id,
        userName: req.user.name ?? req.user.email,
        isOwner: isAdmin,
    });
    res.json({ roomUrl: lesson.liveMeetingUrl, token, isOwner: isAdmin });
});
// GET /courses/:courseId/lessons/:lessonId/live/recording-url — enrolled +
// unlocked learner. Mints a fresh access link from the stable recording
// ID rather than storing Daily's (expiring) download link directly.
router.get("/:lessonId/live/recording-url", async (req, res) => {
    const lesson = await lessonService.getLessonById(req.params.lessonId);
    if (!lesson || lesson.courseId !== courseIdOf(req))
        throw new errors_1.NotFoundError("Lesson not found");
    if (!lesson.dailyRecordingId) {
        return res.status(404).json({ error: "No recording available yet" });
    }
    const progress = await progressService.getCourseProgress(req.user.id, courseIdOf(req));
    const entry = progress.lessons.find((l) => l.lessonId === lesson.id);
    if (!entry?.unlocked) {
        return res.status(403).json({ error: "Complete the previous lesson first" });
    }
    const url = await dailyService.getRecordingAccessLink(lesson.dailyRecordingId);
    res.json({ url });
});
// POST /courses/:courseId/lessons/:lessonId/live/rsvp — learner.
const rsvpSchema = zod_1.z.object({ going: zod_1.z.boolean() });
router.post("/:lessonId/live/rsvp", async (req, res) => {
    const parsed = rsvpSchema.safeParse(req.body);
    if (!parsed.success) {
        return res.status(400).json({ error: parsed.error.flatten() });
    }
    const attendance = await liveAttendanceService.setRsvp(req.user.id, courseIdOf(req), req.params.lessonId, parsed.data.going);
    res.json(attendance);
});
// GET /courses/:courseId/lessons/:lessonId/live/attendance — admin roster.
router.get("/:lessonId/live/attendance", (0, auth_1.requireRole)(...types_1.ADMIN_ROLES), async (req, res) => {
    const attendance = await liveAttendanceService.listAttendanceForLesson(req.params.lessonId);
    res.json({ attendance });
});
router.post("/:lessonId/reorder", (0, auth_1.requireRole)(...types_1.ADMIN_ROLES), async (req, res) => {
    const direction = req.body?.direction;
    if (direction !== "up" && direction !== "down") {
        return res.status(400).json({ error: "direction must be 'up' or 'down'" });
    }
    const lesson = await lessonService.reorderLesson(req.params.lessonId, direction);
    res.json(lesson);
});
exports.default = router;
