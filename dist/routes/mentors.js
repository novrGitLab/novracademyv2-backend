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
const auth_1 = require("../middleware/auth");
const mentorService = __importStar(require("../services/mentorService"));
const router = (0, express_1.Router)();
router.use(auth_1.authenticate);
router.get("/", async (req, res) => {
    const parsed = zod_1.z.object({ topic: zod_1.z.string().optional() }).safeParse(req.query);
    if (!parsed.success) {
        return res.status(400).json({ error: parsed.error.flatten() });
    }
    const mentors = await mentorService.listMentors(parsed.data);
    res.json({ mentors });
});
// GET /mentors/me — the current user's own mentor profile (opted in or not).
router.get("/me", async (req, res) => {
    const profile = await mentorService.getMentorProfile(req.user.id);
    res.json(profile);
});
const upsertProfileSchema = zod_1.z.object({
    topics: zod_1.z.array(zod_1.z.string().min(1)).min(1),
    availability: zod_1.z.string().optional(),
    capacityPerMonth: zod_1.z.number().int().positive().optional(),
    isActive: zod_1.z.boolean().optional(),
});
router.put("/me", async (req, res) => {
    const parsed = upsertProfileSchema.safeParse(req.body);
    if (!parsed.success) {
        return res.status(400).json({ error: parsed.error.flatten() });
    }
    const profile = await mentorService.upsertMentorProfile(req.user.id, parsed.data);
    res.json(profile);
});
router.get("/sessions", async (req, res) => {
    const sessions = await mentorService.listMySessions(req.user.id);
    res.json(sessions);
});
const requestSessionSchema = zod_1.z.object({
    mentorId: zod_1.z.string(),
    topic: zod_1.z.string().min(1).max(500),
    scheduledAt: zod_1.z.coerce.date().optional(),
});
router.post("/sessions", async (req, res) => {
    const parsed = requestSessionSchema.safeParse(req.body);
    if (!parsed.success) {
        return res.status(400).json({ error: parsed.error.flatten() });
    }
    const session = await mentorService.requestSession({ ...parsed.data, menteeId: req.user.id });
    res.status(201).json(session);
});
const respondSchema = zod_1.z.object({ accept: zod_1.z.boolean() });
router.post("/sessions/:id/respond", async (req, res) => {
    const parsed = respondSchema.safeParse(req.body);
    if (!parsed.success) {
        return res.status(400).json({ error: parsed.error.flatten() });
    }
    const session = await mentorService.respondToSession(req.params.id, req.user.id, parsed.data.accept);
    res.json(session);
});
router.post("/sessions/:id/cancel", async (req, res) => {
    const session = await mentorService.cancelSession(req.params.id, req.user.id);
    res.json(session);
});
const completeSchema = zod_1.z.object({
    rating: zod_1.z.number().int().min(1).max(5).optional(),
    feedback: zod_1.z.string().max(2000).optional(),
});
router.post("/sessions/:id/complete", async (req, res) => {
    const parsed = completeSchema.safeParse(req.body);
    if (!parsed.success) {
        return res.status(400).json({ error: parsed.error.flatten() });
    }
    const session = await mentorService.completeSession(req.params.id, req.user.id, parsed.data);
    res.json(session);
});
exports.default = router;
