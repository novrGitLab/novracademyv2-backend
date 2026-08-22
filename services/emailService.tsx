import type { ReactElement } from "react";
import nodemailer from "nodemailer";
import { renderToStaticMarkup } from "react-dom/server";
import { AlumniInviteEmail } from "../emails/AlumniInviteEmail";
import { AdminWelcomeEmail } from "../emails/AdminWelcomeEmail";
import { CertificateIssuedEmail } from "../emails/CertificateIssuedEmail";
import { EnrollmentConfirmedEmail } from "../emails/EnrollmentConfirmedEmail";
import { EventReminderEmail } from "../emails/EventReminderEmail";
import { ExpiryWarningEmail } from "../emails/ExpiryWarningEmail";
import { GenericNotificationEmail } from "../emails/GenericNotificationEmail";
import { JobAlertEmail } from "../emails/JobAlertEmail";
import { LiveClassReminderEmail } from "../emails/LiveClassReminderEmail";
import { QuizResultEmail } from "../emails/QuizResultEmail";

const FROM = process.env.EMAIL_FROM ?? "Novr Academy <novracademy@gmail.com>";

let transporter: nodemailer.Transporter | null | undefined;

const SMTP_SERVICES: Record<string, { host: string; port: number }> = {
  gmail: { host: "smtp.gmail.com", port: 465 },
  zoho: { host: "smtp.zoho.com", port: 465 },
  "zohomail": { host: "smtp.zoho.com", port: 465 },
  outlook: { host: "smtp-mail.outlook.com", port: 587 },
};

function getTransporter(): nodemailer.Transporter | null {
  if (transporter !== undefined) return transporter;

  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;

  if (!user || !pass) {
    transporter = null;
    return transporter;
  }

  const serviceName = (process.env.SMTP_SERVICE ?? "gmail").toLowerCase();
  const serviceConfig = SMTP_SERVICES[serviceName];

  if (serviceConfig) {
    transporter = nodemailer.createTransport({
      host: serviceConfig.host,
      port: serviceConfig.port,
      secure: serviceConfig.port === 465,
      auth: { user, pass },
    });
  } else {
    transporter = nodemailer.createTransport({
      service: serviceName,
      auth: { user, pass },
    });
  }

  return transporter;
}

async function sendEmail(to: string, subject: string, react: ReactElement) {
  const transport = getTransporter();
  if (!transport) {
    console.warn(`Skipping email "${subject}" to ${to} — SMTP not configured (set SMTP_USER and SMTP_PASS in .env).`);
    return;
  }

  const html = renderToStaticMarkup(react);

  await transport.sendMail({
    from: FROM,
    to,
    subject,
    html,
  });
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

export async function sendAdminWelcomeEmail(params: {
  to: string;
  orgName: string;
  adminName: string;
  email: string;
  loginUrl: string;
  tempPassword: string;
}) {
  const { to, ...props } = params;
  await sendEmail(to, `Your ${props.orgName} account is ready`, <AdminWelcomeEmail {...props} />);
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
