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
const auth_1 = require("../middleware/auth");
const eventService = __importStar(require("../services/eventService"));
const router = (0, express_1.Router)();
router.use(auth_1.authenticate);
router.get("/", async (_req, res) => {
    const events = await eventService.listEvents();
    res.json({ events });
});
router.get("/:id", async (req, res) => {
    const event = await eventService.getEventById(req.params.id);
    if (!event)
        return res.status(404).json({ error: "Event not found" });
    res.json(event);
});
const createEventSchema = zod_1.z.object({
    title: zod_1.z.string().min(1),
    description: zod_1.z.string().optional(),
    startAt: zod_1.z.coerce.date(),
    endAt: zod_1.z.coerce.date().optional(),
    meetingUrl: zod_1.z.string().url().optional(),
    capacity: zod_1.z.number().int().positive().optional(),
    visibility: zod_1.z.nativeEnum(types_1.EventVisibility).optional(),
});
router.post("/", async (req, res) => {
    const parsed = createEventSchema.safeParse(req.body);
    if (!parsed.success) {
        return res.status(400).json({ error: parsed.error.flatten() });
    }
    const event = await eventService.createEvent({ ...parsed.data, hostId: req.user.id });
    res.status(201).json(event);
});
const updateEventSchema = createEventSchema.partial();
router.patch("/:id", async (req, res) => {
    const parsed = updateEventSchema.safeParse(req.body);
    if (!parsed.success) {
        return res.status(400).json({ error: parsed.error.flatten() });
    }
    const isAdmin = types_1.ADMIN_ROLES.includes(req.user.role);
    const event = await eventService.updateEvent(req.params.id, req.user.id, isAdmin, parsed.data);
    res.json(event);
});
router.delete("/:id", async (req, res) => {
    const isAdmin = types_1.ADMIN_ROLES.includes(req.user.role);
    await eventService.deleteEvent(req.params.id, req.user.id, isAdmin);
    res.status(204).send();
});
router.post("/:id/rsvp", async (req, res) => {
    const rsvp = await eventService.rsvp(req.user.id, req.params.id);
    res.status(201).json(rsvp);
});
router.post("/:id/rsvp/cancel", async (req, res) => {
    await eventService.cancelRsvp(req.user.id, req.params.id);
    res.status(204).send();
});
router.get("/:id/rsvp/me", async (req, res) => {
    const rsvp = await eventService.getMyRsvp(req.user.id, req.params.id);
    res.json(rsvp);
});
router.get("/:id/rsvps", (0, auth_1.requireRole)(...types_1.ADMIN_ROLES), async (req, res) => {
    const rsvps = await eventService.listRsvps(req.params.id);
    res.json({ rsvps });
});
router.post("/:id/recording/upload-url", async (req, res) => {
    const isAdmin = types_1.ADMIN_ROLES.includes(req.user.role);
    const result = await eventService.createRecordingUploadUrl(req.params.id, req.user.id, isAdmin);
    res.status(201).json(result);
});
router.get("/:id/recording/view-url", async (req, res) => {
    const url = await eventService.getRecordingViewUrl(req.params.id);
    res.json({ url });
});
exports.default = router;
