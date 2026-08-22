import type { NextFunction, Request, Response } from "express";
import { prisma } from "@novr/db";

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      tenant?: { id: string; name: string; slug: string; isActive: boolean };
    }
  }
}

// Hosts that never carry a tenant subdomain, so we don't try to look up
// "localhost" or a raw IP/Railway hostname as a slug.
const RESERVED_LABELS = new Set(["www", "app", "api", "localhost"]);

/**
 * Pulls a tenant slug off the request's Host header, e.g.
 * `acme.novracademy.com` -> "acme". Bare domains, IPs, and hosts with fewer
 * than 3 labels (no subdomain present) resolve to no slug.
 */
export function extractTenantSlug(host: string | undefined): string | null {
  if (!host) return null;
  const hostname = host.split(":")[0].trim().toLowerCase();
  if (!hostname || hostname === "localhost" || /^\d{1,3}(\.\d{1,3}){3}$/.test(hostname)) {
    return null;
  }
  const labels = hostname.split(".");
  if (labels.length < 3) return null; // e.g. "novracademy.com" — no subdomain
  const candidate = labels[0];
  if (RESERVED_LABELS.has(candidate)) return null;
  return candidate;
}

/**
 * Resolves the tenant from the request's subdomain and attaches it to
 * `req.tenant`. Never rejects the request — most routes today are still
 * usable without a tenant (single-tenant deployments, or hosts without a
 * subdomain), so an unresolved/unknown/inactive tenant just leaves
 * `req.tenant` unset rather than 404ing every request.
 */
export async function resolveTenant(req: Request, _res: Response, next: NextFunction) {
  try {
    const slug = extractTenantSlug(req.headers.host);
    if (!slug) return next();

    const tenant = await prisma.tenant.findUnique({
      where: { slug },
      select: { id: true, name: true, slug: true, isActive: true },
    });
    if (tenant?.isActive) {
      req.tenant = tenant;
    }
  } catch (err) {
    console.error("Tenant resolution failed:", err instanceof Error ? err.message : err);
  }
  next();
}

/** Rejects the request if no active tenant was resolved from the subdomain. */
export function requireTenant(req: Request, res: Response, next: NextFunction) {
  if (!req.tenant) {
    return res.status(404).json({ error: "Unknown tenant" });
  }
  next();
}
