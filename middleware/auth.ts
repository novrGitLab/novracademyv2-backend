import type { NextFunction, Request, Response } from "express";
import { decode } from "next-auth/jwt";
import { prisma } from "@novr/db";
import type { AuthUser, UserRole } from "@novr/types";
import { UserStatus } from "@novr/types";

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: AuthUser;
    }
  }
}

const SESSION_COOKIE_NAMES = [
  "__Secure-next-auth.session-token",
  "next-auth.session-token",
];

function extractSessionToken(req: Request): string | null {
  const authHeader = req.headers.authorization;
  if (authHeader?.startsWith("Bearer ")) {
    return authHeader.slice("Bearer ".length);
  }
  for (const name of SESSION_COOKIE_NAMES) {
    const value = req.cookies?.[name];
    if (value) return value;
  }
  return null;
}

async function resolveUserFromRequest(req: Request): Promise<AuthUser | null> {
  const token = extractSessionToken(req);
  if (!token) {
    console.log("Auth: no token found in request");
    return null;
  }

  const secret = process.env.NEXTAUTH_SECRET;
  if (!secret) {
    console.error("Auth: NEXTAUTH_SECRET is not configured");
    throw new Error("NEXTAUTH_SECRET is not configured");
  }

  try {
    const payload = await decode({ token, secret });
    if (!payload?.sub) {
      console.log("Auth: token decoded but no sub claim");
      return null;
    }

    // Development test accounts (frontend lib/test-credentials.ts) never
    // touch the database, so their sub isn't a real User id. Accept them
    // only in development and upsert a real User row so any code storing
    // req.user.id as a foreign key (courses.createdById, etc.) still works.
    const isDev = !process.env.NODE_ENV || process.env.NODE_ENV === "development";
    if (isDev && payload.sub.startsWith("test-")) {
      const email = (payload.email as string) ?? `${payload.sub}@novr.local`;
      const role = (payload.role as UserRole) ?? "LEARNER";
      const name = (payload.name as string) ?? null;
      const testUser = await prisma.user.upsert({
        where: { email },
        create: { email, name, role, status: UserStatus.ACTIVE },
        update: { role, name, status: UserStatus.ACTIVE },
        select: { id: true, email: true, name: true, role: true, memberType: true, status: true },
      });
      return testUser as AuthUser;
    }

    const user = await prisma.user.findUnique({
      where: { id: payload.sub },
      select: { id: true, email: true, name: true, role: true, memberType: true, status: true },
    });

    if (!user || user.status !== UserStatus.ACTIVE) {
      console.log(`Auth: user ${payload.sub} not found or inactive`);
      return null;
    }
    return user as AuthUser;
  } catch (err) {
    console.error("Auth: token verification failed:", err instanceof Error ? err.message : err);
    return null;
  }
}

/**
 * Verifies the NextAuth session token (issued by the web app) and attaches
 * the requesting user to `req.user`. Re-checks status in the DB on every
 * request so a suspended account loses API access immediately, rather than
 * waiting for the JWT to expire.
 */
export async function authenticate(req: Request, res: Response, next: NextFunction) {
  try {
    const user = await resolveUserFromRequest(req);
    if (!user) {
      return res.status(401).json({ error: "Not authenticated" });
    }
    req.user = user;
    next();
  } catch (err) {
    res.status(401).json({ error: "Not authenticated" });
  }
}

/**
 * Populates req.user if a valid session is present, but never rejects the
 * request otherwise — for routes that must work anonymously (e.g. an
 * alumni claim link, which needs to know "is anyone logged in, and are
 * they this specific person" without requiring login upfront).
 */
export async function optionalAuthenticate(req: Request, _res: Response, next: NextFunction) {
  try {
    const user = await resolveUserFromRequest(req);
    if (user) req.user = user;
  } catch {
    // Invalid/expired token — treat as anonymous rather than failing.
  }
  next();
}

/** Restricts a route to the given roles. Must run after `authenticate`. */
export function requireRole(...roles: UserRole[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.user) {
      return res.status(401).json({ error: "Not authenticated" });
    }
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ error: "Insufficient permissions" });
    }
    next();
  };
}
