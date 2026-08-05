"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getConversationHistory = getConversationHistory;
exports.askQuestion = askQuestion;
const db_1 = require("@novr/db");
const errors_1 = require("../lib/errors");
const anthropicService_1 = require("./anthropicService");
const progressService_1 = require("./progressService");
const HISTORY_MESSAGES_SENT_TO_MODEL = 20;
async function getOrCreateConversation(userId, courseId) {
    return db_1.prisma.courseAiConversation.upsert({
        where: { userId_courseId: { userId, courseId } },
        create: { userId, courseId },
        update: {},
    });
}
async function getConversationHistory(userId, courseId) {
    const enrollment = await (0, progressService_1.getActiveEnrollment)(userId, courseId);
    if (!enrollment)
        throw new errors_1.NotEnrolledError();
    const conversation = await db_1.prisma.courseAiConversation.findUnique({ where: { userId_courseId: { userId, courseId } } });
    if (!conversation)
        return { messages: [] };
    const messages = await db_1.prisma.courseAiMessage.findMany({
        where: { conversationId: conversation.id },
        orderBy: { createdAt: "asc" },
    });
    return { messages };
}
async function askQuestion(userId, courseId, question) {
    const enrollment = await (0, progressService_1.getActiveEnrollment)(userId, courseId);
    if (!enrollment)
        throw new errors_1.NotEnrolledError();
    const course = await db_1.prisma.course.findUnique({
        where: { id: courseId },
        include: { lessons: { orderBy: { order: "asc" }, select: { title: true } } },
    });
    if (!course)
        throw new errors_1.NotFoundError("Course not found");
    const conversation = await getOrCreateConversation(userId, courseId);
    const priorMessages = await db_1.prisma.courseAiMessage.findMany({
        where: { conversationId: conversation.id },
        orderBy: { createdAt: "desc" },
        take: HISTORY_MESSAGES_SENT_TO_MODEL,
    });
    const history = priorMessages
        .reverse()
        .map((m) => ({ role: m.role, content: m.content }));
    await db_1.prisma.courseAiMessage.create({
        data: { conversationId: conversation.id, role: "user", content: question },
    });
    const answer = await (0, anthropicService_1.askCourseAssistant)({
        courseTitle: course.title,
        courseDescription: course.description,
        lessonTitles: course.lessons.map((l) => l.title),
        history,
        question,
    });
    const assistantMessage = await db_1.prisma.courseAiMessage.create({
        data: { conversationId: conversation.id, role: "assistant", content: answer },
    });
    await db_1.prisma.courseAiConversation.update({ where: { id: conversation.id }, data: { updatedAt: new Date() } });
    return assistantMessage;
}
