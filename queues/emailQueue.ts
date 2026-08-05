import { Queue } from "bullmq";
import { redisConnectionOptions } from "./connection";

export type EmailJobData =
  | { type: "enrollment_confirmed"; enrollmentId: string }
  | { type: "expiry_warning"; enrollmentId: string; daysRemaining: number }
  | { type: "quiz_result"; attemptId: string }
  | { type: "certificate_issued"; certificateId: string }
  | { type: "live_class_reminder"; lessonId: string; hoursBefore: number }
  | { type: "alumni_invite"; alumniRecordId: string }
  | { type: "job_alert"; jobListingId: string }
  | { type: "event_reminder"; eventId: string; hoursBefore: number }
  | { type: "segment_notification"; userIds: string[]; title: string; content: string };

export const emailQueue = redisConnectionOptions
  ? new Queue("emails", { connection: redisConnectionOptions })
  : null;

emailQueue?.on("error", (err) => {
  console.error("Email queue error (background jobs unavailable until Redis is reachable):", err.message);
});

async function enqueue(data: EmailJobData, delayMs = 0) {
  if (!emailQueue) {
    console.warn(`Skipping email job "${data.type}" — REDIS_URL is not configured.`);
    return;
  }
  try {
    await emailQueue.add(data.type, data, {
      delay: Math.max(0, delayMs),
      attempts: 3,
      backoff: { type: "exponential", delay: 30_000 },
    });
  } catch (err) {
    console.error("Failed to enqueue email job", data.type, err);
  }
}

export const enqueueEnrollmentConfirmedEmail = (enrollmentId: string) =>
  enqueue({ type: "enrollment_confirmed", enrollmentId });

export const enqueueQuizResultEmail = (attemptId: string) => enqueue({ type: "quiz_result", attemptId });

export const enqueueCertificateIssuedEmail = (certificateId: string) =>
  enqueue({ type: "certificate_issued", certificateId });

export const enqueueAlumniInviteEmail = (alumniRecordId: string) =>
  enqueue({ type: "alumni_invite", alumniRecordId });

export const enqueueJobAlertEmails = (jobListingId: string) => enqueue({ type: "job_alert", jobListingId });

export const enqueueSegmentNotificationEmail = (userIds: string[], title: string, content: string) =>
  enqueue({ type: "segment_notification", userIds, title, content });

const MS_PER_DAY = 24 * 60 * 60 * 1000;
const MS_PER_HOUR = 60 * 60 * 1000;

/** Schedules the 30/7/1-day warnings up front; each is a no-op to enqueue if that point has already passed. */
export function enqueueExpiryWarnings(enrollmentId: string, expiresAt: Date | null) {
  if (!expiresAt) return;
  for (const daysRemaining of [30, 7, 1]) {
    const delayMs = expiresAt.getTime() - daysRemaining * MS_PER_DAY - Date.now();
    if (delayMs > 0) enqueue({ type: "expiry_warning", enrollmentId, daysRemaining }, delayMs);
  }
}

/**
 * Schedules the 24hr/1hr reminders up front, at class-scheduling time —
 * but the worker looks up the RSVP list at send time, not now, so
 * late RSVPs between now and the reminder still get notified.
 */
export function enqueueLiveClassReminders(lessonId: string, scheduledAt: Date) {
  for (const hoursBefore of [24, 1]) {
    const delayMs = scheduledAt.getTime() - hoursBefore * MS_PER_HOUR - Date.now();
    if (delayMs > 0) enqueue({ type: "live_class_reminder", lessonId, hoursBefore }, delayMs);
  }
}

/** Same pattern as live-class reminders — scheduled at event-creation time, RSVP list read fresh at send time. */
export function enqueueEventReminders(eventId: string, startAt: Date) {
  for (const hoursBefore of [24, 1]) {
    const delayMs = startAt.getTime() - hoursBefore * MS_PER_HOUR - Date.now();
    if (delayMs > 0) enqueue({ type: "event_reminder", eventId, hoursBefore }, delayMs);
  }
}
