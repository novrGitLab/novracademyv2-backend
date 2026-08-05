import { prisma } from "@novr/db";
import { ADMIN_ROLES, JobListingStatus, type JobLocationType } from "@novr/types";
import { NotFoundError } from "../lib/errors";
import { enqueueJobAlertEmails } from "../queues/emailQueue";

export interface CreateListingInput {
  postedById: string;
  title: string;
  company: string;
  locationType: JobLocationType;
  location?: string;
  link?: string;
  description?: string;
  expiresAt?: Date;
}

export async function createListing(input: CreateListingInput) {
  return prisma.jobListing.create({ data: { ...input, status: JobListingStatus.PENDING } });
}

export interface ListListingsParams {
  status?: JobListingStatus;
  viewerRole: string;
}

export async function listListings(params: ListListingsParams) {
  const isAdmin = ADMIN_ROLES.includes(params.viewerRole as never);
  const where = isAdmin
    ? { status: params.status }
    : { status: JobListingStatus.APPROVED, OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }] };

  return prisma.jobListing.findMany({
    where,
    orderBy: [{ isFeatured: "desc" }, { createdAt: "desc" }],
    include: { postedBy: { select: { id: true, name: true, email: true } } },
  });
}

export async function updateListingStatus(id: string, status: JobListingStatus) {
  const listing = await prisma.jobListing.update({ where: { id }, data: { status } });
  if (status === JobListingStatus.APPROVED) {
    await enqueueJobAlertEmails(listing.id);
  }
  return listing;
}

export async function toggleFeatured(id: string, isFeatured: boolean) {
  return prisma.jobListing.update({ where: { id }, data: { isFeatured } });
}

export async function deleteListing(id: string, requesterId: string, isAdmin: boolean) {
  const listing = await prisma.jobListing.findUnique({ where: { id } });
  if (!listing) throw new NotFoundError("Listing not found");
  if (listing.postedById !== requesterId && !isAdmin) {
    throw new NotFoundError("Listing not found");
  }
  await prisma.jobListing.delete({ where: { id } });
}

/** Broad match: everyone with the "open to work" flag set. There's no skills/topic field on User to narrow further. */
export async function getOpenToWorkUserIds() {
  const users = await prisma.user.findMany({ where: { openToWork: true }, select: { id: true, email: true, name: true } });
  return users;
}
