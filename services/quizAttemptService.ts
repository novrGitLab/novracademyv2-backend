import { prisma } from "@novr/db";
import { LessonType, QuestionType } from "@novr/types";
import {
  InvalidLessonTypeError,
  LessonLockedError,
  MaxAttemptsExceededError,
  NotEnrolledError,
  NotFoundError,
} from "../lib/errors";
import { getActiveEnrollment, getCourseProgress, recalculateEnrollmentProgress } from "./progressService";
import { enqueueQuizResultEmail } from "../queues/emailQueue";

function isAnswerCorrect(type: string, correctAnswer: unknown, submitted: unknown): boolean {
  switch (type) {
    case QuestionType.MULTIPLE_CHOICE:
      return typeof submitted === "number" && Number(submitted) === Number(correctAnswer);
    case QuestionType.TRUE_FALSE:
      return typeof submitted === "boolean" && submitted === correctAnswer;
    case QuestionType.SHORT_ANSWER:
      return (
        typeof submitted === "string" &&
        submitted.trim().toLowerCase() === String(correctAnswer ?? "").trim().toLowerCase()
      );
    default:
      return false;
  }
}

export interface SubmitAttemptParams {
  userId: string;
  courseId: string;
  lessonId: string;
  answers: Record<string, unknown>;
}

/**
 * Grades a quiz attempt in a single pass, entirely server-side. Correct
 * answers are read from the DB here and never included in the response —
 * only a per-question correct/incorrect boolean, plus the aggregate score.
 */
export async function submitAttempt(params: SubmitAttemptParams) {
  const { userId, courseId, lessonId, answers } = params;

  const enrollment = await getActiveEnrollment(userId, courseId);
  if (!enrollment) throw new NotEnrolledError();

  const lesson = await prisma.lesson.findUnique({
    where: { id: lessonId },
    include: { quiz: { include: { questions: { orderBy: { order: "asc" } } } } },
  });
  if (!lesson || lesson.courseId !== courseId) throw new NotFoundError("Lesson not found");
  if (lesson.type !== LessonType.QUIZ || !lesson.quiz) {
    throw new InvalidLessonTypeError("This lesson has no quiz");
  }
  const quiz = lesson.quiz;

  const progress = await getCourseProgress(userId, courseId);
  const entry = progress.lessons.find((l) => l.lessonId === lessonId);
  if (!entry?.unlocked) throw new LessonLockedError();

  const priorAttempts = await prisma.quizAttempt.count({ where: { quizId: quiz.id, userId } });
  if (priorAttempts >= quiz.maxAttempts) {
    throw new MaxAttemptsExceededError();
  }

  let earnedPoints = 0;
  let totalPoints = 0;
  const results = quiz.questions.map((q) => {
    totalPoints += q.points;
    const correct = isAnswerCorrect(q.type, q.correctAnswer, answers[q.id]);
    if (correct) earnedPoints += q.points;
    return { questionId: q.id, correct };
  });

  const score = totalPoints > 0 ? (earnedPoints / totalPoints) * 100 : 0;
  const passed = score >= quiz.passMarkPct;
  const attemptNumber = priorAttempts + 1;

  const attempt = await prisma.quizAttempt.create({
    data: {
      userId,
      quizId: quiz.id,
      score,
      passed,
      attemptNumber,
      answers: answers as never,
    },
  });

  // A passed quiz completes the lesson, same as video watchPct / PDF
  // "mark as read" — this is what lets getCourseProgress unlock the next
  // lesson for quiz-gated courses.
  let courseProgressPct = enrollment.progressPct;
  if (passed && !entry.completed) {
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
    const updatedEnrollment = await recalculateEnrollmentProgress(enrollment.id, courseId);
    courseProgressPct = updatedEnrollment.progressPct;
  }

  await enqueueQuizResultEmail(attempt.id);

  return {
    attemptId: attempt.id,
    attemptNumber,
    score,
    passed,
    passMarkPct: quiz.passMarkPct,
    maxAttempts: quiz.maxAttempts,
    attemptsRemaining: Math.max(0, quiz.maxAttempts - attemptNumber),
    results,
    courseProgressPct,
  };
}

export async function getAttemptHistory(userId: string, quizId: string) {
  return prisma.quizAttempt.findMany({
    where: { userId, quizId },
    orderBy: { attemptNumber: "asc" },
    select: { id: true, attemptNumber: true, score: true, passed: true, submittedAt: true },
  });
}
