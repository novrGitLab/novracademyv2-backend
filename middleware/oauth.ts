import type { NextFunction, Request, Response } from "express";

/**
 * OAuth 2.0 scope guard. Must run after `authenticate` (so `req.user` and the
 * decoded JWT `scope`/`jti` on the token are available).
 *
 * Scoped service tokens (from POST /oauth/token) carry a space-separated
 * `scope` claim (e.g. "read:courses write:enrollments"). `requireScope`
 * allows the call if the token has **any** of the required scopes, or is
 * not a scoped token at all (session JWTs have no `scope` and are treated
 * as full-scope human sessions).
 *
 * Usage: `router.get("/courses", authenticate, requireScope("read:courses"), handler)`
 */
export function requireScope(...scopes: string[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    const user = (req as unknown as { user?: { id?: string } }).user;
    if (!user) return res.status(401).json({ error: "Not authenticated" });

    // Human sessions have no scope claim — they pass scope checks (they are
    // the first-party app acting on the user's behalf).
    const scopeClaim = (req as unknown as { _tokenScope?: string })._tokenScope;
    if (scopeClaim === undefined) return next();

    const granted = scopeClaim ? scopeClaim.split(" ").filter(Boolean) : [];
    const ok = scopes.some((s) => granted.includes(s) || granted.includes("admin:*"));
    if (!ok) {
      return res.status(403).json({ error: "Insufficient scope", required: scopes });
    }
    next();
  };
}
