import type { NextFunction, Request, Response } from "express";
import { UserRole } from "@novr/types";

/**
 * Attaches organizationId to req.user from the authenticated user.
 * Must run after `authenticate` middleware.
 */
export function attachOrganization(req: Request, _res: Response, next: NextFunction) {
  if (!req.user) {
    return next();
  }
  next();
}

/**
 * Returns a Prisma where clause filter scoped to the user's organization.
 * SUPER_ADMIN bypasses tenant scope and sees all data.
 */
export function tenantScope(user: { role: string; organizationId?: string | null }, baseWhere: Record<string, unknown> = {}) {
  if (user.role === UserRole.SUPER_ADMIN) {
    return baseWhere;
  }
  if (!user.organizationId) {
    return { ...baseWhere, organizationId: null };
  }
  return { ...baseWhere, organizationId: user.organizationId };
}

/**
 * Returns true if the user is a SUPER_ADMIN (sees all tenants).
 */
export function isSuperAdmin(user: { role: string }) {
  return user.role === UserRole.SUPER_ADMIN;
}

/**
 * Returns true if the user belongs to the given organization.
 */
export function belongsToOrg(user: { role?: string; organizationId?: string | null }, organizationId: string) {
  if (user.role && isSuperAdmin({ role: user.role })) return true;
  return user.organizationId === organizationId;
}
