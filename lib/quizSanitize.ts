interface QuestionLike {
  correctAnswer?: unknown;
  [key: string]: unknown;
}

interface QuizLike {
  questions?: QuestionLike[];
  [key: string]: unknown;
}

interface LessonLike {
  quiz?: QuizLike | null;
  [key: string]: unknown;
}

/**
 * Strips `correctAnswer` from quiz questions unless the viewer is an admin.
 * Correct answers must never reach a learner's client — not even
 * pre-attempt, since the lesson/course detail endpoints are shared between
 * the admin builder (which needs them) and the learner player (which must
 * not get them).
 */
export function sanitizeLessonForViewer<T extends LessonLike>(lesson: T, isAdmin: boolean): T {
  if (isAdmin || !lesson.quiz?.questions) return lesson;
  return {
    ...lesson,
    quiz: {
      ...lesson.quiz,
      questions: lesson.quiz.questions.map(({ correctAnswer, ...rest }) => rest),
    },
  };
}

export function sanitizeCourseForViewer<T extends { lessons?: LessonLike[] }>(course: T, isAdmin: boolean): T {
  if (isAdmin || !course.lessons) return course;
  return {
    ...course,
    lessons: course.lessons.map((lesson) => sanitizeLessonForViewer(lesson, isAdmin)),
  };
}
