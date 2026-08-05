export class ApiError extends Error {
  constructor(
    public status: number,
    message: string
  ) {
    super(message);
    this.name = this.constructor.name;
  }
}

export class NotFoundError extends ApiError {
  constructor(message = "Not found") {
    super(404, message);
  }
}

export class NotEnrolledError extends ApiError {
  constructor() {
    super(403, "Not enrolled in this course");
  }
}

export class LessonLockedError extends ApiError {
  constructor() {
    super(403, "Complete the previous lesson before starting this one");
  }
}

export class InvalidLessonTypeError extends ApiError {
  constructor(message = "This operation does not apply to this lesson type") {
    super(400, message);
  }
}

export class MaxAttemptsExceededError extends ApiError {
  constructor() {
    super(403, "No attempts remaining for this quiz");
  }
}
