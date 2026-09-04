import type { Request, Response, NextFunction } from "express";
import rateLimit from "express-rate-limit";

/** Key a bucket by the authenticated user, falling back to the client IP. */
function keyByUserOrIp(req: Request): string {
  const user = (req as unknown as { user?: { id?: string } }).user;
  return user?.id ?? (req.ip || "unknown");
}

/** Auth surfaces: login/signup/forgot-password — strict per-IP + email. */
export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 min
  limit: 60,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator(req) {
    // Rate-limit harder per email on login so a single IP can't brute-force many accounts.
    const ip = (req.ip as string) || "unknown";
    const body = req.body as Record<string, unknown> | undefined;
    const email = typeof body?.email === "string" ? body.email.toLowerCase() : "";
    return email ? `${ip}:${email}` : ip;
  },
  message: { error: "Too many auth attempts. Please try again in 15 minutes." },
});

/** Write-heavy: create/post/submit/report/spend actions. */
export const writeLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 120,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: keyByUserOrIp,
  message: { error: "Too many requests. Please slow down." },
});

/** Bulk / email-heavy sends (campaign blast, bulk enroll, job alerts). */
export const bulkLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 20,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: keyByUserOrIp,
  message: { error: "Too many bulk requests. Please slow down." },
});

/** General reads: course/lesson/lesson-progress, analytics, org list, me. */
export const readLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 300,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: keyByUserOrIp,
  message: { error: "Too many requests" },
});

/** Webhooks: never block a legitimate provider, just cap abuse at high rate. */
export const webhookLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 60,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator(req) {
    return (req.ip as string) || "unknown";
  },
  message: { error: "Rate limited" },
});

/** OAuth token endpoint: protect brute-force of client secrets. */
export const oauthLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 30,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator(req) {
    const body = req.body as Record<string, unknown> | undefined;
    const cid = typeof body?.client_id === "string" ? body.client_id : "";
    const ip = (req.ip as string) || "unknown";
    return cid ? `${ip}:${cid}` : ip;
  },
  message: { error: "Too many token requests. Please slow down." },
});
