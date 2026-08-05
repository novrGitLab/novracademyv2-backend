"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createListing = createListing;
exports.listListings = listListings;
exports.updateListingStatus = updateListingStatus;
exports.toggleFeatured = toggleFeatured;
exports.deleteListing = deleteListing;
exports.getOpenToWorkUserIds = getOpenToWorkUserIds;
const db_1 = require("@novr/db");
const types_1 = require("@novr/types");
const errors_1 = require("../lib/errors");
const emailQueue_1 = require("../queues/emailQueue");
async function createListing(input) {
    return db_1.prisma.jobListing.create({ data: { ...input, status: types_1.JobListingStatus.PENDING } });
}
async function listListings(params) {
    const isAdmin = types_1.ADMIN_ROLES.includes(params.viewerRole);
    const where = isAdmin
        ? { status: params.status }
        : { status: types_1.JobListingStatus.APPROVED, OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }] };
    return db_1.prisma.jobListing.findMany({
        where,
        orderBy: [{ isFeatured: "desc" }, { createdAt: "desc" }],
        include: { postedBy: { select: { id: true, name: true, email: true } } },
    });
}
async function updateListingStatus(id, status) {
    const listing = await db_1.prisma.jobListing.update({ where: { id }, data: { status } });
    if (status === types_1.JobListingStatus.APPROVED) {
        await (0, emailQueue_1.enqueueJobAlertEmails)(listing.id);
    }
    return listing;
}
async function toggleFeatured(id, isFeatured) {
    return db_1.prisma.jobListing.update({ where: { id }, data: { isFeatured } });
}
async function deleteListing(id, requesterId, isAdmin) {
    const listing = await db_1.prisma.jobListing.findUnique({ where: { id } });
    if (!listing)
        throw new errors_1.NotFoundError("Listing not found");
    if (listing.postedById !== requesterId && !isAdmin) {
        throw new errors_1.NotFoundError("Listing not found");
    }
    await db_1.prisma.jobListing.delete({ where: { id } });
}
/** Broad match: everyone with the "open to work" flag set. There's no skills/topic field on User to narrow further. */
async function getOpenToWorkUserIds() {
    const users = await db_1.prisma.user.findMany({ where: { openToWork: true }, select: { id: true, email: true, name: true } });
    return users;
}
