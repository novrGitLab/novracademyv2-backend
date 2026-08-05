import { prisma } from "@novr/db";
import { NotEnrolledError, NotFoundError } from "../lib/errors";
import { askCourseAssistant } from "./anthropicService";
import { getActiveEnrollment } from "./progressService";

const HISTORY_MESSAGES_SENT_TO_MODEL = 20;

async function getOrCreateConversation(userId: string, courseId: string) {
  return prisma.courseAiConversation.upsert({
    where: { userId_courseId: { userId, courseId } },
    create: { userId, courseId },
    update: {},
  });
}

export async function getConversationHistory(userId: string, courseId: string) {
  const enrollment = await getActiveEnrollment(userId, courseId);
  if (!enrollment) throw new NotEnrolledError();

  const conversation = await prisma.courseAiConversation.findUnique({ where: { userId_courseId: { userId, courseId } } });
  if (!conversation) return { messages: [] };

  const messages = await prisma.courseAiMessage.findMany({
    where: { conversationId: conversation.id },
    orderBy: { createdAt: "asc" },
  });
  return { messages };
}

export async function askQuestion(userId: string, courseId: string, question: string) {
  const enrollment = await getActiveEnrollment(userId, courseId);
  if (!enrollment) throw new NotEnrolledError();

  const course = await prisma.course.findUnique({
    where: { id: courseId },
    include: { lessons: { orderBy: { order: "asc" }, select: { title: true } } },
  });
  if (!course) throw new NotFoundError("Course not found");

  const conversation = await getOrCreateConversation(userId, courseId);

  const priorMessages = await prisma.courseAiMessage.findMany({
    where: { conversationId: conversation.id },
    orderBy: { createdAt: "desc" },
    take: HISTORY_MESSAGES_SENT_TO_MODEL,
  });
  const history = priorMessages
    .reverse()
    .map((m) => ({ role: m.role as "user" | "assistant", content: m.content }));

  await prisma.courseAiMessage.create({
    data: { conversationId: conversation.id, role: "user", content: question },
  });

  const answer = await askCourseAssistant({
    courseTitle: course.title,
    courseDescription: course.description,
    lessonTitles: course.lessons.map((l) => l.title),
    history,
    question,
  });

  const assistantMessage = await prisma.courseAiMessage.create({
    data: { conversationId: conversation.id, role: "assistant", content: answer },
  });

  await prisma.courseAiConversation.update({ where: { id: conversation.id }, data: { updatedAt: new Date() } });

  return assistantMessage;
}
