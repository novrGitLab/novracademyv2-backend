import { Router } from "express";
import { z } from "zod";
import { ADMIN_ROLES, GroupType } from "@novr/types";
import { authenticate, requireRole } from "../middleware/auth";
import * as groupService from "../services/groupService";

const router = Router();

router.use(authenticate);

router.get("/", async (req, res) => {
  const parsed = z
    .object({ type: z.nativeEnum(GroupType).optional(), includeArchived: z.coerce.boolean().optional() })
    .safeParse(req.query);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }
  const isAdmin = ADMIN_ROLES.includes(req.user!.role);
  const groups = await groupService.listGroups({
    type: parsed.data.type,
    viewerId: req.user!.id,
    includeArchived: isAdmin && parsed.data.includeArchived,
  });
  res.json({ groups });
});

router.get("/:id", async (req, res) => {
  const group = await groupService.getGroupById(req.params.id);
  if (!group) return res.status(404).json({ error: "Group not found" });
  res.json(group);
});

const createGroupSchema = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
  type: z.nativeEnum(GroupType),
  courseId: z.string().optional(),
  cohortId: z.string().optional(),
});

router.post("/", requireRole(...ADMIN_ROLES), async (req, res) => {
  const parsed = createGroupSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }
  const group = await groupService.createGroup(parsed.data);
  res.status(201).json(group);
});

const updateGroupSchema = z.object({
  name: z.string().min(1).optional(),
  description: z.string().optional(),
  isArchived: z.boolean().optional(),
  isPinned: z.boolean().optional(),
});

router.patch("/:id", requireRole(...ADMIN_ROLES), async (req, res) => {
  const parsed = updateGroupSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }
  const group = await groupService.updateGroup(req.params.id, parsed.data);
  res.json(group);
});

router.delete("/:id", requireRole(...ADMIN_ROLES), async (req, res) => {
  await groupService.deleteGroup(req.params.id);
  res.status(204).send();
});

router.post("/:id/join", async (req, res) => {
  const membership = await groupService.joinGroup(req.user!.id, req.params.id);
  res.status(201).json(membership);
});

router.post("/:id/leave", async (req, res) => {
  await groupService.leaveGroup(req.user!.id, req.params.id);
  res.status(204).send();
});

export default router;
