import { prisma } from "@novr/db";
import { MentorSessionStatus } from "@novr/types";
import { ApiError, NotFoundError } from "../lib/errors";

export interface UpsertMentorProfileInput {
  topics: string[];
  availability?: string;
  capacityPerMonth?: number;
  isActive?: boolean;
}

export async function upsertMentorProfile(userId: string, input: UpsertMentorProfileInput) {
  return prisma.mentorProfile.upsert({
    where: { userId },
    create: { userId, ...input },
    update: input,
  });
}

export async function getMentorProfile(userId: string) {
  return prisma.mentorProfile.findUnique({ where: { userId } });
}

function currentMonthRange() {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), 1);
  const end = new Date(now.getFullYear(), now.getMonth() + 1, 1);
  return { start, end };
}

async function sessionsThisMonth(mentorId: string) {
  const { start, end } = currentMonthRange();
  return prisma.mentorSession.count({
    where: {
      mentorId,
      status: { in: [MentorSessionStatus.ACCEPTED, MentorSessionStatus.COMPLETED] },
      createdAt: { gte: start, lt: end },
    },
  });
}

export interface ListMentorsParams {
  topic?: string;
}

export async function listMentors(params: ListMentorsParams) {
  const profiles = await prisma.mentorProfile.findMany({
    where: {
      isActive: true,
      topics: params.topic ? { has: params.topic } : undefined,
    },
    include: { user: { select: { id: true, name: true, email: true, avatarUrl: true, bio: true } } },
  });

  return Promise.all(
    profiles.map(async (p) => ({
      ...p,
      bookedThisMonth: await sessionsThisMonth(p.userId),
    }))
  );
}

export interface RequestSessionInput {
  mentorId: string;
  menteeId: string;
  topic: string;
  scheduledAt?: Date;
}

export async function requestSession(input: RequestSessionInput) {
  if (input.mentorId === input.menteeId) throw new ApiError(400, "You can't request a session with yourself");

  const profile = await prisma.mentorProfile.findUnique({ where: { userId: input.mentorId } });
  if (!profile || !profile.isActive) throw new NotFoundError("This mentor isn't accepting sessions right now");

  return prisma.mentorSession.create({
    data: {
      mentorId: input.mentorId,
      menteeId: input.menteeId,
      topic: input.topic,
      scheduledAt: input.scheduledAt,
      status: MentorSessionStatus.REQUESTED,
    },
  });
}

async function assertParticipant(sessionId: string, userId: string) {
  const session = await prisma.mentorSession.findUnique({ where: { id: sessionId } });
  if (!session) throw new NotFoundError("Session not found");
  if (session.mentorId !== userId && session.menteeId !== userId) {
    throw new NotFoundError("Session not found");
  }
  return session;
}

export async function respondToSession(sessionId: string, mentorId: string, accept: boolean) {
  const session = await prisma.mentorSession.findUnique({ where: { id: sessionId } });
  if (!session) throw new NotFoundError("Session not found");
  if (session.mentorId !== mentorId) throw new NotFoundError("Session not found");
  if (session.status !== MentorSessionStatus.REQUESTED) {
    throw new ApiError(400, "This session has already been responded to");
  }

  if (accept) {
    const profile = await prisma.mentorProfile.findUnique({ where: { userId: mentorId } });
    const booked = await sessionsThisMonth(mentorId);
    if (profile && booked >= profile.capacityPerMonth) {
      throw new ApiError(400, "You've reached your mentoring capacity for this month");
    }
  }

  return prisma.mentorSession.update({
    where: { id: sessionId },
    data: { status: accept ? MentorSessionStatus.ACCEPTED : MentorSessionStatus.DECLINED },
  });
}

export async function cancelSession(sessionId: string, userId: string) {
  await assertParticipant(sessionId, userId);
  return prisma.mentorSession.update({ where: { id: sessionId }, data: { status: MentorSessionStatus.CANCELLED } });
}

export interface CompleteSessionInput {
  rating?: number;
  feedback?: string;
}

export async function completeSession(sessionId: string, userId: string, input: CompleteSessionInput) {
  const session = await assertParticipant(sessionId, userId);
  if (session.status !== MentorSessionStatus.ACCEPTED) {
    throw new ApiError(400, "Only an accepted session can be marked complete");
  }
  // Only the mentee rates the mentor.
  const ratingFields = session.menteeId === userId ? input : {};
  return prisma.mentorSession.update({
    where: { id: sessionId },
    data: { status: MentorSessionStatus.COMPLETED, ...ratingFields },
  });
}

export async function listMySessions(userId: string) {
  const [asMentor, asMentee] = await Promise.all([
    prisma.mentorSession.findMany({
      where: { mentorId: userId },
      orderBy: { createdAt: "desc" },
      include: { mentee: { select: { id: true, name: true, email: true } } },
    }),
    prisma.mentorSession.findMany({
      where: { menteeId: userId },
      orderBy: { createdAt: "desc" },
      include: { mentor: { select: { id: true, name: true, email: true } } },
    }),
  ]);
  return { asMentor, asMentee };
}
