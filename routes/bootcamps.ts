import { Router } from "express";
import { z } from "zod";
import { authenticate, requireRole } from "../middleware/auth";
import * as bootcampService from "../services/bootcampService";
import { ApiError } from "../lib/errors";

const router = Router();

router.use(authenticate);

// GET /bootcamps?status=&search=&page=&pageSize=
router.get("/", async (req, res) => {
  const parsed = z
    .object({
      status: z.string().optional(),
      search: z.string().optional(),
      page: z.coerce.number().int().positive().optional(),
      pageSize: z.coerce.number().int().positive().optional(),
    })
    .safeParse(req.query);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }
  const result = await bootcampService.listBootcamps({ ...parsed.data, userId: req.user!.id });
  res.json(result);
});

// GET /bootcamps/mine — the current user's registrations
router.get("/mine", async (req, res) => {
  const result = await bootcampService.listMyBootcamps(req.user!.id);
  res.json({ enrollments: result });
});

// GET /bootcamps/:id
router.get("/:id", async (req, res) => {
  const bootcamp = await bootcampService.getBootcampById(req.params.id);
  if (!bootcamp) throw new ApiError(404, "Bootcamp not found");
  res.json(bootcamp);
});

const createBootcampSchema = z.object({
  title: z.string().min(1).max(200),
  description: z.string().optional(),
  instructorName: z.string().optional(),
  startAt: z.string().datetime(),
  endAt: z.string().datetime(),
  scheduleLabel: z.string().optional(),
  format: z.enum(["ONLINE", "HYBRID", "IN_PERSON"]).optional(),
  location: z.string().optional(),
  seatsTotal: z.coerce.number().int().min(1).max(9999),
  level: z.enum(["Beginner", "Intermediate", "Advanced"]).optional(),
  topics: z.array(z.string().min(1).max(40)).optional(),
  courseId: z.string().optional(),
});

router.post("/", async (req, res) => {
  const parsed = createBootcampSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }
  const bootcamp = await bootcampService.createBootcamp({
    title: parsed.data.title,
    description: parsed.data.description,
    instructorName: parsed.data.instructorName,
    startAt: new Date(parsed.data.startAt),
    endAt: new Date(parsed.data.endAt),
    scheduleLabel: parsed.data.scheduleLabel,
    format: parsed.data.format ?? "ONLINE",
    topics: parsed.data.topics ?? [],
    location: parsed.data.location,
    seatsTotal: parsed.data.seatsTotal,
    level: parsed.data.level,
    courseId: parsed.data.courseId || undefined,
    createdById: req.user!.id,
  });
  res.status(201).json(bootcamp);
});

const updateBootcampSchema = z.object({
  title: z.string().min(1).max(200).optional(),
  description: z.string().optional(),
  instructorName: z.string().optional(),
  startAt: z.string().datetime().optional(),
  endAt: z.string().datetime().optional(),
  scheduleLabel: z.string().optional(),
  format: z.enum(["ONLINE", "HYBRID", "IN_PERSON"]).optional(),
  location: z.string().optional(),
  seatsTotal: z.coerce.number().int().min(1).max(9999).optional(),
  level: z.enum(["Beginner", "Intermediate", "Advanced"]).optional(),
  topics: z.array(z.string().min(1).max(40)).optional(),
  courseId: z.string().optional(),
  status: z.enum(["UPCOMING", "IN_PROGRESS", "COMPLETED"]).optional(),
});

router.patch("/:id", async (req, res) => {
  const parsed = updateBootcampSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }
  const data: Record<string, unknown> = {};
  if (parsed.data.title !== undefined) data.title = parsed.data.title;
  if (parsed.data.description !== undefined) data.description = parsed.data.description;
  if (parsed.data.instructorName !== undefined) data.instructorName = parsed.data.instructorName;
  if (parsed.data.startAt !== undefined) data.startAt = new Date(parsed.data.startAt);
  if (parsed.data.endAt !== undefined) data.endAt = new Date(parsed.data.endAt);
  if (parsed.data.scheduleLabel !== undefined) data.scheduleLabel = parsed.data.scheduleLabel;
  if (parsed.data.format !== undefined) data.format = parsed.data.format;
  if (parsed.data.location !== undefined) data.location = parsed.data.location;
  if (parsed.data.seatsTotal !== undefined) data.seatsTotal = parsed.data.seatsTotal;
  if (parsed.data.level !== undefined) data.level = parsed.data.level;
  if (parsed.data.topics !== undefined) data.topics = parsed.data.topics;
  if (parsed.data.courseId !== undefined) data.courseId = parsed.data.courseId || null;
  if (parsed.data.status !== undefined) data.status = parsed.data.status;
  const bootcamp = await bootcampService.updateBootcamp(req.params.id, data);
  res.json(bootcamp);
});

router.delete("/:id", requireRole("SUPER_ADMIN", "ORG_ADMIN"), async (req, res) => {
  await bootcampService.deleteBootcamp(req.params.id);
  res.status(204).send();
});

// Student registration: any authenticated user can register/cancel.
router.post("/:id/register", async (req, res) => {
  try {
    const enrollment = await bootcampService.registerBootcamp(req.params.id, req.user!.id);
    res.status(201).json(enrollment);
  } catch (err) {
    if (err instanceof Error && (err.message === "This bootcamp is full" || err.message.includes("Unique constraint"))) {
      return res.status(400).json({ error: "Could not register — already registered or bootcamp is full" });
    }
    throw err;
  }
});

router.post("/:id/cancel", async (req, res) => {
  try {
    await bootcampService.cancelBootcampEnrollment(req.params.id, req.user!.id);
    res.status(204).send();
  } catch (err) {
    if (err instanceof Error && err.message.includes("Record to delete does not exist")) {
      return res.status(404).json({ error: "Not registered" });
    }
    throw err;
  }
});

export default router;
