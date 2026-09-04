import { Router } from "express";
import { z } from "zod";
import { authenticate } from "../middleware/auth";
import { requireScope } from "../middleware/oauth";
import { readLimiter, writeLimiter } from "../middleware/rateLimit";
import * as socFeedService from "../services/socFeedService";

const router = Router();

router.use(authenticate);

// GET /soc-feed — producer-supplied SOC content. Protected: read:soc-feed
// (or admin:*). No auth on the public community feed, but the SOC feed is
// scoped so only the producer's client + staff can consume it in v1.
router.get("/", readLimiter, requireScope("read:soc-feed"), async (req, res) => {
  const parsed = z
    .object({
      search: z.string().trim().max(100).optional(),
      category: z.string().min(1).max(60).optional(),
      page: z.coerce.number().int().positive().optional(),
      pageSize: z.coerce.number().int().positive().optional(),
    })
    .safeParse(req.query);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }
  const result = await socFeedService.listSocFeed(parsed.data);
  res.json(result);
});

// POST /soc-feed/ingest — producer pushes a batch of SOC items. Protected:
// write:soc-feed. Validates every item (type/title/url https-only + size
// caps) and creates CommunityPost rows with category "SOC". Prunes beyond 200.
router.post(
  "/ingest",
  writeLimiter,
  requireScope("write:soc-feed"),
  async (req, res) => {
    const parsed = z
      .object({
        items: z.array(
          z.object({
            type: z.string().min(1, "type is required").max(80),
            title: z.string().min(1, "title is required").max(500),
            summary: z.string().max(5000).optional(),
            url: z.string().url().max(2048).refine((s) => s.startsWith("https://"), "url must be https"),
            category: z.string().min(1).max(60).optional(),
            publishedAt: z.string().optional(),
          })
        ),
      })
      .safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.flatten() });
    }
    const result = await socFeedService.ingestSocFeed(parsed.data.items, req.user!.id);
    res.status(201).json(result);
  }
);

export default router;
