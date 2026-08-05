"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getQuizByLessonId = getQuizByLessonId;
exports.updateQuizSettings = updateQuizSettings;
exports.createQuestion = createQuestion;
exports.updateQuestion = updateQuestion;
exports.deleteQuestion = deleteQuestion;
exports.reorderQuestion = reorderQuestion;
const db_1 = require("@novr/db");
const errors_1 = require("../lib/errors");
async function getQuizByLessonId(lessonId) {
    return db_1.prisma.quiz.findUnique({
        where: { lessonId },
        include: { questions: { orderBy: { order: "asc" } } },
    });
}
async function updateQuizSettings(lessonId, input) {
    const quiz = await db_1.prisma.quiz.findUnique({ where: { lessonId } });
    if (!quiz)
        throw new errors_1.NotFoundError("This lesson has no quiz");
    return db_1.prisma.quiz.update({ where: { id: quiz.id }, data: input });
}
async function createQuestion(lessonId, input) {
    const quiz = await db_1.prisma.quiz.findUnique({ where: { lessonId } });
    if (!quiz)
        throw new errors_1.NotFoundError("This lesson has no quiz");
    const maxOrder = await db_1.prisma.quizQuestion.aggregate({
        where: { quizId: quiz.id },
        _max: { order: true },
    });
    return db_1.prisma.quizQuestion.create({
        data: {
            quizId: quiz.id,
            type: input.type,
            prompt: input.prompt,
            options: input.options,
            correctAnswer: input.correctAnswer,
            points: input.points ?? 1,
            order: (maxOrder._max.order ?? 0) + 1,
        },
    });
}
async function updateQuestion(questionId, input) {
    return db_1.prisma.quizQuestion.update({
        where: { id: questionId },
        data: {
            prompt: input.prompt,
            options: input.options,
            correctAnswer: input.correctAnswer,
            points: input.points,
        },
    });
}
async function deleteQuestion(questionId) {
    await db_1.prisma.quizQuestion.delete({ where: { id: questionId } });
}
/** Moves a question up/down by swapping `order` with its neighbor. */
async function reorderQuestion(questionId, direction) {
    const question = await db_1.prisma.quizQuestion.findUniqueOrThrow({ where: { id: questionId } });
    const neighbor = await db_1.prisma.quizQuestion.findFirst({
        where: {
            quizId: question.quizId,
            order: direction === "up" ? { lt: question.order } : { gt: question.order },
        },
        orderBy: { order: direction === "up" ? "desc" : "asc" },
    });
    if (!neighbor)
        return question;
    // No uniqueness constraint on (quizId, order), so a direct swap is safe
    // (unlike Lesson.order, which needs the sentinel dance).
    await db_1.prisma.$transaction([
        db_1.prisma.quizQuestion.update({ where: { id: question.id }, data: { order: neighbor.order } }),
        db_1.prisma.quizQuestion.update({ where: { id: neighbor.id }, data: { order: question.order } }),
    ]);
    return db_1.prisma.quizQuestion.findUniqueOrThrow({ where: { id: questionId } });
}
