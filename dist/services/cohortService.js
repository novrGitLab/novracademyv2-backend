"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.listCohorts = listCohorts;
exports.getCohortById = getCohortById;
exports.createCohort = createCohort;
exports.updateCohort = updateCohort;
exports.deleteCohort = deleteCohort;
exports.findOrCreateCohortByLabel = findOrCreateCohortByLabel;
const db_1 = require("@novr/db");
const groupService_1 = require("./groupService");
function slugify(name) {
    return name
        .toLowerCase()
        .trim()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/(^-|-$)/g, "");
}
async function uniqueSlug(name, excludeId) {
    const base = slugify(name) || "cohort";
    let slug = base;
    let suffix = 1;
    // eslint-disable-next-line no-constant-condition
    while (true) {
        const existing = await db_1.prisma.cohort.findUnique({ where: { slug } });
        if (!existing || existing.id === excludeId)
            return slug;
        suffix += 1;
        slug = `${base}-${suffix}`;
    }
}
async function listCohorts() {
    return db_1.prisma.cohort.findMany({
        orderBy: { createdAt: "desc" },
        include: { _count: { select: { members: true, alumniRecords: true } } },
    });
}
async function getCohortById(id) {
    return db_1.prisma.cohort.findUnique({
        where: { id },
        include: {
            members: { include: { user: { select: { id: true, name: true, email: true } } } },
            _count: { select: { alumniRecords: true } },
        },
    });
}
async function createCohort(input) {
    const slug = await uniqueSlug(input.name);
    const cohort = await db_1.prisma.cohort.create({ data: { ...input, slug } });
    // Community channel exists from the moment the cohort does, ready before anyone's joined yet.
    await (0, groupService_1.ensureCohortGroup)(cohort.id, cohort.name);
    return cohort;
}
async function updateCohort(id, input) {
    const data = { ...input };
    if (input.name)
        data.slug = await uniqueSlug(input.name, id);
    return db_1.prisma.cohort.update({ where: { id }, data });
}
async function deleteCohort(id) {
    await db_1.prisma.cohort.delete({ where: { id } });
}
/** Matches a free-text CSV cohort label (e.g. "2019 Intake") to an existing Cohort, creating one if none matches by name. */
async function findOrCreateCohortByLabel(label) {
    const trimmed = label.trim();
    if (!trimmed)
        return null;
    const existing = await db_1.prisma.cohort.findFirst({ where: { name: trimmed } });
    if (existing)
        return existing;
    return createCohort({ name: trimmed });
}
