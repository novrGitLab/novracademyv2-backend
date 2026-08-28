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

/**
 * Sends a marketing campaign's raw HTML to a batch of recipients via
 * Resend's batch API (max 100 per call, per Resend's limits — chunked here).
 * Each recipient gets their own unsubscribe link appended to the body.
 *
 * Returns sent/failed counts. Resend's batch API only reports success or
 * failure per *chunk* (up to 100 recipients), not per individual recipient
 * within a chunk — so a failed chunk counts all its recipients as failed.
 * True per-recipient delivery status (bounced, etc.) would need Resend's
 * webhook events, which aren't wired up here.
 */
export async function sendMarketingCampaignBatch(
  recipients: { email: string; unsubscribeToken: string }[],
  subject: string,
  bodyHtml: string
): Promise<{ sent: number; failed: number }> {
  const client = getResendClient();
  if (!client) {
    console.warn(`Skipping marketing campaign "${subject}" — RESEND_API_KEY is not configured.`);
    return { sent: 0, failed: recipients.length };
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  const BATCH_SIZE = 100;
  let sent = 0;
  let failed = 0;

  for (let i = 0; i < recipients.length; i += BATCH_SIZE) {
    const chunk = recipients.slice(i, i + BATCH_SIZE);
    try {
      await client.batch.send(
        chunk.map((recipient) => ({
          from: FROM,
          to: recipient.email,
          subject,
          html: `${bodyHtml}<p style="margin-top:32px;font-size:12px;color:#6B7280">
            <a href="${appUrl}/unsubscribe?token=${recipient.unsubscribeToken}">Unsubscribe</a>
          </p>`,
        }))
      );
      sent += chunk.length;
    } catch (err) {
      console.error("Marketing campaign batch failed:", err);
      failed += chunk.length;
    }
  }

  return { sent, failed };
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
