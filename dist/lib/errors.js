"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.MaxAttemptsExceededError = exports.InvalidLessonTypeError = exports.LessonLockedError = exports.NotEnrolledError = exports.NotFoundError = exports.ApiError = void 0;
class ApiError extends Error {
    status;
    constructor(status, message) {
        super(message);
        this.status = status;
        this.name = this.constructor.name;
    }
}
exports.ApiError = ApiError;
class NotFoundError extends ApiError {
    constructor(message = "Not found") {
        super(404, message);
    }
}
exports.NotFoundError = NotFoundError;
class NotEnrolledError extends ApiError {
    constructor() {
        super(403, "Not enrolled in this course");
    }
}
exports.NotEnrolledError = NotEnrolledError;
class LessonLockedError extends ApiError {
    constructor() {
        super(403, "Complete the previous lesson before starting this one");
    }
}
exports.LessonLockedError = LessonLockedError;
class InvalidLessonTypeError extends ApiError {
    constructor(message = "This operation does not apply to this lesson type") {
        super(400, message);
    }
}
exports.InvalidLessonTypeError = InvalidLessonTypeError;
class MaxAttemptsExceededError extends ApiError {
    constructor() {
        super(403, "No attempts remaining for this quiz");
    }
}
exports.MaxAttemptsExceededError = MaxAttemptsExceededError;
