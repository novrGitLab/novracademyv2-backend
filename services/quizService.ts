import { prisma } from "@novr/db";
import type { QuestionType } from "@novr/types";
import { NotFoundError } from "../lib/errors";

export async function getQuizByLessonId(lessonId: string) {
  return prisma.quiz.findUnique({
    where: { lessonId },
    include: { questions: { orderBy: { order: "asc" } } },
  });
}

export interface UpdateQuizSettingsInput {
  title?: string;
  passMarkPct?: number;
  maxAttempts?: number;
}

export async function updateQuizSettings(lessonId: string, input: UpdateQuizSettingsInput) {
  const quiz = await prisma.quiz.findUnique({ where: { lessonId } });
  if (!quiz) throw new NotFoundError("This lesson has no quiz");
  return prisma.quiz.update({ where: { id: quiz.id }, data: input });
}

export interface CreateQuestionInput {
  type: QuestionType;
  prompt: string;
  options?: unknown;
  correctAnswer: unknown;
  points?: number;
}

export async function createQuestion(lessonId: string, input: CreateQuestionInput) {
  const quiz = await prisma.quiz.findUnique({ where: { lessonId } });
  if (!quiz) throw new NotFoundError("This lesson has no quiz");

  const maxOrder = await prisma.quizQuestion.aggregate({
    where: { quizId: quiz.id },
    _max: { order: true },
  });

  return prisma.quizQuestion.create({
    data: {
      quizId: quiz.id,
      type: input.type,
      prompt: input.prompt,
      options: input.options as never,
      correctAnswer: input.correctAnswer as never,
      points: input.points ?? 1,
      order: (maxOrder._max.order ?? 0) + 1,
    },
  });
}

export interface UpdateQuestionInput {
  prompt?: string;
  options?: unknown;
  correctAnswer?: unknown;
  points?: number;
}

export async function updateQuestion(questionId: string, input: UpdateQuestionInput) {
  return prisma.quizQuestion.update({
    where: { id: questionId },
    data: {
      prompt: input.prompt,
      options: input.options as never,
      correctAnswer: input.correctAnswer as never,
      points: input.points,
    },
  });
}

export async function deleteQuestion(questionId: string) {
  await prisma.quizQuestion.delete({ where: { id: questionId } });
}

/** Moves a question up/down by swapping `order` with its neighbor. */
export async function reorderQuestion(questionId: string, direction: "up" | "down") {
  const question = await prisma.quizQuestion.findUniqueOrThrow({ where: { id: questionId } });

  const neighbor = await prisma.quizQuestion.findFirst({
    where: {
      quizId: question.quizId,
      order: direction === "up" ? { lt: question.order } : { gt: question.order },
    },
    orderBy: { order: direction === "up" ? "desc" : "asc" },
  });

  if (!neighbor) return question;

  // No uniqueness constraint on (quizId, order), so a direct swap is safe
  // (unlike Lesson.order, which needs the sentinel dance).
  await prisma.$transaction([
    prisma.quizQuestion.update({ where: { id: question.id }, data: { order: neighbor.order } }),
    prisma.quizQuestion.update({ where: { id: neighbor.id }, data: { order: question.order } }),
  ]);

  return prisma.quizQuestion.findUniqueOrThrow({ where: { id: questionId } });
}
