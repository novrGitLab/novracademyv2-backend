import { Router } from "express";
import { z } from "zod";
import { ADMIN_ROLES, EventVisibility } from "@novr/types";
import { authenticate, requireRole } from "../middleware/auth";
import * as eventService from "../services/eventService";

const router = Router();

router.use(authenticate);

router.get("/", async (_req, res) => {
  const events = await eventService.listEvents();
  res.json({ events });
});

router.get("/:id", async (req, res) => {
  const event = await eventService.getEventById(req.params.id);
  if (!event) return res.status(404).json({ error: "Event not found" });
  res.json(event);
});

const createEventSchema = z.object({
  title: z.string().min(1),
  description: z.string().optional(),
  startAt: z.coerce.date(),
  endAt: z.coerce.date().optional(),
  meetingUrl: z.string().url().optional(),
  capacity: z.number().int().positive().optional(),
  visibility: z.nativeEnum(EventVisibility).optional(),
});

router.post("/", async (req, res) => {
  const parsed = createEventSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }
  const event = await eventService.createEvent({ ...parsed.data, hostId: req.user!.id });
  res.status(201).json(event);
});

const updateEventSchema = createEventSchema.partial();

router.patch("/:id", async (req, res) => {
  const parsed = updateEventSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }
  const isAdmin = ADMIN_ROLES.includes(req.user!.role);
  const event = await eventService.updateEvent(req.params.id, req.user!.id, isAdmin, parsed.data);
  res.json(event);
});

router.delete("/:id", async (req, res) => {
  const isAdmin = ADMIN_ROLES.includes(req.user!.role);
  await eventService.deleteEvent(req.params.id, req.user!.id, isAdmin);
  res.status(204).send();
});

router.post("/:id/rsvp", async (req, res) => {
  const rsvp = await eventService.rsvp(req.user!.id, req.params.id);
  res.status(201).json(rsvp);
});

router.post("/:id/rsvp/cancel", async (req, res) => {
  await eventService.cancelRsvp(req.user!.id, req.params.id);
  res.status(204).send();
});

router.get("/:id/rsvp/me", async (req, res) => {
  const rsvp = await eventService.getMyRsvp(req.user!.id, req.params.id);
  res.json(rsvp);
});

router.get("/:id/rsvps", requireRole(...ADMIN_ROLES), async (req, res) => {
  const rsvps = await eventService.listRsvps(req.params.id);
  res.json({ rsvps });
});

router.post("/:id/recording/upload-url", async (req, res) => {
  const isAdmin = ADMIN_ROLES.includes(req.user!.role);
  const result = await eventService.createRecordingUploadUrl(req.params.id, req.user!.id, isAdmin);
  res.status(201).json(result);
});

router.get("/:id/recording/view-url", async (req, res) => {
  const url = await eventService.getRecordingViewUrl(req.params.id);
  res.json({ url });
});

export default router;
