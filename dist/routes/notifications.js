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
const notificationService = __importStar(require("../services/notificationService"));
const router = (0, express_1.Router)();
router.use(auth_1.authenticate);
router.get("/", async (req, res) => {
    const notifications = await notificationService.listMyNotifications(req.user.id);
    res.json({ notifications });
});
router.get("/unread-count", async (req, res) => {
    const count = await notificationService.getUnreadCount(req.user.id);
    res.json({ count });
});
router.post("/:id/read", async (req, res) => {
    await notificationService.markNotificationRead(req.params.id, req.user.id);
    res.status(204).send();
});
router.post("/read-all", async (req, res) => {
    await notificationService.markAllRead(req.user.id);
    res.status(204).send();
});
const composeSchema = zod_1.z.object({
    segment: zod_1.z.enum(["all", "inactive", "mentors", "open_to_work"]),
    title: zod_1.z.string().min(1).max(200),
    content: zod_1.z.string().min(1).max(5000),
    channels: zod_1.z.array(zod_1.z.enum(["in_app", "email"])).min(1),
});
router.post("/compose", (0, auth_1.requireRole)(...types_1.ADMIN_ROLES), async (req, res) => {
    const parsed = composeSchema.safeParse(req.body);
    if (!parsed.success) {
        return res.status(400).json({ error: parsed.error.flatten() });
    }
    const result = await notificationService.composeToSegment(parsed.data);
    res.status(201).json(result);
});
router.get("/history", (0, auth_1.requireRole)(...types_1.ADMIN_ROLES), async (_req, res) => {
    const history = await notificationService.getNotificationHistory();
    res.json({ history });
});
exports.default = router;
