import { prisma } from "@novr/db";
import { ApiError, NotFoundError } from "../lib/errors";

const MAX_GROUP_DM_PARTICIPANTS = 20;

async function assertParticipant(threadId: string, userId: string) {
  const participant = await prisma.messageThreadParticipant.findUnique({
    where: { threadId_userId: { threadId, userId } },
  });
  if (!participant) throw new NotFoundError("Thread not found");
}

/** Reuses an existing 1:1 thread between these two users if one exists, rather than creating duplicates. */
export async function getOrCreateDirectThread(userId: string, otherUserId: string) {
  if (userId === otherUserId) throw new ApiError(400, "Can't message yourself");

  const otherUser = await prisma.user.findUnique({ where: { id: otherUserId } });
  if (!otherUser) throw new NotFoundError("User not found");

  const existing = await prisma.messageThread.findFirst({
    where: {
      isGroup: false,
      AND: [
        { participants: { some: { userId } } },
        { participants: { some: { userId: otherUserId } } },
      ],
    },
  });
  if (existing) return existing;

  return prisma.messageThread.create({
    data: {
      isGroup: false,
      participants: { create: [{ userId }, { userId: otherUserId }] },
    },
  });
}

export async function createGroupThread(creatorId: string, participantIds: string[], name?: string) {
  const uniqueIds = [...new Set([creatorId, ...participantIds])];
  if (uniqueIds.length < 3) {
    throw new ApiError(400, "A group DM needs at least 3 participants — use a direct thread otherwise");
  }
  if (uniqueIds.length > MAX_GROUP_DM_PARTICIPANTS) {
    throw new ApiError(400, `Group DMs are limited to ${MAX_GROUP_DM_PARTICIPANTS} participants`);
  }

  return prisma.messageThread.create({
    data: {
      isGroup: true,
      name,
      participants: { create: uniqueIds.map((userId) => ({ userId })) },
    },
  });
}

export async function listMyThreads(userId: string) {
  const participations = await prisma.messageThreadParticipant.findMany({
    where: { userId },
    include: {
      thread: {
        include: {
          participants: { include: { user: { select: { id: true, name: true, email: true, avatarUrl: true } } } },
          messages: { orderBy: { createdAt: "desc" }, take: 1 },
        },
      },
    },
  });

  const threads = await Promise.all(
    participations.map(async (p) => {
      const unreadCount = await prisma.message.count({
        where: { threadId: p.threadId, senderId: { not: userId }, readReceipts: { none: { userId } } },
      });
      return {
        id: p.thread.id,
        isGroup: p.thread.isGroup,
        name: p.thread.name,
        participants: p.thread.participants.map((pp) => pp.user),
        lastMessage: p.thread.messages[0] ?? null,
        unreadCount,
      };
    })
  );

  return threads.sort((a, b) => {
    const at = a.lastMessage ? new Date(a.lastMessage.createdAt).getTime() : 0;
    const bt = b.lastMessage ? new Date(b.lastMessage.createdAt).getTime() : 0;
    return bt - at;
  });
}

export async function getThreadMessages(threadId: string, userId: string) {
  await assertParticipant(threadId, userId);
  return prisma.message.findMany({
    where: { threadId },
    orderBy: { createdAt: "asc" },
    include: { sender: { select: { id: true, name: true, email: true, avatarUrl: true } } },
  });
}

export interface SendMessageInput {
  threadId: string;
  senderId: string;
  content: string;
  mediaUrls?: string[];
}

export async function sendMessage(input: SendMessageInput) {
  await assertParticipant(input.threadId, input.senderId);
  const message = await prisma.message.create({
    data: {
      threadId: input.threadId,
      senderId: input.senderId,
      content: input.content,
      mediaUrls: input.mediaUrls ?? [],
    },
    include: { sender: { select: { id: true, name: true, email: true, avatarUrl: true } } },
  });

  // Sending implicitly reads your own message.
  await prisma.messageReadReceipt.create({ data: { messageId: message.id, userId: input.senderId } }).catch(() => {});

  return message;
}

export async function markThreadRead(threadId: string, userId: string) {
  await assertParticipant(threadId, userId);
  const unread = await prisma.message.findMany({
    where: { threadId, senderId: { not: userId }, readReceipts: { none: { userId } } },
    select: { id: true },
  });
  if (unread.length === 0) return;
  await prisma.messageReadReceipt.createMany({
    data: unread.map((m) => ({ messageId: m.id, userId })),
    skipDuplicates: true,
  });
}

export async function getThreadParticipantIds(threadId: string): Promise<string[]> {
  const participants = await prisma.messageThreadParticipant.findMany({
    where: { threadId },
    select: { userId: true },
  });
  return participants.map((p) => p.userId);
}
