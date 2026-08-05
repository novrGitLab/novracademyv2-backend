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
const postService = __importStar(require("../services/postService"));
const sockets_1 = require("../sockets");
const router = (0, express_1.Router)();
router.use(auth_1.authenticate);
router.get("/", async (req, res) => {
    const parsed = zod_1.z
        .object({
        groupId: zod_1.z.string().optional(),
        page: zod_1.z.coerce.number().int().positive().optional(),
        pageSize: zod_1.z.coerce.number().int().positive().optional(),
    })
        .safeParse(req.query);
    if (!parsed.success) {
        return res.status(400).json({ error: parsed.error.flatten() });
    }
    const result = await postService.listPosts({ ...parsed.data, viewerId: req.user.id });
    res.json(result);
});
const createPostSchema = zod_1.z.object({
    content: zod_1.z.string().min(1).max(5000),
    groupId: zod_1.z.string().optional(),
    cohortId: zod_1.z.string().optional(),
    visibility: zod_1.z.nativeEnum(types_1.PostVisibility).optional(),
    mediaUrls: zod_1.z.array(zod_1.z.string().url()).optional(),
    isCertificateShare: zod_1.z.boolean().optional(),
    certificateId: zod_1.z.string().optional(),
});
router.post("/", async (req, res) => {
    const parsed = createPostSchema.safeParse(req.body);
    if (!parsed.success) {
        return res.status(400).json({ error: parsed.error.flatten() });
    }
    const post = await postService.createPost({ ...parsed.data, authorId: req.user.id });
    if (post.groupId) {
        (0, sockets_1.getIo)()?.to(`group:${post.groupId}`).emit("post:created", post);
    }
    res.status(201).json(post);
});
router.delete("/:id", async (req, res) => {
    const isAdmin = types_1.ADMIN_ROLES.includes(req.user.role);
    await postService.deletePost(req.params.id, req.user.id, isAdmin);
    res.status(204).send();
});
const reactSchema = zod_1.z.object({ type: zod_1.z.nativeEnum(types_1.ReactionType) });
router.post("/:id/react", async (req, res) => {
    const parsed = reactSchema.safeParse(req.body);
    if (!parsed.success) {
        return res.status(400).json({ error: parsed.error.flatten() });
    }
    const result = await postService.toggleReaction(req.params.id, req.user.id, parsed.data.type);
    res.json(result);
});
router.post("/:id/bookmark", async (req, res) => {
    const result = await postService.toggleBookmark(req.params.id, req.user.id);
    res.json(result);
});
router.get("/:id/comments", async (req, res) => {
    const comments = await postService.listComments(req.params.id);
    res.json({ comments });
});
const addCommentSchema = zod_1.z.object({
    content: zod_1.z.string().min(1).max(2000),
    parentCommentId: zod_1.z.string().optional(),
});
router.post("/:id/comments", async (req, res) => {
    const parsed = addCommentSchema.safeParse(req.body);
    if (!parsed.success) {
        return res.status(400).json({ error: parsed.error.flatten() });
    }
    const comment = await postService.addComment(req.params.id, req.user.id, parsed.data.content, parsed.data.parentCommentId);
    const groupId = await postService.getPostGroupId(req.params.id);
    if (groupId) {
        (0, sockets_1.getIo)()?.to(`group:${groupId}`).emit("comment:created", { postId: req.params.id, comment });
    }
    res.status(201).json(comment);
});
router.delete("/:id/comments/:commentId", async (req, res) => {
    const isAdmin = types_1.ADMIN_ROLES.includes(req.user.role);
    await postService.deleteComment(req.params.commentId, req.user.id, isAdmin);
    res.status(204).send();
});
exports.default = router;
