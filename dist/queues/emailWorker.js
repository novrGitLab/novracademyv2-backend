"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.emailWorker = void 0;
const bullmq_1 = require("bullmq");
const db_1 = require("@novr/db");
const types_1 = require("@novr/types");
const emailService = __importStar(require("../services/emailService"));
const connection_1 = require("./connection");
const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
async function processEmailJob(job) {
    const data = job.data;
    switch (data.type) {
        case "enrollment_confirmed": {
            const enrollment = await db_1.prisma.enrollment.findUnique({
                where: { id: data.enrollmentId },
                include: { user: true, course: true },
            });
            if (!enrollment?.course)
                return;
            await emailService.sendEnrollmentConfirmedEmail({
                to: enrollment.user.email,
                learnerName: enrollment.user.name ?? enrollment.user.email,
                courseTitle: enrollment.course.title,
                courseUrl: `${APP_URL}/dashboard/learn/${enrollment.courseId}`,
                expiresAtLabel: enrollment.expiresAt ? enrollment.expiresAt.toLocaleDateString() : null,
            });
            break;
        }
        case "expiry_warning": {
            const enrollment = await db_1.prisma.enrollment.findUnique({
                where: { id: data.enrollmentId },
                include: { user: true, course: true },
            });
            // Re-checked at send time — the enrollment may have been extended,
            // re-purchased, or cancelled since this job was scheduled.
            if (!enrollment?.course || enrollment.status !== types_1.EnrollmentStatus.ACTIVE)
                return;
            await emailService.sendExpiryWarningEmail({
                to: enrollment.user.email,
                learnerName: enrollment.user.name ?? enrollment.user.email,
                courseTitle: enrollment.course.title,
                courseUrl: `${APP_URL}/dashboard/learn/${enrollment.courseId}`,
                daysRemaining: data.daysRemaining,
            });
            break;
        }
        case "quiz_result": {
            const attempt = await db_1.prisma.quizAttempt.findUnique({
                where: { id: data.attemptId },
                include: { user: true, quiz: { include: { lesson: { include: { course: true } } } } },
            });
            if (!attempt)
                return;
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
            break;
        }
        case "certificate_issued": {
            const certificate = await db_1.prisma.certificate.findUnique({
                where: { id: data.certificateId },
                include: { user: true, course: true },
            });
            if (!certificate)
                return;
            await emailService.sendCertificateIssuedEmail({
                to: certificate.user.email,
                learnerName: certificate.user.name ?? certificate.user.email,
                courseTitle: certificate.course?.title ?? "your course",
                verificationUrl: `${APP_URL}/certificates/${certificate.certUid}`,
            });
            break;
        }
        case "alumni_invite": {
            const record = await db_1.prisma.alumniRecord.findUnique({ where: { id: data.alumniRecordId } });
            if (!record?.email || !record.claimToken || record.claimed)
                return;
            await emailService.sendAlumniInviteEmail({
                to: record.email,
                fullName: record.fullName,
                courseName: record.courseName,
                claimUrl: `${APP_URL}/claim/${record.claimToken}`,
            });
            break;
        }
        case "job_alert": {
            const listing = await db_1.prisma.jobListing.findUnique({ where: { id: data.jobListingId } });
            if (!listing)
                return;
            const openToWorkUsers = await db_1.prisma.user.findMany({
                where: { openToWork: true },
                select: { email: true, name: true },
            });
            await Promise.all(openToWorkUsers.map((user) => emailService.sendJobAlertEmail({
                to: user.email,
                learnerName: user.name ?? user.email,
                title: listing.title,
                company: listing.company,
                location: listing.location ?? listing.locationType,
                jobBoardUrl: `${APP_URL}/dashboard/community/jobs`,
            })));
            break;
        }
        case "segment_notification": {
            const users = await db_1.prisma.user.findMany({
                where: { id: { in: data.userIds } },
                select: { email: true },
            });
            await Promise.all(users.map((user) => emailService.sendGenericNotificationEmail({ to: user.email, title: data.title, content: data.content })));
            break;
        }
        case "event_reminder": {
            const event = await db_1.prisma.event.findUnique({ where: { id: data.eventId } });
            if (!event)
                return;
            const attendees = await db_1.prisma.eventRsvp.findMany({ where: { eventId: event.id, status: "GOING" } });
            const users = await db_1.prisma.user.findMany({ where: { id: { in: attendees.map((a) => a.userId) } } });
            await Promise.all(users.map((user) => emailService.sendEventReminderEmail({
                to: user.email,
                learnerName: user.name ?? user.email,
                eventTitle: event.title,
                startAtLabel: event.startAt.toLocaleString(),
                eventUrl: `${APP_URL}/dashboard/community/events`,
                hoursBefore: data.hoursBefore,
            })));
            break;
        }
        case "live_class_reminder": {
            const lesson = await db_1.prisma.lesson.findUnique({ where: { id: data.lessonId }, include: { course: true } });
            if (!lesson?.liveScheduledAt)
                return;
            const attendees = await db_1.prisma.liveAttendance.findMany({ where: { lessonId: lesson.id, rsvp: true } });
            const users = await db_1.prisma.user.findMany({ where: { id: { in: attendees.map((a) => a.userId) } } });
            await Promise.all(users.map((user) => emailService.sendLiveClassReminderEmail({
                to: user.email,
                learnerName: user.name ?? user.email,
                lessonTitle: lesson.title,
                courseTitle: lesson.course.title,
                courseUrl: `${APP_URL}/dashboard/learn/${lesson.courseId}/lessons/${lesson.id}`,
                scheduledAtLabel: lesson.liveScheduledAt.toLocaleString(),
                hoursBefore: data.hoursBefore,
            })));
            break;
        }
    }
}
exports.emailWorker = connection_1.redisConnectionOptions
    ? new bullmq_1.Worker("emails", processEmailJob, { connection: connection_1.redisConnectionOptions })
    : null;
exports.emailWorker?.on("failed", (job, err) => {
    console.error(`Email job ${job?.id} failed:`, err.message);
});
exports.emailWorker?.on("error", (err) => {
    console.error("Email worker error (background jobs unavailable until Redis is reachable):", err.message);
});
