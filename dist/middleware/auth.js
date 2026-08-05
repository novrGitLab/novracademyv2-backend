"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.authenticate = authenticate;
exports.optionalAuthenticate = optionalAuthenticate;
exports.requireRole = requireRole;
const jwt_1 = require("next-auth/jwt");
const db_1 = require("@novr/db");
const types_1 = require("@novr/types");
const SESSION_COOKIE_NAMES = [
    "__Secure-next-auth.session-token",
    "next-auth.session-token",
];
function extractSessionToken(req) {
    const authHeader = req.headers.authorization;
    if (authHeader?.startsWith("Bearer ")) {
        return authHeader.slice("Bearer ".length);
    }
    for (const name of SESSION_COOKIE_NAMES) {
        const value = req.cookies?.[name];
        if (value)
            return value;
    }
    return null;
}
async function resolveUserFromRequest(req) {
    const token = extractSessionToken(req);
    if (!token)
        return null;
    const secret = process.env.NEXTAUTH_SECRET;
    if (!secret)
        throw new Error("NEXTAUTH_SECRET is not configured");
    const payload = await (0, jwt_1.decode)({ token, secret });
    if (!payload?.sub)
        return null;
    const user = await db_1.prisma.user.findUnique({
        where: { id: payload.sub },
        select: { id: true, email: true, name: true, role: true, memberType: true, status: true },
    });
    if (!user || user.status !== types_1.UserStatus.ACTIVE)
        return null;
    return user;
}
/**
 * Verifies the NextAuth session token (issued by the web app) and attaches
 * the requesting user to `req.user`. Re-checks status in the DB on every
 * request so a suspended account loses API access immediately, rather than
 * waiting for the JWT to expire.
 */
async function authenticate(req, res, next) {
    try {
        const user = await resolveUserFromRequest(req);
        if (!user) {
            return res.status(401).json({ error: "Not authenticated" });
        }
        req.user = user;
        next();
    }
    catch (err) {
        res.status(401).json({ error: "Not authenticated" });
    }
}
/**
 * Populates req.user if a valid session is present, but never rejects the
 * request otherwise — for routes that must work anonymously (e.g. an
 * alumni claim link, which needs to know "is anyone logged in, and are
 * they this specific person" without requiring login upfront).
 */
async function optionalAuthenticate(req, _res, next) {
    try {
        const user = await resolveUserFromRequest(req);
        if (user)
            req.user = user;
    }
    catch {
        // Invalid/expired token — treat as anonymous rather than failing.
    }
    next();
}
/** Restricts a route to the given roles. Must run after `authenticate`. */
function requireRole(...roles) {
    return (req, res, next) => {
        if (!req.user) {
            return res.status(401).json({ error: "Not authenticated" });
        }
        if (!roles.includes(req.user.role)) {
            return res.status(403).json({ error: "Insufficient permissions" });
        }
        next();
    };
}
