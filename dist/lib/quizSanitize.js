"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.sanitizeLessonForViewer = sanitizeLessonForViewer;
exports.sanitizeCourseForViewer = sanitizeCourseForViewer;
/**
 * Strips `correctAnswer` from quiz questions unless the viewer is an admin.
 * Correct answers must never reach a learner's client — not even
 * pre-attempt, since the lesson/course detail endpoints are shared between
 * the admin builder (which needs them) and the learner player (which must
 * not get them).
 */
function sanitizeLessonForViewer(lesson, isAdmin) {
    if (isAdmin || !lesson.quiz?.questions)
        return lesson;
    return {
        ...lesson,
        quiz: {
            ...lesson.quiz,
            questions: lesson.quiz.questions.map(({ correctAnswer, ...rest }) => rest),
        },
    };
}
function sanitizeCourseForViewer(course, isAdmin) {
    if (isAdmin || !course.lessons)
        return course;
    return {
        ...course,
        lessons: course.lessons.map((lesson) => sanitizeLessonForViewer(lesson, isAdmin)),
    };
}
