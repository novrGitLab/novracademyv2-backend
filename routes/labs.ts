import { Router } from "express";
import { z } from "zod";
import { prisma } from "@novr/db";
import { UserRole, ADMIN_ROLES } from "@novr/types";
import { authenticate, requireRole } from "../middleware/auth";
import * as labAgent from "../services/labAgentService";

const router = Router();
router.use(authenticate);

function getOrgId(req: any): string | null {
  if (req.user.role === UserRole.SUPER_ADMIN) {
    return (req.query.organizationId as string) || req.user.organizationId;
  }
  return req.user.organizationId;
}

const createLabSchema = z.object({
  name: z.string().min(1),
  category: z.string().min(1),
  description: z.string().min(1),
  flag: z.string().min(1),
  labTemplateId: z.string().min(1),
  points: z.number().int().positive().optional().default(50),
  organizationId: z.string().nullable().optional(),
});

// GET /labs — list labs for the employee's org + global labs
router.get("/", async (req, res) => {
  const orgId = getOrgId(req);
  const userId = req.user!.id;

  const where = {
    OR: [
      { organizationId: orgId },
      { organizationId: null },
    ],
  };

  const [labs, solves] = await Promise.all([
    prisma.lab.findMany({
      where,
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        name: true,
        category: true,
        description: true,
        points: true,
        labTemplateId: true,
        organizationId: true,
        createdAt: true,
      },
    }),
    prisma.labSolve.findMany({
      where: { userId },
      select: { labId: true },
    }),
  ]);

  const solvedLabIds = new Set(solves.map((s) => s.labId));

  res.json({
    labs: labs.map((lab) => ({
      ...lab,
      solved: solvedLabIds.has(lab.id),
    })),
  });
});

// GET /labs/:labId — get a single lab
router.get("/:labId", async (req, res) => {
  const { labId } = req.params;
  const userId = req.user!.id;

  const lab = await prisma.lab.findUnique({ where: { id: labId } });
  if (!lab) {
    return res.status(404).json({ error: "Lab not found" });
  }

  const solve = await prisma.labSolve.findUnique({
    where: { labId_userId: { labId, userId } },
  });

  res.json({
    id: lab.id,
    name: lab.name,
    category: lab.category,
    description: lab.description,
    points: lab.points,
    labTemplateId: lab.labTemplateId,
    organizationId: lab.organizationId,
    createdAt: lab.createdAt,
    solved: !!solve,
  });
});

// POST /labs — create a lab (admin only)
router.post("/", requireRole(...ADMIN_ROLES), async (req, res) => {
  const parsed = createLabSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }

  const { name, category, description, flag, labTemplateId, points, organizationId } = parsed.data;
  const userRole = req.user!.role;

  // Determine which org this lab belongs to
  let targetOrgId: string | null = null;
  if (organizationId !== undefined && organizationId !== null) {
    // Explicit org — only SUPER_ADMIN can assign to arbitrary orgs
    if (userRole !== UserRole.SUPER_ADMIN) {
      return res.status(403).json({ error: "Only super admins can create labs for other organizations" });
    }
    targetOrgId = organizationId;
  } else {
    // No org specified — use the caller's org (or null for global if super admin)
    targetOrgId = getOrgId(req);
  }

  const lab = await prisma.lab.create({
    data: {
      name,
      category,
      description,
      flag,
      labTemplateId,
      points,
      organizationId: targetOrgId,
    },
    select: {
      id: true,
      name: true,
      category: true,
      description: true,
      points: true,
      labTemplateId: true,
      organizationId: true,
      createdAt: true,
    },
  });

  res.status(201).json(lab);
});

// POST /labs/:labId/start — start a lab session
router.post("/:labId/start", async (req, res) => {
  const { labId } = req.params;
  const userId = req.user!.id;

  const lab = await prisma.lab.findUnique({ where: { id: labId } });
  if (!lab) {
    return res.status(404).json({ error: "Lab not found" });
  }

  // Generate a sanitized sessionId: lowercase alphanumeric + hyphens, max 40 chars
  // CUIDs are 25 chars each, so userId-labId alone exceeds 40 — use a short
  // random hex suffix to guarantee uniqueness across rapid clicks.
  const rand = Math.random().toString(36).slice(2, 10);
  const raw = `lab-${rand}`;
  const sessionId = raw
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, "")
    .slice(0, 40);

  const TTL_MINUTES = 60;

  try {
    const agentResponse = await labAgent.startLab(sessionId, lab.labTemplateId, TTL_MINUTES);

    const session = await prisma.labSession.create({
      data: {
        labId,
        userId,
        agentSessionId: sessionId,
        status: "active",
      },
    });

    res.json({
      sessionId,
      iframeUrl: agentResponse.iframeUrl,
      expiresAt: agentResponse.expiresAt,
      sessionDbId: session.id,
    });
  } catch (err: any) {
    console.error("[Labs] Failed to start lab:", err.message);
    res.status(502).json({ error: "Failed to provision lab environment" });
  }
});

// POST /labs/:labId/end — end a lab session
router.post("/:labId/end", async (req, res) => {
  const { labId } = req.params;
  const { sessionId } = req.body as { sessionId?: string };
  const userId = req.user!.id;

  if (!sessionId) {
    return res.status(400).json({ error: "sessionId is required" });
  }

  // Verify the session belongs to this user
  const session = await prisma.labSession.findFirst({
    where: { agentSessionId: sessionId, labId, userId },
  });
  if (!session) {
    return res.status(404).json({ error: "Session not found" });
  }

  try {
    await labAgent.endLab(sessionId);
  } catch (err: any) {
    console.error("[Labs] Failed to destroy lab:", err.message);
    // Continue with DB update even if agent call fails — agent has its own TTL sweep
  }

  await prisma.labSession.update({
    where: { id: session.id },
    data: { status: "ended", endedAt: new Date() },
  });

  res.json({ sessionId, status: "ended" });
});

// POST /labs/:labId/submit — submit a flag
router.post("/:labId/submit", async (req, res) => {
  const { labId } = req.params;
  const { flag, sessionId } = req.body as { flag?: string; sessionId?: string };
  const userId = req.user!.id;

  if (!flag) {
    return res.status(400).json({ error: "flag is required" });
  }

  const lab = await prisma.lab.findUnique({ where: { id: labId } });
  if (!lab) {
    return res.status(404).json({ error: "Lab not found" });
  }

  const isCorrect = flag.trim() === lab.flag.trim();

  if (!isCorrect) {
    return res.json({ correct: false });
  }

  // Correct flag — record the solve
  // Handle UNIQUE constraint gracefully: if already solved, return alreadySolved
  try {
    await prisma.labSolve.create({
      data: {
        labId,
        userId,
        labSessionId: sessionId || null,
      },
    });
    res.json({ correct: true, alreadySolved: false, points: lab.points });
  } catch (err: any) {
    // P2002 = unique constraint violation — already solved
    if (err.code === "P2002") {
      res.json({ correct: true, alreadySolved: true, points: lab.points });
    } else {
      throw err;
    }
  }
});

export default router;
