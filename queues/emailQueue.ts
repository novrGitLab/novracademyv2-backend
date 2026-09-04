import { enqueueJob } from "../services/jobQueue";

/**
 * Email enqueuers — persist a job row to the Postgres-backed queue and return
 * immediately. The worker loop (services/jobQueue.ts) claims due jobs and
 * performs the actual email sends, so:
 *  - the HTTP request that triggered the email returns instantly, and
 *  - jobs survive process restarts (they are rows until delivered/failed).
 *
 * These functions intentionally do NOT perform the email send themselves —
 * keep the send logic in the matching jobQueue handler.
 */

export const enqueueEnrollmentConfirmedEmail = (enrollmentId: string) => {
  return enqueueJob("email.enrollment-confirmed", { id: enrollmentId });
};

export const enqueueQuizResultEmail = (attemptId: string) => {
  return enqueueJob("email.quiz-result", { id: attemptId });
};

export const enqueueCertificateIssuedEmail = (certificateId: string) => {
  return enqueueJob("email.certificate-issued", { id: certificateId });
};

export const enqueueAlumniInviteEmail = (alumniRecordId: string) => {
  return enqueueJob("email.alumni-invite", { id: alumniRecordId });
};

export const enqueueJobAlertEmails = (jobListingId: string) => {
  return enqueueJob("email.job-alert", { id: jobListingId });
};

export const enqueueSegmentNotificationEmail = (userIds: string[], title: string, content: string) => {
  return enqueueJob("email.segment-notification", { userIds, title, content });
};

export const enqueueAdminWelcomeEmail = (userId: string, tempPassword: string) => {
  return enqueueJob("email.admin-welcome", { userId, tempPassword });
};

const MS_PER_DAY = 24 * 60 * 60 * 1000;
const MS_PER_HOUR = 60 * 60 * 1000;

export function enqueueExpiryWarnings(enrollmentId: string, expiresAt: Date | null) {
  if (!expiresAt) return;
  for (const daysRemaining of [30, 7, 1]) {
    const delayMs = expiresAt.getTime() - daysRemaining * MS_PER_DAY - Date.now();
    if (delayMs > 0) {
      void enqueueJob("email.expiry-warning", { id: enrollmentId, daysRemaining }, { runAt: new Date(Date.now() + delayMs) });
    }
  }
}

export function enqueueLiveClassReminders(lessonId: string, scheduledAt: Date) {
  for (const hoursBefore of [24, 1]) {
    const delayMs = scheduledAt.getTime() - hoursBefore * MS_PER_HOUR - Date.now();
    if (delayMs > 0) {
      void enqueueJob("email.live-class-reminder", { id: lessonId, hoursBefore }, { runAt: new Date(Date.now() + delayMs) });
    }
  }
}

export function enqueueEventReminders(eventId: string, startAt: Date) {
  for (const hoursBefore of [24, 1]) {
    const delayMs = startAt.getTime() - hoursBefore * MS_PER_HOUR - Date.now();
    if (delayMs > 0) {
      void enqueueJob("email.event-reminder", { id: eventId, hoursBefore }, { runAt: new Date(Date.now() + delayMs) });
    }
  }
}
