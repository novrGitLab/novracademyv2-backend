import nodemailer from "nodemailer";

let transporter: nodemailer.Transporter | null = null;

function getTransporter(): nodemailer.Transporter | null {
  if (transporter) return transporter;

  const host = process.env.GOPHISH_SMTP_HOST;
  const port = Number(process.env.GOPHISH_SMTP_PORT ?? 587);
  const user = process.env.GOPHISH_SMTP_USERNAME;
  const pass = process.env.GOPHISH_SMTP_PASSWORD;

  if (!host || !user || !pass) return null;

  transporter = nodemailer.createTransport({
    host,
    port,
    secure: port === 465,
    auth: { user, pass },
    tls: { rejectUnauthorized: false },
  });

  return transporter;
}

export interface SendMailOptions {
  to: string;
  subject: string;
  text: string;
  html: string;
}

export async function sendMail(options: SendMailOptions): Promise<string | null> {
  const t = getTransporter();
  if (!t) {
    console.warn("[mail] SMTP not configured; skipping send to", options.to);
    return null;
  }
  const info = await t.sendMail({
    from: `"Novr Academy" <${process.env.GOPHISH_SMTP_USERNAME}>`,
    to: options.to,
    subject: options.subject,
    text: options.text,
    html: options.html,
  });
  return info.messageId;
}
