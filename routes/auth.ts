import { Router } from "express";
import crypto from "crypto";
import { z } from "zod";
import { SignJWT } from "jose";
import bcrypt from "bcryptjs";
import { prisma } from "@novr/db";
import { UserStatus } from "@novr/types";
import { authLimiter } from "../middleware/rateLimit";

const router = Router();

router.use(authLimiter);

const loginSchema = z.object({
  email: z.string().email().transform((s) => s.trim().toLowerCase()),
  password: z.string().min(1, "Password is required").max(256),
});

router.post("/login", async (req, res) => {
  const parsed = loginSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "Invalid email or password" });
  }

  const user = await prisma.user.findUnique({
    where: { email: parsed.data.email },
    select: { id: true, email: true, name: true, role: true, memberType: true, status: true, passwordHash: true, mustChangePassword: true },
  });

  if (!user || user.status !== UserStatus.ACTIVE) {
    return res.status(401).json({ error: "Invalid email or password" });
  }

  if (!user.passwordHash) {
    return res.status(401).json({ error: "Account has no password set. Use OAuth login." });
  }

  const valid = await bcrypt.compare(parsed.data.password, user.passwordHash);
  if (!valid) {
    return res.status(401).json({ error: "Invalid email or password" });
  }

  // Update lastLoginAt
  await prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });

  const secret = new TextEncoder().encode(process.env.NEXTAUTH_SECRET ?? "fallback-secret-do-not-use-in-production");
  const token = await new SignJWT({
    sub: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
  })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("7d")
    .sign(secret);

  res.json({
    token,
    user: {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      memberType: user.memberType,
      mustChangePassword: user.mustChangePassword,
    },
  });
});

import { sendMail } from "../lib/mailer";

const forgotPasswordSchema = z.object({
  email: z.string().email().transform((s) => s.trim().toLowerCase()),
});

router.post("/forgot-password", async (req, res) => {
  const parsed = forgotPasswordSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "Invalid email" });
  }

  const user = await prisma.user.findUnique({
    where: { email: parsed.data.email },
    select: { id: true, email: true, name: true },
  });

  // Always return success to prevent email enumeration
  if (!user) {
    return res.json({ message: "If an account exists with that email, a reset link has been sent." });
  }

  const resetToken = crypto.randomBytes(32).toString("hex");
  const resetExpires = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

  // Delete any existing reset tokens for this user, then store the new one.
  await prisma.verificationToken.deleteMany({ where: { identifier: `password-reset:${user.id}` } });
  await prisma.verificationToken.create({
    data: {
      identifier: `password-reset:${user.id}`,
      token: resetToken,
      expires: resetExpires,
    },
  });

  const baseUrl = (process.env.NEXTAUTH_URL || "http://localhost:3000").replace(/\/+$/, "");
  const resetUrl = `${baseUrl}/reset-password?token=${resetToken}`;

  // Fire-and-forget the email; do not block the API response on it.
  sendMail({
    to: user.email,
    subject: "Reset your Novr Academy password",
    text: `Hi${user.name ? ` ${user.name}` : ""},\n\nClick the link below to reset your Novr Academy password. This link expires in 1 hour.\n\n${resetUrl}\n\nIf you did not request a password reset, ignore this email.\n`,
    html: `<p>Hi${user.name ? ` <strong>${user.name}</strong>` : ""},</p><p>Click the button below to reset your Novr Academy password. This link expires in 1 hour.</p><p><a href="${resetUrl}" style="display:inline-block;padding:12px 20px;background:#683290;color:#fff;text-decoration:none;border-radius:8px;">Reset password</a></p><p>Or copy this link:<br/><a href="${resetUrl}">${resetUrl}</a></p><p>If you did not request a password reset, ignore this email.</p>`,
  }).catch((err) => console.error("[mail] failed to send reset email:", err));

  // Useful during development when SMTP is not configured.
  console.log(`[password-reset] Sent reset link to ${user.email}: ${resetUrl}`);

  res.json({ message: "If an account exists with that email, a reset link has been sent." });
});

const resetPasswordSchema = z.object({
  token: z.string(),
  password: z.string().min(8),
});

router.post("/reset-password", async (req, res) => {
  const parsed = resetPasswordSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "Invalid token or password" });
  }

  const verificationToken = await prisma.verificationToken.findFirst({
    where: {
      identifier: { startsWith: "password-reset:" },
      token: parsed.data.token,
      expires: { gt: new Date() },
    },
  });

  if (!verificationToken) {
    return res.status(400).json({ error: "Invalid or expired reset token" });
  }

  const userId = verificationToken.identifier.replace("password-reset:", "");
  const passwordHash = await bcrypt.hash(parsed.data.password, 10);

  await prisma.user.update({
    where: { id: userId },
    data: { passwordHash, mustChangePassword: false } as any,
  });

  // Delete the used token
  await prisma.verificationToken.deleteMany({
    where: { identifier: `password-reset:${userId}` },
  });

  res.json({ message: "Password reset successful" });
});

export default router;
