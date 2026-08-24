import { prisma } from "@novr/db";

const CLEANUP_INTERVAL_MS = 5 * 60 * 1000; // every 5 minutes
const DEFAULT_TTL_MINUTES = 60;

export function startLabSessionCleanup() {
  setInterval(async () => {
    try {
      const cutoff = new Date(Date.now() - DEFAULT_TTL_MINUTES * 60 * 1000);
      const result = await prisma.labSession.updateMany({
        where: {
          status: "active",
          startedAt: { lt: cutoff },
        },
        data: { status: "expired", endedAt: new Date() },
      });
      if (result.count > 0) {
        console.log(`[LabSessionCleanup] Marked ${result.count} stale session(s) as expired`);
      }
    } catch (err) {
      console.error("[LabSessionCleanup] Error:", err);
    }
  }, CLEANUP_INTERVAL_MS).unref();
}
