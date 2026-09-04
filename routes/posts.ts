import { Router } from "express";
import { z } from "zod";
import { ADMIN_ROLES, PostVisibility, ReactionType } from "@novr/types";
import { authenticate, requireRole } from "../middleware/auth";
import * as postService from "../services/postService";
import { getIo } from "../sockets";

const router = Router();

router.use(authenticate);

router.get("/", async (req, res) => {
  const parsed = z
    .object({
      groupId: z.string().optional(),
      category: z.string().min(1).max(60).optional(),
      search: z.string().trim().min(1).max(100).optional(),
      page: z.coerce.number().int().positive().optional(),
      pageSize: z.coerce.number().int().positive().optional(),
    })
    .safeParse(req.query);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }
  const result = await postService.listPosts({ ...parsed.data, viewerId: req.user!.id });
  res.json(result);
});

const createPostSchema = z.object({
  content: z.string().min(1).max(5000),
  title: z.string().min(1).max(200).optional(),
  category: z.string().min(1).max(60).optional(),
  tags: z.array(z.string().min(1).max(40)).optional(),
  isPinned: z.boolean().optional(),
  groupId: z.string().optional(),
  cohortId: z.string().optional(),
  visibility: z.nativeEnum(PostVisibility).optional(),
  mediaUrls: z.array(z.string().url()).optional(),
  isCertificateShare: z.boolean().optional(),
  certificateId: z.string().optional(),
});

router.post("/", async (req, res) => {
  const parsed = createPostSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }
  const post = await postService.createPost({ ...parsed.data, authorId: req.user!.id });

  if (post.groupId) {
    getIo()?.to(`group:${post.groupId}`).emit("post:created", post);
  }
  res.status(201).json(post);
});

router.delete("/:id", async (req, res) => {
  const isAdmin = ADMIN_ROLES.includes(req.user!.role);
  await postService.deletePost(req.params.id, req.user!.id, isAdmin);
  res.status(204).send();
});

const reactSchema = z.object({ type: z.nativeEnum(ReactionType) });

router.post("/:id/react", async (req, res) => {
  const parsed = reactSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }
  const result = await postService.toggleReaction(req.params.id, req.user!.id, parsed.data.type);
  res.json(result);
});

router.post("/:id/bookmark", async (req, res) => {
  const result = await postService.toggleBookmark(req.params.id, req.user!.id);
  res.json(result);
});

router.get("/:id/comments", async (req, res) => {
  const comments = await postService.listComments(req.params.id);
  res.json({ comments });
});

const addCommentSchema = z.object({
  content: z.string().min(1).max(2000),
  parentCommentId: z.string().optional(),
});

router.post("/:id/comments", async (req, res) => {
  const parsed = addCommentSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }
  const comment = await postService.addComment(
    req.params.id,
    req.user!.id,
    parsed.data.content,
    parsed.data.parentCommentId
  );

  const groupId = await postService.getPostGroupId(req.params.id);
  if (groupId) {
    getIo()?.to(`group:${groupId}`).emit("comment:created", { postId: req.params.id, comment });
  }
  res.status(201).json(comment);
});

// Pinned toggle (admin only)
router.patch("/:id/pin", requireRole(...ADMIN_ROLES), async (req, res) => {
  const post = await postService.togglePin(req.params.id);
  if (post.groupId) {
    getIo()?.to(`group:${post.groupId}`).emit("post:pinned", post);
  }
  res.json(post);
});

// View-count bump (fire-and-forget from the client on card expand)
router.post("/:id/view", async (req, res) => {
  const post = await postService.bumpViewCount(req.params.id);
  res.json(post);
});

router.delete("/:id/comments/:commentId", async (req, res) => {
  const isAdmin = ADMIN_ROLES.includes(req.user!.role);
  await postService.deleteComment(req.params.commentId, req.user!.id, isAdmin);
  res.status(204).send();
});

export default router;
