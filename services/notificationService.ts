import { prisma } from "@novr/db";
import { NotificationType } from "@novr/types";
import { enqueueSegmentNotificationEmail } from "../queues/emailQueue";

export async function listMyNotifications(userId: string) {
  return prisma.notification.findMany({ where: { userId }, orderBy: { createdAt: "desc" }, take: 50 });
}

export async function getUnreadCount(userId: string) {
  return prisma.notification.count({ where: { userId, read: false } });
}

export async function markNotificationRead(id: string, userId: string) {
  await prisma.notification.updateMany({ where: { id, userId }, data: { read: true, readAt: new Date() } });
}

export async function markAllRead(userId: string) {
  await prisma.notification.updateMany({ where: { userId, read: false }, data: { read: true, readAt: new Date() } });
}

export type Segment = "all" | "inactive" | "mentors" | "open_to_work";

async function resolveSegmentUserIds(segment: Segment): Promise<string[]> {
  switch (segment) {
    case "all": {
      const users = await prisma.user.findMany({ select: { id: true } });
      return users.map((u) => u.id);
    }
    case "inactive": {
      const users = await prisma.user.findMany({
        where: { posts: { none: {} }, sentMessages: { none: {} } },
        select: { id: true },
      });
      return users.map((u) => u.id);
    }
    case "mentors": {
      const profiles = await prisma.mentorProfile.findMany({ where: { isActive: true }, select: { userId: true } });
      return profiles.map((p) => p.userId);
    }
    case "open_to_work": {
      const users = await prisma.user.findMany({ where: { openToWork: true }, select: { id: true } });
      return users.map((u) => u.id);
    }
  }
}

export interface ComposeInput {
  segment: Segment;
  title: string;
  content: string;
  channels: ("in_app" | "email")[];
}

export async function composeToSegment(input: ComposeInput) {
  const userIds = await resolveSegmentUserIds(input.segment);

  if (input.channels.includes("in_app")) {
    await prisma.notification.createMany({
      data: userIds.map((userId) => ({
        userId,
        type: NotificationType.GENERAL,
        title: input.title,
        content: input.content,
      })),
    });
  }
  if (input.channels.includes("email")) {
    await enqueueSegmentNotificationEmail(userIds, input.title, input.content);
  }

  return { recipientCount: userIds.length };
}

/**
 * There's no separate "campaign" table, so history is reconstructed by
 * bucketing in-app notifications with the same title sent in the same
 * minute — good enough to show what was sent and to whom, without the
 * overhead of a dedicated model. Open-rate tracking isn't implemented
 * (would need Resend's webhook events wired up) — this only tracks
 * in-app read state.
 */
export async function getNotificationHistory() {
  const recent = await prisma.notification.findMany({
    orderBy: { createdAt: "desc" },
    take: 500,
    select: { title: true, createdAt: true, read: true },
  });

  const batches = new Map<string, { title: string; sentAt: string; recipientCount: number; readCount: number }>();
  for (const n of recent) {
    const bucketMinute = n.createdAt.toISOString().slice(0, 16);
    const key = `${n.title}__${bucketMinute}`;
    const existing = batches.get(key);
    if (existing) {
      existing.recipientCount += 1;
      if (n.read) existing.readCount += 1;
    } else {
      batches.set(key, {
        title: n.title,
        sentAt: n.createdAt.toISOString(),
        recipientCount: 1,
        readCount: n.read ? 1 : 0,
      });
    }
  }
  return Array.from(batches.values());
}
