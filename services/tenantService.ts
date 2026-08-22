import { prisma } from "@novr/db";
import { NotFoundError } from "../lib/errors";

export interface CreateTenantInput {
  name: string;
  slug: string;
  plan?: string;
  logoUrl?: string;
  primaryColor?: string;
}

export interface UpdateTenantInput {
  name?: string;
  slug?: string;
  plan?: string;
  isActive?: boolean;
}

export interface UpdateBrandingInput {
  logoUrl?: string;
  primaryColor?: string;
  secondaryColor?: string;
  accentColor?: string;
}

export async function listTenants() {
  return prisma.tenant.findMany({
    orderBy: { createdAt: "desc" },
    include: { _count: { select: { users: true, courses: true, cohorts: true } } },
  });
}

export async function getTenantById(id: string) {
  return prisma.tenant.findUnique({
    where: { id },
    include: { _count: { select: { users: true, courses: true, cohorts: true } } },
  });
}

export async function getTenantBySlug(slug: string) {
  return prisma.tenant.findUnique({ where: { slug } });
}

export async function createTenant(input: CreateTenantInput) {
  const existing = await prisma.tenant.findUnique({ where: { slug: input.slug } });
  if (existing) {
    throw new Error("A tenant with that slug already exists");
  }
  return prisma.tenant.create({ data: input });
}

export async function updateTenant(id: string, input: UpdateTenantInput) {
  await ensureExists(id);
  return prisma.tenant.update({ where: { id }, data: input });
}

export async function updateBranding(id: string, input: UpdateBrandingInput) {
  await ensureExists(id);
  return prisma.tenant.update({ where: { id }, data: input });
}

export async function deleteTenant(id: string) {
  await ensureExists(id);
  await prisma.tenant.delete({ where: { id } });
}

async function ensureExists(id: string) {
  const tenant = await prisma.tenant.findUnique({ where: { id } });
  if (!tenant) throw new NotFoundError("Tenant not found");
}
