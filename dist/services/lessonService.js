"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createLesson = createLesson;
exports.updateLesson = updateLesson;
exports.deleteLesson = deleteLesson;
exports.getLessonById = getLessonById;
exports.setLessonPdfKey = setLessonPdfKey;
exports.setLessonUpload = setLessonUpload;
exports.setLessonAssetCreated = setLessonAssetCreated;
exports.setLessonAssetReady = setLessonAssetReady;
exports.setLessonAssetErrored = setLessonAssetErrored;
exports.setLessonLiveRoom = setLessonLiveRoom;
exports.setLessonRecording = setLessonRecording;
exports.getLessonByDailyRoomName = getLessonByDailyRoomName;
exports.reorderLesson = reorderLesson;
const db_1 = require("@novr/db");
async function createLesson(input) {
    const maxOrder = await db_1.prisma.lesson.aggregate({
        where: { courseId: input.courseId },
        _max: { order: true },
    });
    const order = (maxOrder._max.order ?? 0) + 1;
    const { quizPassMarkPct, quizMaxAttempts, ...lessonFields } = input;
    return db_1.prisma.lesson.create({
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
async function updateLesson(id, input) {
    return db_1.prisma.lesson.update({ where: { id }, data: input });
}
async function deleteLesson(id) {
    await db_1.prisma.lesson.delete({ where: { id } });
}
async function getLessonById(id) {
    return db_1.prisma.lesson.findUnique({
        where: { id },
        include: { quiz: { include: { questions: { orderBy: { order: "asc" } } } } },
    });
}
/** Stores the R2 object key for a PDF lesson (in `contentUrl`, reused as a generic key/URL field per lesson type). */
async function setLessonPdfKey(lessonId, key) {
    return db_1.prisma.lesson.update({ where: { id: lessonId }, data: { contentUrl: key } });
}
async function setLessonUpload(lessonId, muxUploadId) {
    return db_1.prisma.lesson.update({
        where: { id: lessonId },
        data: { muxUploadId, videoStatus: "PREPARING", muxAssetId: null, muxPlaybackId: null },
    });
}
async function setLessonAssetCreated(muxUploadId, muxAssetId) {
    return db_1.prisma.lesson.updateMany({
        where: { muxUploadId },
        data: { muxAssetId, videoStatus: "PREPARING" },
    });
}
async function setLessonAssetReady(muxAssetId, muxPlaybackId, durationSeconds) {
    return db_1.prisma.lesson.updateMany({
        where: { muxAssetId },
        data: { muxPlaybackId, videoStatus: "READY", ...(durationSeconds ? { durationSeconds } : {}) },
    });
}
async function setLessonAssetErrored(muxAssetId) {
    return db_1.prisma.lesson.updateMany({
        where: { muxAssetId },
        data: { videoStatus: "ERRORED" },
    });
}
async function setLessonLiveRoom(lessonId, input) {
    return db_1.prisma.lesson.update({ where: { id: lessonId }, data: input });
}
async function setLessonRecording(lessonId, dailyRecordingId) {
    return db_1.prisma.lesson.update({ where: { id: lessonId }, data: { dailyRecordingId } });
}
async function getLessonByDailyRoomName(dailyRoomName) {
    return db_1.prisma.lesson.findFirst({ where: { dailyRoomName } });
}
/** Moves a lesson up/down by swapping `order` with its neighbor. */
async function reorderLesson(id, direction) {
    const lesson = await db_1.prisma.lesson.findUniqueOrThrow({ where: { id } });
    const neighbor = await db_1.prisma.lesson.findFirst({
        where: {
            courseId: lesson.courseId,
            order: direction === "up" ? { lt: lesson.order } : { gt: lesson.order },
        },
        orderBy: { order: direction === "up" ? "desc" : "asc" },
    });
    if (!neighbor)
        return lesson;
    // Swap via a temporary sentinel order: the (courseId, order) unique
    // constraint is checked immediately per-statement (not deferred), so
    // swapping directly would collide mid-transaction.
    await db_1.prisma.$transaction([
        db_1.prisma.lesson.update({ where: { id: lesson.id }, data: { order: -1 } }),
        db_1.prisma.lesson.update({ where: { id: neighbor.id }, data: { order: lesson.order } }),
        db_1.prisma.lesson.update({ where: { id: lesson.id }, data: { order: neighbor.order } }),
    ]);
    return db_1.prisma.lesson.findUniqueOrThrow({ where: { id } });
}
