import { prisma } from "@novr/db";

interface ListBootcampsParams {
  status?: string;
  search?: string;
  page?: number;
  pageSize?: number;
  userId?: string;
}

export async function listBootcamps(params: ListBootcampsParams) {
  const page = Math.max(1, params.page ?? 1);
  const pageSize = Math.min(50, Math.max(1, params.pageSize ?? 20));

  const where: Record<string, unknown> = {};
  if (params.status) (where as Record<string, unknown>).status = params.status;
  if (params.search) {
    const s = params.search;
    (where as Record<string, unknown>).OR = [
      { title: { contains: s, mode: "insensitive" } },
      { description: { contains: s, mode: "insensitive" } },
      { instructorName: { contains: s, mode: "insensitive" } },
      { topics: { has: s } },
    ];
  }

  const [total, bootcamps] = await Promise.all([
    prisma.bootcamp.count({ where }),
    prisma.bootcamp.findMany({
      where,
      orderBy: [{ startAt: "asc" }],
      skip: (page - 1) * pageSize,
      take: pageSize,
      include: {
        _count: { select: { enrollments: true } },
        enrollments: params.userId
          ? { where: { userId: params.userId }, select: { id: true } }
          : false,
      },
    }),
  ]);

  return { bootcamps, total, page, pageSize };
}

export async function getBootcampById(id: string) {
  return prisma.bootcamp.findUnique({
    where: { id },
    include: {
      _count: { select: { enrollments: true } },
      createdBy: { select: { id: true, name: true, email: true } },
      course: { select: { id: true, title: true } },
    },
  });
}

export interface CreateBootcampInput {
  title: string;
  description?: string;
  instructorName?: string;
  instructorId?: string;
  startAt: Date;
  endAt: Date;
  scheduleLabel?: string;
  format?: string;
  location?: string;
  seatsTotal: number;
  level?: string;
  topics?: string[];
  courseId?: string;
  createdById: string;
}

export async function createBootcamp(input: CreateBootcampInput) {
  if (new Date(input.endAt) <= new Date(input.startAt)) {
    throw new Error("End date must be after start date");
  }
  if (input.seatsTotal < 1) {
    throw new Error("Seats must be at least 1");
  }
  return prisma.bootcamp.create({
    data: {
      title: input.title,
      description: input.description,
      instructorName: input.instructorName,
      instructorId: input.instructorId,
      startAt: new Date(input.startAt),
      endAt: new Date(input.endAt),
      scheduleLabel: input.scheduleLabel,
      format: input.format ?? "ONLINE",
      location: input.location,
      seatsTotal: input.seatsTotal,
      level: input.level ?? "Beginner",
      topics: input.topics ?? [],
      courseId: input.courseId,
      status: "UPCOMING",
      createdById: input.createdById,
    },
  });
}

export async function updateBootcamp(id: string, input: Partial<Omit<CreateBootcampInput, "createdById">> & { status?: string }) {
  const data: Record<string, unknown> = {};
  if (input.title !== undefined) data.title = input.title;
  if (input.description !== undefined) data.description = input.description;
  if (input.instructorName !== undefined) data.instructorName = input.instructorName;
  if (input.instructorId !== undefined) data.instructorId = input.instructorId;
  if (input.startAt !== undefined) data.startAt = new Date(input.startAt);
  if (input.endAt !== undefined) data.endAt = new Date(input.endAt);
  if (input.scheduleLabel !== undefined) data.scheduleLabel = input.scheduleLabel;
  if (input.format !== undefined) data.format = input.format;
  if (input.location !== undefined) data.location = input.location;
  if (input.seatsTotal !== undefined) data.seatsTotal = input.seatsTotal;
  if (input.level !== undefined) data.level = input.level;
  if (input.topics !== undefined) data.topics = input.topics;
  if (input.courseId !== undefined) data.courseId = input.courseId || null;
  if ((input as { status?: string }).status !== undefined) data.status = (input as { status?: string }).status;
  return prisma.bootcamp.update({ where: { id }, data });
}

export async function deleteBootcamp(id: string) {
  await prisma.bootcamp.delete({ where: { id } });
}

export async function registerBootcamp(bootcampId: string, userId: string) {
  const bootcamp = await prisma.bootcamp.findUniqueOrThrow({ where: { id: bootcampId } });
  const count = await prisma.bootcampEnrollment.count({ where: { bootcampId } });
  if (count >= bootcamp.seatsTotal) throw new Error("This bootcamp is full");
  return prisma.bootcampEnrollment.create({
    data: { bootcampId, userId },
  });
}

export async function cancelBootcampEnrollment(bootcampId: string, userId: string) {
  await prisma.bootcampEnrollment.delete({
    where: { bootcampId_userId: { bootcampId, userId } },
  });
}

export async function listMyBootcamps(userId: string) {
  return prisma.bootcampEnrollment.findMany({
    where: { userId },
    include: { bootcamp: { include: { _count: { select: { enrollments: true } } } } },
  });
}
