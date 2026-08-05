import { prisma } from "@novr/db";
import { LessonType } from "@novr/types";
import { InvalidLessonTypeError, LessonLockedError, NotEnrolledError, NotFoundError } from "../lib/errors";
import { enqueueCertificateGeneration } from "../queues/certificateQueue";

// Matches the ~5s client heartbeat cadence; a little slack is added for
// network/timer jitter so legitimate playback never gets clamped.
const HEARTBEAT_INTERVAL_SECONDS = 5;
const HEARTBEAT_TOLERANCE_SECONDS = 3;

export async function getActiveEnrollment(userId: string, courseId: string) {
  return prisma.enrollment.findFirst({
    where: {
      userId,
      courseId,
      status: "ACTIVE",
      OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
    },
    orderBy: { enrolledAt: "desc" },
  });
}

export interface LessonProgressEntry {
  lessonId: string;
  title: string;
  type: string;
  order: number;
  unlocked: boolean;
  completed: boolean;
  watchPct: number;
  lastPositionSeconds: number;
}

export async function getCourseProgress(userId: string, courseId: string) {
  const enrollment = await getActiveEnrollment(userId, courseId);
  if (!enrollment) throw new NotEnrolledError();

  const [lessons, progressRows] = await Promise.all([
    prisma.lesson.findMany({ where: { courseId }, orderBy: { order: "asc" } }),
    prisma.lessonProgress.findMany({ where: { enrollmentId: enrollment.id } }),
  ]);
  const progressByLessonId = new Map(progressRows.map((p) => [p.lessonId, p]));

  let previousCompleted = true;
  const lessonEntries: LessonProgressEntry[] = lessons.map((lesson) => {
    const progress = progressByLessonId.get(lesson.id);
    const unlocked = previousCompleted;
    previousCompleted = progress?.completed ?? false;
    return {
      lessonId: lesson.id,
      title: lesson.title,
      type: lesson.type,
      order: lesson.order,
      unlocked,
      completed: progress?.completed ?? false,
      watchPct: progress?.watchPct ?? 0,
      lastPositionSeconds: progress?.lastPositionSeconds ?? 0,
    };
  });

  return {
    enrollmentId: enrollment.id,
    courseProgressPct: enrollment.progressPct,
    completedAt: enrollment.completedAt,
    lessons: lessonEntries,
  };
}

/**
 * Recomputes Enrollment.progressPct from completed-lesson count and, on
 * reaching 100%, stamps completedAt. Called after any lesson-completing
 * action (video heartbeat, PDF "mark as read", passing quiz) so the
 * course-level rollup never drifts from the underlying LessonProgress rows.
 */
export async function recalculateEnrollmentProgress(enrollmentId: string, courseId: string) {
  const [totalLessons, completedLessons, enrollment] = await Promise.all([
    prisma.lesson.count({ where: { courseId } }),
    prisma.lessonProgress.count({ where: { enrollmentId, completed: true } }),
    prisma.enrollment.findUniqueOrThrow({ where: { id: enrollmentId } }),
  ]);

  const progressPct = totalLessons > 0 ? Math.min(100, (completedLessons / totalLessons) * 100) : 0;
  const justCompletedCourse = progressPct >= 100 && !enrollment.completedAt;

  const updated = await prisma.enrollment.update({
    where: { id: enrollmentId },
    data: {
      progressPct,
      ...(justCompletedCourse ? { completedAt: new Date() } : {}),
    },
  });

  if (justCompletedCourse) {
    await enqueueCertificateGeneration(enrollmentId);
  }

  return updated;
}

export interface RecordHeartbeatParams {
  userId: string;
  courseId: string;
  lessonId: string;
  positionSeconds: number;
  durationSeconds: number;
}

/**
 * Records video watch progress from a player heartbeat. Server-enforced,
 * not just UI: rejects writes to a locked lesson, and (unless the course
 * allows forward-scrubbing) clamps the reported position so a client can't
 * report having watched further than real elapsed time would allow.
 */
export async function recordHeartbeat(params: RecordHeartbeatParams) {
  const { userId, courseId, lessonId, positionSeconds, durationSeconds } = params;

  const [enrollment, course, lesson] = await Promise.all([
    getActiveEnrollment(userId, courseId),
    prisma.course.findUnique({ where: { id: courseId } }),
    prisma.lesson.findUnique({ where: { id: lessonId } }),
  ]);
  if (!enrollment) throw new NotEnrolledError();
  if (!course) throw new NotFoundError("Course not found");
  if (!lesson || lesson.courseId !== courseId) throw new NotFoundError("Lesson not found");
  if (lesson.type !== LessonType.VIDEO) {
    throw new InvalidLessonTypeError("Heartbeat only applies to video lessons");
  }

  const progressOverview = await getCourseProgress(userId, courseId);
  const entry = progressOverview.lessons.find((l) => l.lessonId === lessonId);
  if (!entry?.unlocked) throw new LessonLockedError();

  const existing = await prisma.lessonProgress.findUnique({
    where: { enrollmentId_lessonId: { enrollmentId: enrollment.id, lessonId } },
  });

  let nextPosition = Math.max(0, Math.floor(positionSeconds));

  if (!course.allowForwardScrub && existing) {
    const elapsedRealSeconds = (Date.now() - existing.updatedAt.getTime()) / 1000;
    const maxAllowed = existing.lastPositionSeconds + elapsedRealSeconds + HEARTBEAT_TOLERANCE_SECONDS;
    nextPosition = Math.min(nextPosition, Math.floor(maxAllowed));
  }
  // Never let a reported position move the stored watermark backward —
  // rewatching from the start shouldn't cost progress already earned.
  nextPosition = Math.max(nextPosition, existing?.lastPositionSeconds ?? 0);

  const watchPct = durationSeconds > 0 ? Math.min(100, (nextPosition / durationSeconds) * 100) : 0;
  const finalWatchPct = Math.max(watchPct, existing?.watchPct ?? 0);
  const justCompleted = finalWatchPct >= lesson.minWatchPct;
  const completed = justCompleted || (existing?.completed ?? false);

  const progress = await prisma.lessonProgress.upsert({
    where: { enrollmentId_lessonId: { enrollmentId: enrollment.id, lessonId } },
    create: {
      userId,
      lessonId,
      enrollmentId: enrollment.id,
      watchPct: finalWatchPct,
      completed,
      lastPositionSeconds: nextPosition,
      timeSpentSeconds: HEARTBEAT_INTERVAL_SECONDS,
      completedAt: completed ? new Date() : null,
    },
    update: {
      watchPct: finalWatchPct,
      completed,
      lastPositionSeconds: nextPosition,
      timeSpentSeconds: { increment: HEARTBEAT_INTERVAL_SECONDS },
      ...(completed && !existing?.completed ? { completedAt: new Date() } : {}),
    },
  });

  if (completed && !existing?.completed) {
    const updatedEnrollment = await recalculateEnrollmentProgress(enrollment.id, courseId);
    return { ...progress, courseProgressPct: updatedEnrollment.progressPct };
  }
  return { ...progress, courseProgressPct: enrollment.progressPct };
}

/**
 * Marks a PDF lesson as complete once the learner has viewed it (the
 * viewer calls this on reaching the last page). PDFs don't have a
 * heartbeat-style server-verifiable "watch time", so this is a simpler
 * completion gate than video: enrollment + unlock still enforced, but the
 * client is trusted on "did they open/scroll it".
 */
export async function markPdfLessonComplete(userId: string, courseId: string, lessonId: string) {
  const enrollment = await getActiveEnrollment(userId, courseId);
  if (!enrollment) throw new NotEnrolledError();

  const lesson = await prisma.lesson.findUnique({ where: { id: lessonId } });
  if (!lesson || lesson.courseId !== courseId) throw new NotFoundError("Lesson not found");
  if (lesson.type !== LessonType.PDF) {
    throw new InvalidLessonTypeError("This operation only applies to PDF lessons");
  }

  const progressOverview = await getCourseProgress(userId, courseId);
  const entry = progressOverview.lessons.find((l) => l.lessonId === lessonId);
  if (!entry?.unlocked) throw new LessonLockedError();

  const progress = await prisma.lessonProgress.upsert({
    where: { enrollmentId_lessonId: { enrollmentId: enrollment.id, lessonId } },
    create: {
      userId,
      lessonId,
      enrollmentId: enrollment.id,
      watchPct: 100,
      completed: true,
      completedAt: new Date(),
    },
    update: entry.completed
      ? {}
      : {
          watchPct: 100,
          completed: true,
          completedAt: new Date(),
        },
  });

  if (!entry.completed) {
    const updatedEnrollment = await recalculateEnrollmentProgress(enrollment.id, courseId);
    return { ...progress, courseProgressPct: updatedEnrollment.progressPct };
  }
  return { ...progress, courseProgressPct: enrollment.progressPct };
}
