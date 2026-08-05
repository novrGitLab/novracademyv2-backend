import { prisma } from "@novr/db";
import { LessonType } from "@novr/types";
import { InvalidLessonTypeError, LessonLockedError, NotEnrolledError, NotFoundError } from "../lib/errors";
import { getActiveEnrollment, getCourseProgress, recalculateEnrollmentProgress } from "./progressService";

export async function setRsvp(userId: string, courseId: string, lessonId: string, going: boolean) {
  const enrollment = await getActiveEnrollment(userId, courseId);
  if (!enrollment) throw new NotEnrolledError();

  const lesson = await prisma.lesson.findUnique({ where: { id: lessonId } });
  if (!lesson || lesson.courseId !== courseId) throw new NotFoundError("Lesson not found");
  if (lesson.type !== LessonType.LIVE) throw new InvalidLessonTypeError("This lesson is not a live class");

  const progress = await getCourseProgress(userId, courseId);
  const entry = progress.lessons.find((l) => l.lessonId === lessonId);
  if (!entry?.unlocked) throw new LessonLockedError();

  return prisma.liveAttendance.upsert({
    where: { lessonId_userId: { lessonId, userId } },
    create: { lessonId, userId, rsvp: going },
    update: { rsvp: going },
  });
}

export async function getMyAttendance(userId: string, lessonId: string) {
  return prisma.liveAttendance.findUnique({ where: { lessonId_userId: { lessonId, userId } } });
}

export async function listAttendanceForLesson(lessonId: string) {
  const attendance = await prisma.liveAttendance.findMany({
    where: { lessonId },
    orderBy: { createdAt: "asc" },
  });
  const users = await prisma.user.findMany({
    where: { id: { in: attendance.map((a) => a.userId) } },
    select: { id: true, name: true, email: true },
  });
  const userById = new Map(users.map((u) => [u.id, u]));
  return attendance.map((a) => ({ ...a, user: userById.get(a.userId) ?? null }));
}

/**
 * Called from the Daily.co "participant-joined" webhook. Marks attendance
 * and — since this is the only server-verifiable signal that someone
 * actually attended a live class (RSVP alone isn't enough) — completes the
 * lesson, same as video watchPct / PDF read / quiz pass.
 */
export async function markAttended(lessonId: string, userId: string) {
  await prisma.liveAttendance.upsert({
    where: { lessonId_userId: { lessonId, userId } },
    create: { lessonId, userId, rsvp: true, attended: true, joinedAt: new Date() },
    update: { attended: true, joinedAt: new Date() },
  });

  const lesson = await prisma.lesson.findUnique({ where: { id: lessonId } });
  if (!lesson) return;

  const enrollment = await getActiveEnrollment(userId, lesson.courseId);
  if (!enrollment) return; // attended without an active enrollment — nothing to credit

  const existing = await prisma.lessonProgress.findUnique({
    where: { enrollmentId_lessonId: { enrollmentId: enrollment.id, lessonId } },
  });
  if (existing?.completed) return;

  await prisma.lessonProgress.upsert({
    where: { enrollmentId_lessonId: { enrollmentId: enrollment.id, lessonId } },
    create: {
      userId,
      lessonId,
      enrollmentId: enrollment.id,
      watchPct: 100,
      completed: true,
      completedAt: new Date(),
    },
    update: { watchPct: 100, completed: true, completedAt: new Date() },
  });

  await recalculateEnrollmentProgress(enrollment.id, lesson.courseId);
}
