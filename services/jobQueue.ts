import { prisma } from "@novr/db";
import type { Job } from "@prisma/client";
import * as emailService from "../services/emailService";
import * as certificateService from "../services/certificateService";
import * as alumniService from "../services/alumniService";

type JobHandler = (payload: unknown) => Promise<void>;

const handlers: Record<string, JobHandler> = {
  "email.enrollment-confirmed": async (p) => {
    const enrollmentId = (p as { id: string }).id;
    const enrollment = await prisma.enrollment.findUnique({
      where: { id: enrollmentId },
      include: { user: true, course: true },
    });
    if (!enrollment?.course) return;
    await emailService.sendEnrollmentConfirmedEmail({
      to: enrollment.user.email,
      learnerName: enrollment.user.name ?? enrollment.user.email,
      courseTitle: enrollment.course.title,
      courseUrl: `${process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000"}/dashboard/learn/${enrollment.courseId}`,
      expiresAtLabel: enrollment.expiresAt ? enrollment.expiresAt.toLocaleDateString() : null,
    });
  },
  "email.quiz-result": async (p) => {
    const attemptId = (p as { id: string }).id;
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
      courseUrl: `${process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000"}/dashboard/learn/${attempt.quiz.lesson.courseId}`,
      score: attempt.score,
      passed: attempt.passed,
      attemptsRemaining: Math.max(0, attempt.quiz.maxAttempts - attempt.attemptNumber),
    });
  },
  "email.certificate-issued": async (p) => {
    const certificateId = (p as { id: string }).id;
    const certificate = await prisma.certificate.findUnique({
      where: { id: certificateId },
      include: { user: true, course: true },
    });
    if (!certificate) return;
    await emailService.sendCertificateIssuedEmail({
      to: certificate.user.email,
      learnerName: certificate.user.name ?? certificate.user.email,
      courseTitle: certificate.course?.title ?? "your course",
      verificationUrl: `${process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000"}/certificates/${certificate.certUid}`,
    });
  },
  "certificate.generate": async (p) => {
    const enrollmentId = (p as { id: string }).id;
    await certificateService.issueCertificateForEnrollment(enrollmentId);
  },
  "certificate.generate-legacy": async (p) => {
    const recordId = (p as { id: string }).id;
    await alumniService.generateLegacyCertificatePdf(recordId);
  },
  "email.alumni-invite": async (p) => {
    const recordId = (p as { id: string }).id;
    const record = await prisma.alumniRecord.findUnique({ where: { id: recordId } });
    if (!record?.email || !record.claimToken || record.claimed) return;
    await emailService.sendAlumniInviteEmail({
      to: record.email,
      fullName: record.fullName,
      courseName: record.courseName,
      claimUrl: `${process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000"}/claim/${record.claimToken}`,
    });
  },
  "email.job-alert": async (p) => {
    const listingId = (p as { id: string }).id;
    const listing = await prisma.jobListing.findUnique({ where: { id: listingId } });
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
          jobBoardUrl: `${process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000"}/dashboard/community/jobs`,
        })
      )
    );
  },
  "email.segment-notification": async (p) => {
    const { userIds, title, content } = p as { userIds: string[]; title: string; content: string };
    const users = await prisma.user.findMany({
      where: { id: { in: userIds } },
      select: { email: true },
    });
    await Promise.all(
      users.map((user) =>
        emailService.sendGenericNotificationEmail({ to: user.email, title, content })
      )
    );
  },
  "email.admin-welcome": async (p) => {
    const { userId, tempPassword } = p as { userId: string; tempPassword: string };
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
      loginUrl: `${process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000"}/login`,
      tempPassword,
    });
  },
  "email.expiry-warning": async (p) => {
    const { id, daysRemaining } = p as { id: string; daysRemaining: number };
    const enrollment = await prisma.enrollment.findUnique({
      where: { id },
      include: { user: true, course: true },
    });
    if (!enrollment?.course || enrollment.status !== "ACTIVE") return;
    await emailService.sendExpiryWarningEmail({
      to: enrollment.user.email,
      learnerName: enrollment.user.name ?? enrollment.user.email,
      courseTitle: enrollment.course.title,
      courseUrl: `${process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000"}/dashboard/learn/${enrollment.courseId}`,
      daysRemaining,
    });
  },
  "email.live-class-reminder": async (p) => {
    const { id, hoursBefore } = p as { id: string; hoursBefore: number };
    const lesson = await prisma.lesson.findUnique({ where: { id }, include: { course: true } });
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
          courseUrl: `${process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000"}/dashboard/learn/${lesson.courseId}/lessons/${lesson.id}`,
          scheduledAtLabel: lesson.liveScheduledAt!.toLocaleString(),
          hoursBefore,
        })
      )
    );
  },
  "email.event-reminder": async (p) => {
    const { id, hoursBefore } = p as { id: string; hoursBefore: number };
    const event = await prisma.event.findUnique({ where: { id } });
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
          eventUrl: `${process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000"}/dashboard/community/events`,
          hoursBefore,
        })
      )
    );
  },
};

export async function enqueueJob<T = unknown>(type: string, payload: T, { runAt }: { runAt?: Date } = {}): Promise<string> {
  const job = await prisma.job.create({
    data: {
      type,
      payload: payload as any,
      availableAt: runAt ?? new Date(),
    },
  });
  return job.id;
}

export async function claimDueJobs(limit = 20): Promise<Job[]> {
  return prisma.job.findMany({
    where: { status: "pending", availableAt: { lte: new Date() } },
    orderBy: { availableAt: "asc" },
    take: limit,
  });
}

export async function completeJob(id: string) {
  await prisma.job.update({ where: { id }, data: { status: "delivered", attempts: { increment: 1 } } });
}

export async function failJob(id: string, error: string) {
  await prisma.job.update({
    where: { id },
    data: { status: "failed", error, attempts: { increment: 1 } },
  });
}

export async function dispatch(job: Job) {
  const handler = handlers[job.type];
  if (!handler) {
    console.warn(`[queue] unknown job type: ${job.type}`);
    return failJob(job.id, `unknown type: ${job.type}`);
  }
  try {
    await handler(job.payload);
    await completeJob(job.id);
  } catch (e) {
    console.error(`[queue] job ${job.id} failed:`, e);
    await failJob(job.id, e instanceof Error ? e.message : String(e));
  }
}

export async function runWorkerLoop() {
  console.log("[queue] worker loop started (claiming due jobs every 2s)");
  setInterval(async () => {
    try {
      const jobs = await claimDueJobs(20);
      if (jobs.length > 0) {
        await Promise.all(jobs.map(dispatch));
      }
    } catch (e) {
      console.error("[queue] worker loop error:", e);
    }
  }, 2000);
}
