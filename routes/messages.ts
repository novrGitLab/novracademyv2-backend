import { Router } from "express";
import { z } from "zod";
import { authenticate } from "../middleware/auth";
import * as messageService from "../services/messageService";
import { getIo } from "../sockets";

const router = Router();

router.use(authenticate);

router.get("/threads", async (req, res) => {
  const threads = await messageService.listMyThreads(req.user!.id);
  res.json({ threads });
});

router.post("/threads/direct", async (req, res) => {
  const parsed = z.object({ userId: z.string() }).safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }
  const thread = await messageService.getOrCreateDirectThread(req.user!.id, parsed.data.userId);
  res.status(201).json(thread);
});

router.post("/threads/group", async (req, res) => {
  const parsed = z
    .object({ participantIds: z.array(z.string()).min(1), name: z.string().optional() })
    .safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }
  const thread = await messageService.createGroupThread(req.user!.id, parsed.data.participantIds, parsed.data.name);
  res.status(201).json(thread);
});

// Opening a thread's messages implicitly marks them read, same as any chat app.
router.get("/threads/:id/messages", async (req, res) => {
  const messages = await messageService.getThreadMessages(req.params.id, req.user!.id);
  await messageService.markThreadRead(req.params.id, req.user!.id);
  res.json({ messages });
});

const sendMessageSchema = z.object({
  content: z.string().min(1).max(4000),
  mediaUrls: z.array(z.string().url()).optional(),
});

router.post("/threads/:id/messages", async (req, res) => {
  const parsed = sendMessageSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }
  const message = await messageService.sendMessage({
    threadId: req.params.id,
    senderId: req.user!.id,
    ...parsed.data,
  });

  const participantIds = await messageService.getThreadParticipantIds(req.params.id);
  const io = getIo();
  for (const participantId of participantIds) {
    io?.to(`user:${participantId}`).emit("message:created", { threadId: req.params.id, message });
  }

  res.status(201).json(message);
});

router.post("/threads/:id/read", async (req, res) => {
  await messageService.markThreadRead(req.params.id, req.user!.id);
  res.status(204).send();
});

export default router;
