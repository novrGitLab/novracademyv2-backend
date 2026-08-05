import type { ReactElement } from "react";
import { Resend } from "resend";
import { AlumniInviteEmail } from "../emails/AlumniInviteEmail";
import { CertificateIssuedEmail } from "../emails/CertificateIssuedEmail";
import { EnrollmentConfirmedEmail } from "../emails/EnrollmentConfirmedEmail";
import { EventReminderEmail } from "../emails/EventReminderEmail";
import { ExpiryWarningEmail } from "../emails/ExpiryWarningEmail";
import { GenericNotificationEmail } from "../emails/GenericNotificationEmail";
import { JobAlertEmail } from "../emails/JobAlertEmail";
import { LiveClassReminderEmail } from "../emails/LiveClassReminderEmail";
import { QuizResultEmail } from "../emails/QuizResultEmail";

const FROM = process.env.EMAIL_FROM ?? "hello@novracademy.com";

let resendClient: Resend | null | undefined;

function getResendClient(): Resend | null {
  if (resendClient === undefined) {
    resendClient = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null;
  }
  return resendClient;
}

async function sendEmail(to: string, subject: string, react: ReactElement) {
  const client = getResendClient();
  if (!client) {
    console.warn(`Skipping email "${subject}" to ${to} — RESEND_API_KEY is not configured.`);
    return;
  }
  await client.emails.send({ from: FROM, to, subject, react });
}

export async function sendEnrollmentConfirmedEmail(params: {
  to: string;
  learnerName: string;
  courseTitle: string;
  courseUrl: string;
  expiresAtLabel: string | null;
}) {
  const { to, ...props } = params;
  await sendEmail(to, `You're enrolled in ${props.courseTitle}`, <EnrollmentConfirmedEmail {...props} />);
}

export async function sendExpiryWarningEmail(params: {
  to: string;
  learnerName: string;
  courseTitle: string;
  courseUrl: string;
  daysRemaining: number;
}) {
  const { to, ...props } = params;
  await sendEmail(to, `Your access to ${props.courseTitle} expires soon`, <ExpiryWarningEmail {...props} />);
}

export async function sendQuizResultEmail(params: {
  to: string;
  learnerName: string;
  courseTitle: string;
  lessonTitle: string;
  courseUrl: string;
  score: number;
  passed: boolean;
  attemptsRemaining: number;
}) {
  const { to, ...props } = params;
  await sendEmail(to, props.passed ? "You passed the quiz!" : "Your quiz result", <QuizResultEmail {...props} />);
}

export async function sendCertificateIssuedEmail(params: {
  to: string;
  learnerName: string;
  courseTitle: string;
  verificationUrl: string;
}) {
  const { to, ...props } = params;
  await sendEmail(to, `Your certificate for ${props.courseTitle} is ready`, <CertificateIssuedEmail {...props} />);
}

export async function sendAlumniInviteEmail(params: { to: string; fullName: string; courseName: string; claimUrl: string }) {
  const { to, ...props } = params;
  await sendEmail(to, "Your training record is on Novr Academy", <AlumniInviteEmail {...props} />);
}

export async function sendEventReminderEmail(params: {
  to: string;
  learnerName: string;
  eventTitle: string;
  startAtLabel: string;
  eventUrl: string;
  hoursBefore: number;
}) {
  const { to, ...props } = params;
  await sendEmail(to, `${props.eventTitle} starts soon`, <EventReminderEmail {...props} />);
}

export async function sendGenericNotificationEmail(params: { to: string; title: string; content: string }) {
  await sendEmail(params.to, params.title, <GenericNotificationEmail title={params.title} content={params.content} />);
}

export async function sendJobAlertEmail(params: {
  to: string;
  learnerName: string;
  title: string;
  company: string;
  location: string;
  jobBoardUrl: string;
}) {
  const { to, ...props } = params;
  await sendEmail(to, `New opportunity: ${props.title} at ${props.company}`, <JobAlertEmail {...props} />);
}

export async function sendLiveClassReminderEmail(params: {
  to: string;
  learnerName: string;
  lessonTitle: string;
  courseTitle: string;
  courseUrl: string;
  scheduledAtLabel: string;
  hoursBefore: number;
}) {
  const { to, ...props } = params;
  await sendEmail(to, `${props.lessonTitle} starts soon`, <LiveClassReminderEmail {...props} />);
}
