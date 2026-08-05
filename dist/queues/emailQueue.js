"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.enqueueSegmentNotificationEmail = exports.enqueueJobAlertEmails = exports.enqueueAlumniInviteEmail = exports.enqueueCertificateIssuedEmail = exports.enqueueQuizResultEmail = exports.enqueueEnrollmentConfirmedEmail = exports.emailQueue = void 0;
exports.enqueueExpiryWarnings = enqueueExpiryWarnings;
exports.enqueueLiveClassReminders = enqueueLiveClassReminders;
exports.enqueueEventReminders = enqueueEventReminders;
const bullmq_1 = require("bullmq");
const connection_1 = require("./connection");
exports.emailQueue = connection_1.redisConnectionOptions
    ? new bullmq_1.Queue("emails", { connection: connection_1.redisConnectionOptions })
    : null;
exports.emailQueue?.on("error", (err) => {
    console.error("Email queue error (background jobs unavailable until Redis is reachable):", err.message);
});
async function enqueue(data, delayMs = 0) {
    if (!exports.emailQueue) {
        console.warn(`Skipping email job "${data.type}" — REDIS_URL is not configured.`);
        return;
    }
    try {
        await exports.emailQueue.add(data.type, data, {
            delay: Math.max(0, delayMs),
            attempts: 3,
            backoff: { type: "exponential", delay: 30_000 },
        });
    }
    catch (err) {
        console.error("Failed to enqueue email job", data.type, err);
    }
}
const enqueueEnrollmentConfirmedEmail = (enrollmentId) => enqueue({ type: "enrollment_confirmed", enrollmentId });
exports.enqueueEnrollmentConfirmedEmail = enqueueEnrollmentConfirmedEmail;
const enqueueQuizResultEmail = (attemptId) => enqueue({ type: "quiz_result", attemptId });
exports.enqueueQuizResultEmail = enqueueQuizResultEmail;
const enqueueCertificateIssuedEmail = (certificateId) => enqueue({ type: "certificate_issued", certificateId });
exports.enqueueCertificateIssuedEmail = enqueueCertificateIssuedEmail;
const enqueueAlumniInviteEmail = (alumniRecordId) => enqueue({ type: "alumni_invite", alumniRecordId });
exports.enqueueAlumniInviteEmail = enqueueAlumniInviteEmail;
const enqueueJobAlertEmails = (jobListingId) => enqueue({ type: "job_alert", jobListingId });
exports.enqueueJobAlertEmails = enqueueJobAlertEmails;
const enqueueSegmentNotificationEmail = (userIds, title, content) => enqueue({ type: "segment_notification", userIds, title, content });
exports.enqueueSegmentNotificationEmail = enqueueSegmentNotificationEmail;
const MS_PER_DAY = 24 * 60 * 60 * 1000;
const MS_PER_HOUR = 60 * 60 * 1000;
/** Schedules the 30/7/1-day warnings up front; each is a no-op to enqueue if that point has already passed. */
function enqueueExpiryWarnings(enrollmentId, expiresAt) {
    if (!expiresAt)
        return;
    for (const daysRemaining of [30, 7, 1]) {
        const delayMs = expiresAt.getTime() - daysRemaining * MS_PER_DAY - Date.now();
        if (delayMs > 0)
            enqueue({ type: "expiry_warning", enrollmentId, daysRemaining }, delayMs);
    }
}
/**
 * Schedules the 24hr/1hr reminders up front, at class-scheduling time —
 * but the worker looks up the RSVP list at send time, not now, so
 * late RSVPs between now and the reminder still get notified.
 */
function enqueueLiveClassReminders(lessonId, scheduledAt) {
    for (const hoursBefore of [24, 1]) {
        const delayMs = scheduledAt.getTime() - hoursBefore * MS_PER_HOUR - Date.now();
        if (delayMs > 0)
            enqueue({ type: "live_class_reminder", lessonId, hoursBefore }, delayMs);
    }
}
/** Same pattern as live-class reminders — scheduled at event-creation time, RSVP list read fresh at send time. */
function enqueueEventReminders(eventId, startAt) {
    for (const hoursBefore of [24, 1]) {
        const delayMs = startAt.getTime() - hoursBefore * MS_PER_HOUR - Date.now();
        if (delayMs > 0)
            enqueue({ type: "event_reminder", eventId, hoursBefore }, delayMs);
    }
}
