"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.listCourses = listCourses;
exports.getCourseById = getCourseById;
exports.createCourse = createCourse;
exports.updateCourse = updateCourse;
exports.deleteCourse = deleteCourse;
const db_1 = require("@novr/db");
function slugify(title) {
    return title
        .toLowerCase()
        .trim()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/(^-|-$)/g, "");
}
async function uniqueSlug(title, excludeId) {
    const base = slugify(title) || "course";
    let slug = base;
    let suffix = 1;
    // eslint-disable-next-line no-constant-condition
    while (true) {
        const existing = await db_1.prisma.course.findUnique({ where: { slug } });
        if (!existing || existing.id === excludeId)
            return slug;
        suffix += 1;
        slug = `${base}-${suffix}`;
    }
}
async function listCourses(params) {
    const page = Math.max(1, params.page ?? 1);
    const pageSize = Math.min(100, Math.max(1, params.pageSize ?? 20));
    const where = {
        status: params.status,
        ...(params.search
            ? { title: { contains: params.search, mode: "insensitive" } }
            : {}),
    };
    const [courses, total] = await Promise.all([
        db_1.prisma.course.findMany({
            where,
            orderBy: { createdAt: "desc" },
            skip: (page - 1) * pageSize,
            take: pageSize,
            include: {
                _count: { select: { lessons: true, enrollments: true } },
            },
        }),
        db_1.prisma.course.count({ where }),
    ]);
    return { courses, total, page, pageSize };
}
async function getCourseById(id) {
    return db_1.prisma.course.findUnique({
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
async function createCourse(input) {
    const slug = await uniqueSlug(input.title);
    return db_1.prisma.course.create({
        data: { ...input, slug },
    });
}
async function updateCourse(id, input) {
    const data = { ...input };
    if (input.title) {
        data.slug = await uniqueSlug(input.title, id);
    }
    return db_1.prisma.course.update({ where: { id }, data });
}
async function deleteCourse(id) {
    await db_1.prisma.course.delete({ where: { id } });
}
