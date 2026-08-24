import { prisma } from "@novr/db";
import { NewsletterSource, NewsletterStatus } from "@novr/types";
import { ApiError, NotFoundError } from "../lib/errors";

export interface SubscribeInput {
  email: string;
  firstName?: string;
  lastName?: string;
  source?: NewsletterSource;
}

/**
 * Public subscribe — used by the website embed. Re-activates a previously
 * unsubscribed email rather than erroring, so someone who changes their
 * mind doesn't get a confusing "already exists" response.
 */
export async function subscribe(input: SubscribeInput) {
  const existing = await prisma.newsletterSubscriber.findUnique({ where: { email: input.email } });
  if (existing) {
    if (existing.status === NewsletterStatus.ACTIVE) return existing;
    return prisma.newsletterSubscriber.update({
      where: { id: existing.id },
      data: { status: NewsletterStatus.ACTIVE, unsubscribedAt: null },
    });
  }
  return prisma.newsletterSubscriber.create({
    data: {
      email: input.email,
      firstName: input.firstName,
      lastName: input.lastName,
      source: input.source ?? NewsletterSource.WEBSITE,
    },
  });
}

export async function unsubscribeByToken(token: string) {
  const subscriber = await prisma.newsletterSubscriber.findUnique({ where: { unsubscribeToken: token } });
  if (!subscriber) throw new NotFoundError("Subscriber not found");
  return prisma.newsletterSubscriber.update({
    where: { id: subscriber.id },
    data: { status: NewsletterStatus.UNSUBSCRIBED, unsubscribedAt: new Date() },
  });
}

export async function listSubscribers(params: { search?: string; page?: number; pageSize?: number }) {
  const page = params.page ?? 1;
  const pageSize = Math.min(params.pageSize ?? 25, 100);

  const where = params.search
    ? {
        OR: [
          { email: { contains: params.search, mode: "insensitive" as const } },
          { firstName: { contains: params.search, mode: "insensitive" as const } },
          { lastName: { contains: params.search, mode: "insensitive" as const } },
        ],
      }
    : {};

  const [subscribers, total] = await Promise.all([
    prisma.newsletterSubscriber.findMany({
      where,
      orderBy: { subscribedAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.newsletterSubscriber.count({ where }),
  ]);

  return { subscribers, total, page, pageSize };
}

export async function listAllActiveEmails() {
  return prisma.newsletterSubscriber.findMany({
    where: { status: NewsletterStatus.ACTIVE },
    select: { email: true, firstName: true, unsubscribeToken: true },
  });
}

export interface ImportRow {
  email: string;
  firstName?: string;
  lastName?: string;
}

/** Bulk CSV import — rows are parsed client-side and posted as JSON (same pattern as alumni import). */
export async function importSubscribers(rows: ImportRow[]) {
  let imported = 0;
  let skipped = 0;
  for (const row of rows) {
    if (!row.email) {
      skipped++;
      continue;
    }
    try {
      await prisma.newsletterSubscriber.upsert({
        where: { email: row.email },
        update: {},
        create: {
          email: row.email,
          firstName: row.firstName,
          lastName: row.lastName,
          source: NewsletterSource.IMPORT,
        },
      });
      imported++;
    } catch {
      skipped++;
    }
  }
  return { imported, skipped };
}

export async function addSubscriberManually(input: SubscribeInput) {
  const existing = await prisma.newsletterSubscriber.findUnique({ where: { email: input.email } });
  if (existing) throw new ApiError(409, "A subscriber with this email already exists");
  return prisma.newsletterSubscriber.create({
    data: {
      email: input.email,
      firstName: input.firstName,
      lastName: input.lastName,
      source: NewsletterSource.MANUAL,
    },
  });
}
