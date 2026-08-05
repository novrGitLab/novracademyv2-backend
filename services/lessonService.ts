import { prisma } from "@novr/db";
import type { LessonType } from "@novr/types";

export interface CreateLessonInput {
  courseId: string;
  title: string;
  type: LessonType;
  contentUrl?: string;
  minWatchPct?: number;
  durationSeconds?: number;
  liveScheduledAt?: Date;
  liveMeetingUrl?: string;
  // Only used when type === "QUIZ"; creates the nested Quiz row.
  quizPassMarkPct?: number;
  quizMaxAttempts?: number;
}

export async function createLesson(input: CreateLessonInput) {
  const maxOrder = await prisma.lesson.aggregate({
    where: { courseId: input.courseId },
    _max: { order: true },
  });
  const order = (maxOrder._max.order ?? 0) + 1;

  const { quizPassMarkPct, quizMaxAttempts, ...lessonFields } = input;

  return prisma.lesson.create({
    data: {
      ...lessonFields,
      order,
      ...(input.type === "QUIZ"
        ? {
            quiz: {
              create: {
                title: input.title,
                passMarkPct: quizPassMarkPct ?? 70,
                maxAttempts: quizMaxAttempts ?? 3,
              },
            },
          }
        : {}),
    },
    include: { quiz: true },
  });
}

export interface UpdateLessonInput {
  title?: string;
  contentUrl?: string;
  minWatchPct?: number;
  durationSeconds?: number;
  liveScheduledAt?: Date | null;
  liveMeetingUrl?: string;
  pdfAllowDownload?: boolean;
}

export async function updateLesson(id: string, input: UpdateLessonInput) {
  return prisma.lesson.update({ where: { id }, data: input });
}

export async function deleteLesson(id: string) {
  await prisma.lesson.delete({ where: { id } });
}

export async function getLessonById(id: string) {
  return prisma.lesson.findUnique({
    where: { id },
    include: { quiz: { include: { questions: { orderBy: { order: "asc" } } } } },
  });
}

/** Stores the R2 object key for a PDF lesson (in `contentUrl`, reused as a generic key/URL field per lesson type). */
export async function setLessonPdfKey(lessonId: string, key: string) {
  return prisma.lesson.update({ where: { id: lessonId }, data: { contentUrl: key } });
}

export async function setLessonUpload(lessonId: string, muxUploadId: string) {
  return prisma.lesson.update({
    where: { id: lessonId },
    data: { muxUploadId, videoStatus: "PREPARING", muxAssetId: null, muxPlaybackId: null },
  });
}

export async function setLessonAssetCreated(muxUploadId: string, muxAssetId: string) {
  return prisma.lesson.updateMany({
    where: { muxUploadId },
    data: { muxAssetId, videoStatus: "PREPARING" },
  });
}

export async function setLessonAssetReady(muxAssetId: string, muxPlaybackId: string, durationSeconds?: number) {
  return prisma.lesson.updateMany({
    where: { muxAssetId },
    data: { muxPlaybackId, videoStatus: "READY", ...(durationSeconds ? { durationSeconds } : {}) },
  });
}

export async function setLessonAssetErrored(muxAssetId: string) {
  return prisma.lesson.updateMany({
    where: { muxAssetId },
    data: { videoStatus: "ERRORED" },
  });
}

export async function setLessonLiveRoom(
  lessonId: string,
  input: { dailyRoomName: string; liveMeetingUrl: string; liveScheduledAt: Date | null }
) {
  return prisma.lesson.update({ where: { id: lessonId }, data: input });
}

export async function setLessonRecording(lessonId: string, dailyRecordingId: string) {
  return prisma.lesson.update({ where: { id: lessonId }, data: { dailyRecordingId } });
}

export async function getLessonByDailyRoomName(dailyRoomName: string) {
  return prisma.lesson.findFirst({ where: { dailyRoomName } });
}

/** Moves a lesson up/down by swapping `order` with its neighbor. */
export async function reorderLesson(id: string, direction: "up" | "down") {
  const lesson = await prisma.lesson.findUniqueOrThrow({ where: { id } });

  const neighbor = await prisma.lesson.findFirst({
    where: {
      courseId: lesson.courseId,
      order: direction === "up" ? { lt: lesson.order } : { gt: lesson.order },
    },
    orderBy: { order: direction === "up" ? "desc" : "asc" },
  });

  if (!neighbor) return lesson;

  // Swap via a temporary sentinel order: the (courseId, order) unique
  // constraint is checked immediately per-statement (not deferred), so
  // swapping directly would collide mid-transaction.
  await prisma.$transaction([
    prisma.lesson.update({ where: { id: lesson.id }, data: { order: -1 } }),
    prisma.lesson.update({ where: { id: neighbor.id }, data: { order: lesson.order } }),
    prisma.lesson.update({ where: { id: lesson.id }, data: { order: neighbor.order } }),
  ]);

  return prisma.lesson.findUniqueOrThrow({ where: { id } });
}
