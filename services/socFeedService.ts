import { prisma } from "@novr/db";

interface SocFeedItem {
  type: string;
  title: string;
  summary?: string;
  url: string;
  category?: string;
  publishedAt?: string;
}

interface IngestResult {
  created: number;
  skipped: number;
}

function httpsUrl(s: string): boolean {
  try {
    return new URL(s).protocol === "https:";
  } catch {
    return false;
  }
}

function sanitizeForStorage(s: string): string {
  // Allow Tiptap-safe HTML in future; for now the SOC blurb is plain text
  // with line breaks — trim control chars and strip <script>.
  return s.replace(/<script[\s\S]*?<\/script>/gi, "").replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, "");
}

/**
 * Validate + store a producer-supplied SOC feed (one POST = many items).
 * Each item becomes a CommunityPost with category "SOC" so it surfaces in
 * both the SOC feed and (optionally) the global feed as a browsable item.
 */
export async function ingestSocFeed(
  items: SocFeedItem[],
  authorId: string
): Promise<IngestResult> {
  let created = 0;
  let skipped = 0;

  for (const item of items) {
    // Strict validation — these surface as public content
    if (!item.type || !item.title || !item.url) { skipped++; continue; }
    if (item.title.length > 500 || item.type.length > 80) { skipped++; continue; }
    if (!httpsUrl(item.url) || item.url.length > 2048) { skipped++; continue; }
    if (item.summary && item.summary.length > 5000) { skipped++; continue; }

    const cleanTitle = sanitizeForStorage(item.title);
    const cleanSummary = sanitizeForStorage(item.summary ?? "");
    const cleanCategory = item.category ? sanitizeForStorage(item.category).slice(0, 60) : null;

    try {
      await prisma.communityPost.create({
        data: {
          content: cleanSummary || cleanTitle,
          title: cleanTitle,
          category: cleanCategory ?? "SOC",
          visibility: "NETWORK",
          isPinned: false,
          authorId,
        },
      });
      created++;
    } catch {
      skipped++;
    }
  }

  // Keep the feed bounded — if more than 200 SOC posts exist, prune the oldest.
  const count = await prisma.communityPost.count({ where: { category: "SOC" } });
  if (count > 200) {
    const oldest = await prisma.communityPost.findMany({
      where: { category: "SOC" },
      orderBy: { createdAt: "asc" },
      take: count - 200,
      select: { id: true },
    });
    if (oldest.length > 0) {
      await prisma.communityPost.deleteMany({ where: { id: { in: oldest.map((r) => r.id) } } });
    }
  }

  return { created, skipped };
}

export async function listSocFeed(params: {
  search?: string;
  category?: string;
  page?: number;
  pageSize?: number;
}) {
  const page = Math.max(1, params.page ?? 1);
  const pageSize = Math.min(50, Math.max(1, params.pageSize ?? 20));
  const where: Record<string, unknown> = { category: "SOC" };
  if (params.category && params.category !== "SOC") (where as Record<string, unknown>).category = params.category;
  if (params.search) {
    (where as Record<string, unknown>).OR = [
      { title: { contains: params.search, mode: "insensitive" } },
      { content: { contains: params.search, mode: "insensitive" } },
    ];
  }
  const [posts, total] = await Promise.all([
    prisma.communityPost.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.communityPost.count({ where }),
  ]);
  return { posts, total, page, pageSize };
}
