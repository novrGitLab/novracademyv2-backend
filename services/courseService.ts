import { prisma } from "@novr/db";
import type { CourseStatus } from "@novr/types";

function slugify(title: string) {
  return title
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

async function uniqueSlug(title: string, excludeId?: string): Promise<string> {
  const base = slugify(title) || "course";
  let slug = base;
  let suffix = 1;
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const existing = await prisma.course.findUnique({ where: { slug } });
    if (!existing || existing.id === excludeId) return slug;
    suffix += 1;
    slug = `${base}-${suffix}`;
  }
}

export interface ListCoursesParams {
  status?: CourseStatus;
  search?: string;
  page?: number;
  pageSize?: number;
}

export async function listCourses(params: ListCoursesParams) {
  const page = Math.max(1, params.page ?? 1);
  const pageSize = Math.min(100, Math.max(1, params.pageSize ?? 20));

  const where = {
    status: params.status,
    ...(params.search
      ? { title: { contains: params.search, mode: "insensitive" as const } }
      : {}),
  };

  const [courses, total] = await Promise.all([
    prisma.course.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
      include: {
        _count: { select: { lessons: true, enrollments: true } },
      },
    }),
    prisma.course.count({ where }),
  ]);

  return { courses, total, page, pageSize };
}

export async function getCourseById(id: string) {
  return prisma.course.findUnique({
    where: { id },
    include: {
      lessons: {
        orderBy: { order: "asc" },
        include: { quiz: { include: { questions: { orderBy: { order: "asc" } } } } },
      },
      _count: { select: { enrollments: true, certificates: true } },
    },
  });
}

export interface CreateCourseInput {
  title: string;
  description?: string;
  thumbnailUrl?: string;
  priceCents?: number;
  currency?: string;
  passMarkPct?: number;
  allowForwardScrub?: boolean;
  defaultValidityDays?: number;
  createdById?: string;
}

export async function createCourse(input: CreateCourseInput) {
  const slug = await uniqueSlug(input.title);
  return prisma.course.create({
    data: { ...input, slug },
  });
}

export interface UpdateCourseInput {
  title?: string;
  description?: string;
  thumbnailUrl?: string;
  status?: CourseStatus;
  priceCents?: number;
  currency?: string;
  passMarkPct?: number;
  allowForwardScrub?: boolean;
  defaultValidityDays?: number;
}

export async function updateCourse(id: string, input: UpdateCourseInput) {
  const data: UpdateCourseInput & { slug?: string } = { ...input };
  if (input.title) {
    data.slug = await uniqueSlug(input.title, id);
  }
  return prisma.course.update({ where: { id }, data });
}

export async function deleteCourse(id: string) {
  await prisma.course.delete({ where: { id } });
}
