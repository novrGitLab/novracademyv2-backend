import { prisma } from "@novr/db";
import { EnrollmentStatus } from "@novr/types";
import * as emailService from "../services/emailService";

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";

export const enqueueEnrollmentConfirmedEmail = async (enrollmentId: string) => {
  const enrollment = await prisma.enrollment.findUnique({
    where: { id: enrollmentId },
    include: { user: true, course: true },
  });
  if (!enrollment?.course) return;
  await emailService.sendEnrollmentConfirmedEmail({
    to: enrollment.user.email,
    learnerName: enrollment.user.name ?? enrollment.user.email,
    courseTitle: enrollment.course.title,
    courseUrl: `${APP_URL}/dashboard/learn/${enrollment.courseId}`,
    expiresAtLabel: enrollment.expiresAt ? enrollment.expiresAt.toLocaleDateString() : null,
  });
};

export const enqueueQuizResultEmail = async (attemptId: string) => {
  const attempt = await prisma.quizAttempt.findUnique({
    where: { id: attemptId },
    include: { user: true, quiz: { include: { lesson: { include: { course: true } } } } },
  });
  if (!attempt) return;
  await emailService.sendQuizResultEmail({
    to: attempt.user.email,
    learnerName: attempt.user.name ?? attempt.user.email,
    courseTitle: attempt.quiz.lesson.course.title,
    lessonTitle: attempt.quiz.lesson.title,
    courseUrl: `${APP_URL}/dashboard/learn/${attempt.quiz.lesson.courseId}`,
    score: attempt.score,
    passed: attempt.passed,
    attemptsRemaining: Math.max(0, attempt.quiz.maxAttempts - attempt.attemptNumber),
  });
};

export const enqueueCertificateIssuedEmail = async (certificateId: string) => {
  const certificate = await prisma.certificate.findUnique({
    where: { id: certificateId },
    include: { user: true, course: true },
  });
  if (!certificate) return;
  await emailService.sendCertificateIssuedEmail({
    to: certificate.user.email,
    learnerName: certificate.user.name ?? certificate.user.email,
    courseTitle: certificate.course?.title ?? "your course",
    verificationUrl: `${APP_URL}/certificates/${certificate.certUid}`,
  });
};

export const enqueueAlumniInviteEmail = async (alumniRecordId: string) => {
  const record = await prisma.alumniRecord.findUnique({ where: { id: alumniRecordId } });
  if (!record?.email || !record.claimToken || record.claimed) return;
  await emailService.sendAlumniInviteEmail({
    to: record.email,
    fullName: record.fullName,
    courseName: record.courseName,
    claimUrl: `${APP_URL}/claim/${record.claimToken}`,
  });
};

export const enqueueJobAlertEmails = async (jobListingId: string) => {
  const listing = await prisma.jobListing.findUnique({ where: { id: jobListingId } });
  if (!listing) return;
  const openToWorkUsers = await prisma.user.findMany({
    where: { openToWork: true },
    select: { email: true, name: true },
  });
  await Promise.all(
    openToWorkUsers.map((user) =>
      emailService.sendJobAlertEmail({
        to: user.email,
        learnerName: user.name ?? user.email,
        title: listing.title,
        company: listing.company,
        location: listing.location ?? listing.locationType,
        jobBoardUrl: `${APP_URL}/dashboard/community/jobs`,
      })
    )
  );
};

export const enqueueSegmentNotificationEmail = async (userIds: string[], title: string, content: string) => {
  const users = await prisma.user.findMany({
    where: { id: { in: userIds } },
    select: { email: true },
  });
  await Promise.all(
    users.map((user) =>
      emailService.sendGenericNotificationEmail({ to: user.email, title, content })
    )
  );
};

export const enqueueAdminWelcomeEmail = async (userId: string, tempPassword: string) => {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: { organization: true },
  });
  if (!user?.organization) return;
  await emailService.sendAdminWelcomeEmail({
    to: user.email,
    orgName: user.organization.name,
    adminName: user.name ?? user.email,
    email: user.email,
    loginUrl: `${APP_URL}/login`,
    tempPassword,
  });
};

const MS_PER_DAY = 24 * 60 * 60 * 1000;
const MS_PER_HOUR = 60 * 60 * 1000;

export function enqueueExpiryWarnings(enrollmentId: string, expiresAt: Date | null) {
  if (!expiresAt) return;
  for (const daysRemaining of [30, 7, 1]) {
    const delayMs = expiresAt.getTime() - daysRemaining * MS_PER_DAY - Date.now();
    if (delayMs > 0) {
      const sendAt = Date.now() + delayMs;
      const timer = setTimeout(async () => {
        const enrollment = await prisma.enrollment.findUnique({
          where: { id: enrollmentId },
          include: { user: true, course: true },
        });
        if (!enrollment?.course || enrollment.status !== EnrollmentStatus.ACTIVE) return;
        await emailService.sendExpiryWarningEmail({
          to: enrollment.user.email,
          learnerName: enrollment.user.name ?? enrollment.user.email,
          courseTitle: enrollment.course.title,
          courseUrl: `${APP_URL}/dashboard/learn/${enrollment.courseId}`,
          daysRemaining,
        });
      }, delayMs);
      timer.unref();
    }
  }
}

export function enqueueLiveClassReminders(lessonId: string, scheduledAt: Date) {
  for (const hoursBefore of [24, 1]) {
    const delayMs = scheduledAt.getTime() - hoursBefore * MS_PER_HOUR - Date.now();
    if (delayMs > 0) {
      const timer = setTimeout(async () => {
        const lesson = await prisma.lesson.findUnique({ where: { id: lessonId }, include: { course: true } });
        if (!lesson?.liveScheduledAt) return;
        const attendees = await prisma.liveAttendance.findMany({ where: { lessonId: lesson.id, rsvp: true } });
        const users = await prisma.user.findMany({ where: { id: { in: attendees.map((a) => a.userId) } } });
        await Promise.all(
          users.map((user) =>
            emailService.sendLiveClassReminderEmail({
              to: user.email,
              learnerName: user.name ?? user.email,
              lessonTitle: lesson.title,
              courseTitle: lesson.course.title,
              courseUrl: `${APP_URL}/dashboard/learn/${lesson.courseId}/lessons/${lesson.id}`,
              scheduledAtLabel: lesson.liveScheduledAt!.toLocaleString(),
              hoursBefore,
            })
          )
        );
      }, delayMs);
      timer.unref();
    }
  }
}

export function enqueueEventReminders(eventId: string, startAt: Date) {
  for (const hoursBefore of [24, 1]) {
    const delayMs = startAt.getTime() - hoursBefore * MS_PER_HOUR - Date.now();
    if (delayMs > 0) {
      const timer = setTimeout(async () => {
        const event = await prisma.event.findUnique({ where: { id: eventId } });
        if (!event) return;
        const attendees = await prisma.eventRsvp.findMany({ where: { eventId: event.id, status: "GOING" } });
        const users = await prisma.user.findMany({ where: { id: { in: attendees.map((a) => a.userId) } } });
        await Promise.all(
          users.map((user) =>
            emailService.sendEventReminderEmail({
              to: user.email,
              learnerName: user.name ?? user.email,
              eventTitle: event.title,
              startAtLabel: event.startAt.toLocaleString(),
              eventUrl: `${APP_URL}/dashboard/community/events`,
              hoursBefore,
            })
          )
        );
      }, delayMs);
      timer.unref();
    }
  }
}
