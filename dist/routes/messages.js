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
const messageService = __importStar(require("../services/messageService"));
const sockets_1 = require("../sockets");
const router = (0, express_1.Router)();
router.use(auth_1.authenticate);
router.get("/threads", async (req, res) => {
    const threads = await messageService.listMyThreads(req.user.id);
    res.json({ threads });
});
router.post("/threads/direct", async (req, res) => {
    const parsed = zod_1.z.object({ userId: zod_1.z.string() }).safeParse(req.body);
    if (!parsed.success) {
        return res.status(400).json({ error: parsed.error.flatten() });
    }
    const thread = await messageService.getOrCreateDirectThread(req.user.id, parsed.data.userId);
    res.status(201).json(thread);
});
router.post("/threads/group", async (req, res) => {
    const parsed = zod_1.z
        .object({ participantIds: zod_1.z.array(zod_1.z.string()).min(1), name: zod_1.z.string().optional() })
        .safeParse(req.body);
    if (!parsed.success) {
        return res.status(400).json({ error: parsed.error.flatten() });
    }
    const thread = await messageService.createGroupThread(req.user.id, parsed.data.participantIds, parsed.data.name);
    res.status(201).json(thread);
});
// Opening a thread's messages implicitly marks them read, same as any chat app.
router.get("/threads/:id/messages", async (req, res) => {
    const messages = await messageService.getThreadMessages(req.params.id, req.user.id);
    await messageService.markThreadRead(req.params.id, req.user.id);
    res.json({ messages });
});
const sendMessageSchema = zod_1.z.object({
    content: zod_1.z.string().min(1).max(4000),
    mediaUrls: zod_1.z.array(zod_1.z.string().url()).optional(),
});
router.post("/threads/:id/messages", async (req, res) => {
    const parsed = sendMessageSchema.safeParse(req.body);
    if (!parsed.success) {
        return res.status(400).json({ error: parsed.error.flatten() });
    }
    const message = await messageService.sendMessage({
        threadId: req.params.id,
        senderId: req.user.id,
        ...parsed.data,
    });
    const participantIds = await messageService.getThreadParticipantIds(req.params.id);
    const io = (0, sockets_1.getIo)();
    for (const participantId of participantIds) {
        io?.to(`user:${participantId}`).emit("message:created", { threadId: req.params.id, message });
    }
    res.status(201).json(message);
});
router.post("/threads/:id/read", async (req, res) => {
    await messageService.markThreadRead(req.params.id, req.user.id);
    res.status(204).send();
});
exports.default = router;
