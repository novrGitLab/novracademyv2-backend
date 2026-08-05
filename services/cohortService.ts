import { prisma } from "@novr/db";
import { ensureCohortGroup } from "./groupService";

function slugify(name: string) {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

async function uniqueSlug(name: string, excludeId?: string): Promise<string> {
  const base = slugify(name) || "cohort";
  let slug = base;
  let suffix = 1;
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const existing = await prisma.cohort.findUnique({ where: { slug } });
    if (!existing || existing.id === excludeId) return slug;
    suffix += 1;
    slug = `${base}-${suffix}`;
  }
}

export async function listCohorts() {
  return prisma.cohort.findMany({
    orderBy: { createdAt: "desc" },
    include: { _count: { select: { members: true, alumniRecords: true } } },
  });
}

export async function getCohortById(id: string) {
  return prisma.cohort.findUnique({
    where: { id },
    include: {
      members: { include: { user: { select: { id: true, name: true, email: true } } } },
      _count: { select: { alumniRecords: true } },
    },
  });
}

export interface CreateCohortInput {
  name: string;
  year?: number;
  description?: string;
}

export async function createCohort(input: CreateCohortInput) {
  const slug = await uniqueSlug(input.name);
  const cohort = await prisma.cohort.create({ data: { ...input, slug } });
  // Community channel exists from the moment the cohort does, ready before anyone's joined yet.
  await ensureCohortGroup(cohort.id, cohort.name);
  return cohort;
}

export interface UpdateCohortInput {
  name?: string;
  year?: number;
  description?: string;
}

export async function updateCohort(id: string, input: UpdateCohortInput) {
  const data: UpdateCohortInput & { slug?: string } = { ...input };
  if (input.name) data.slug = await uniqueSlug(input.name, id);
  return prisma.cohort.update({ where: { id }, data });
}

export async function deleteCohort(id: string) {
  await prisma.cohort.delete({ where: { id } });
}

/** Matches a free-text CSV cohort label (e.g. "2019 Intake") to an existing Cohort, creating one if none matches by name. */
export async function findOrCreateCohortByLabel(label: string) {
  const trimmed = label.trim();
  if (!trimmed) return null;

  const existing = await prisma.cohort.findFirst({ where: { name: trimmed } });
  if (existing) return existing;

  return createCohort({ name: trimmed });
}
