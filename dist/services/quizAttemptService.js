"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.submitAttempt = submitAttempt;
exports.getAttemptHistory = getAttemptHistory;
const db_1 = require("@novr/db");
const types_1 = require("@novr/types");
const errors_1 = require("../lib/errors");
const progressService_1 = require("./progressService");
const emailQueue_1 = require("../queues/emailQueue");
function isAnswerCorrect(type, correctAnswer, submitted) {
    switch (type) {
        case types_1.QuestionType.MULTIPLE_CHOICE:
            return typeof submitted === "number" && Number(submitted) === Number(correctAnswer);
        case types_1.QuestionType.TRUE_FALSE:
            return typeof submitted === "boolean" && submitted === correctAnswer;
        case types_1.QuestionType.SHORT_ANSWER:
            return (typeof submitted === "string" &&
                submitted.trim().toLowerCase() === String(correctAnswer ?? "").trim().toLowerCase());
        default:
            return false;
    }
}
/**
 * Grades a quiz attempt in a single pass, entirely server-side. Correct
 * answers are read from the DB here and never included in the response —
 * only a per-question correct/incorrect boolean, plus the aggregate score.
 */
async function submitAttempt(params) {
    const { userId, courseId, lessonId, answers } = params;
    const enrollment = await (0, progressService_1.getActiveEnrollment)(userId, courseId);
    if (!enrollment)
        throw new errors_1.NotEnrolledError();
    const lesson = await db_1.prisma.lesson.findUnique({
        where: { id: lessonId },
        include: { quiz: { include: { questions: { orderBy: { order: "asc" } } } } },
    });
    if (!lesson || lesson.courseId !== courseId)
        throw new errors_1.NotFoundError("Lesson not found");
    if (lesson.type !== types_1.LessonType.QUIZ || !lesson.quiz) {
        throw new errors_1.InvalidLessonTypeError("This lesson has no quiz");
    }
    const quiz = lesson.quiz;
    const progress = await (0, progressService_1.getCourseProgress)(userId, courseId);
    const entry = progress.lessons.find((l) => l.lessonId === lessonId);
    if (!entry?.unlocked)
        throw new errors_1.LessonLockedError();
    const priorAttempts = await db_1.prisma.quizAttempt.count({ where: { quizId: quiz.id, userId } });
    if (priorAttempts >= quiz.maxAttempts) {
        throw new errors_1.MaxAttemptsExceededError();
    }
    let earnedPoints = 0;
    let totalPoints = 0;
    const results = quiz.questions.map((q) => {
        totalPoints += q.points;
        const correct = isAnswerCorrect(q.type, q.correctAnswer, answers[q.id]);
        if (correct)
            earnedPoints += q.points;
        return { questionId: q.id, correct };
    });
    const score = totalPoints > 0 ? (earnedPoints / totalPoints) * 100 : 0;
    const passed = score >= quiz.passMarkPct;
    const attemptNumber = priorAttempts + 1;
    const attempt = await db_1.prisma.quizAttempt.create({
        data: {
            userId,
            quizId: quiz.id,
            score,
            passed,
            attemptNumber,
            answers: answers,
        },
    });
    // A passed quiz completes the lesson, same as video watchPct / PDF
    // "mark as read" — this is what lets getCourseProgress unlock the next
    // lesson for quiz-gated courses.
    let courseProgressPct = enrollment.progressPct;
    if (passed && !entry.completed) {
        await db_1.prisma.lessonProgress.upsert({
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
        const updatedEnrollment = await (0, progressService_1.recalculateEnrollmentProgress)(enrollment.id, courseId);
        courseProgressPct = updatedEnrollment.progressPct;
    }
    await (0, emailQueue_1.enqueueQuizResultEmail)(attempt.id);
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
async function getAttemptHistory(userId, quizId) {
    return db_1.prisma.quizAttempt.findMany({
        where: { userId, quizId },
        orderBy: { attemptNumber: "asc" },
        select: { id: true, attemptNumber: true, score: true, passed: true, submittedAt: true },
    });
}
