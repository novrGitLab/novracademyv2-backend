import { prisma } from "@novr/db";
import { CourseStatus } from "@novr/types";

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
  organizationId?: string | null;
  page?: number;
  pageSize?: number;
}

export async function listCourses(params: ListCoursesParams) {
  const page = Math.max(1, params.page ?? 1);
  const pageSize = Math.min(100, Math.max(1, params.pageSize ?? 20));

  const where = {
    status: params.status,
    ...(params.organizationId !== undefined && { organizationId: params.organizationId }),
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

/**
 * Lightweight course "meta" for the lesson player's prev/next navigation and
 * breadcrumb — title + the ordered lesson index. Avoids fetching the full
 * course/lesson/quiz tree just to draw a breadcrumb.
 */
export async function getCourseNavMeta(id: string) {
  return prisma.course.findUnique({
    where: { id },
    select: {
      id: true,
      title: true,
      lessons: {
        orderBy: { order: "asc" },
        select: { id: true, title: true, order: true },
      },
    },
  });
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

/**
 * Lean course detail for learners. The student course page only renders the
 * lesson index (title/type/order) plus the viewer's payment history, so we
 * skip the full quiz-question tree and heavy JSON blobs (slidesManifest,
 * content URLs, Mux fields). Admins use getCourseById (full tree) instead.
 */
export async function getCourseDetailForLearner(id: string, userId: string) {
  return prisma.course.findUnique({
    where: { id },
    select: {
      id: true,
      title: true,
      description: true,
      thumbnailUrl: true,
      priceCents: true,
      currency: true,
      status: true,
      createdAt: true,
      lessons: {
        orderBy: { order: "asc" },
        select: {
          id: true,
          title: true,
          type: true,
          order: true,
          // Lean signal so the UI can show quiz/live/slides affordances.
          quiz: { select: { id: true, passMarkPct: true } },
          videoStatus: true,
        },
      },
      payments: {
        where: { userId },
        select: { id: true, status: true, amountCents: true, currency: true, provider: true, createdAt: true },
      },
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
  organizationId?: string | null;
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
  await prisma.course.update({
    where: { id },
    data: { status: CourseStatus.ARCHIVED },
  });
}
