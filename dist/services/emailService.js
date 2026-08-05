"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.sendEnrollmentConfirmedEmail = sendEnrollmentConfirmedEmail;
exports.sendExpiryWarningEmail = sendExpiryWarningEmail;
exports.sendQuizResultEmail = sendQuizResultEmail;
exports.sendCertificateIssuedEmail = sendCertificateIssuedEmail;
exports.sendAlumniInviteEmail = sendAlumniInviteEmail;
exports.sendEventReminderEmail = sendEventReminderEmail;
exports.sendGenericNotificationEmail = sendGenericNotificationEmail;
exports.sendJobAlertEmail = sendJobAlertEmail;
exports.sendLiveClassReminderEmail = sendLiveClassReminderEmail;
const jsx_runtime_1 = require("react/jsx-runtime");
const resend_1 = require("resend");
const AlumniInviteEmail_1 = require("../emails/AlumniInviteEmail");
const CertificateIssuedEmail_1 = require("../emails/CertificateIssuedEmail");
const EnrollmentConfirmedEmail_1 = require("../emails/EnrollmentConfirmedEmail");
const EventReminderEmail_1 = require("../emails/EventReminderEmail");
const ExpiryWarningEmail_1 = require("../emails/ExpiryWarningEmail");
const GenericNotificationEmail_1 = require("../emails/GenericNotificationEmail");
const JobAlertEmail_1 = require("../emails/JobAlertEmail");
const LiveClassReminderEmail_1 = require("../emails/LiveClassReminderEmail");
const QuizResultEmail_1 = require("../emails/QuizResultEmail");
const FROM = process.env.EMAIL_FROM ?? "hello@novracademy.com";
let resendClient;
function getResendClient() {
    if (resendClient === undefined) {
        resendClient = process.env.RESEND_API_KEY ? new resend_1.Resend(process.env.RESEND_API_KEY) : null;
    }
    return resendClient;
}
async function sendEmail(to, subject, react) {
    const client = getResendClient();
    if (!client) {
        console.warn(`Skipping email "${subject}" to ${to} — RESEND_API_KEY is not configured.`);
        return;
    }
    await client.emails.send({ from: FROM, to, subject, react });
}
async function sendEnrollmentConfirmedEmail(params) {
    const { to, ...props } = params;
    await sendEmail(to, `You're enrolled in ${props.courseTitle}`, (0, jsx_runtime_1.jsx)(EnrollmentConfirmedEmail_1.EnrollmentConfirmedEmail, { ...props }));
}
async function sendExpiryWarningEmail(params) {
    const { to, ...props } = params;
    await sendEmail(to, `Your access to ${props.courseTitle} expires soon`, (0, jsx_runtime_1.jsx)(ExpiryWarningEmail_1.ExpiryWarningEmail, { ...props }));
}
async function sendQuizResultEmail(params) {
    const { to, ...props } = params;
    await sendEmail(to, props.passed ? "You passed the quiz!" : "Your quiz result", (0, jsx_runtime_1.jsx)(QuizResultEmail_1.QuizResultEmail, { ...props }));
}
async function sendCertificateIssuedEmail(params) {
    const { to, ...props } = params;
    await sendEmail(to, `Your certificate for ${props.courseTitle} is ready`, (0, jsx_runtime_1.jsx)(CertificateIssuedEmail_1.CertificateIssuedEmail, { ...props }));
}
async function sendAlumniInviteEmail(params) {
    const { to, ...props } = params;
    await sendEmail(to, "Your training record is on Novr Academy", (0, jsx_runtime_1.jsx)(AlumniInviteEmail_1.AlumniInviteEmail, { ...props }));
}
async function sendEventReminderEmail(params) {
    const { to, ...props } = params;
    await sendEmail(to, `${props.eventTitle} starts soon`, (0, jsx_runtime_1.jsx)(EventReminderEmail_1.EventReminderEmail, { ...props }));
}
async function sendGenericNotificationEmail(params) {
    await sendEmail(params.to, params.title, (0, jsx_runtime_1.jsx)(GenericNotificationEmail_1.GenericNotificationEmail, { title: params.title, content: params.content }));
}
async function sendJobAlertEmail(params) {
    const { to, ...props } = params;
    await sendEmail(to, `New opportunity: ${props.title} at ${props.company}`, (0, jsx_runtime_1.jsx)(JobAlertEmail_1.JobAlertEmail, { ...props }));
}
async function sendLiveClassReminderEmail(params) {
    const { to, ...props } = params;
    await sendEmail(to, `${props.lessonTitle} starts soon`, (0, jsx_runtime_1.jsx)(LiveClassReminderEmail_1.LiveClassReminderEmail, { ...props }));
}
