import { Router } from "express";
import crypto from "crypto";
import { z } from "zod";
import { SignJWT } from "jose";
import bcrypt from "bcryptjs";
import { prisma } from "@novr/db";
import { UserStatus } from "@novr/types";

const router = Router();

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
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

const forgotPasswordSchema = z.object({
  email: z.string().email(),
});

router.post("/forgot-password", async (req, res) => {
  const parsed = forgotPasswordSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "Invalid email" });
  }

  const user = await prisma.user.findUnique({
    where: { email: parsed.data.email },
    select: { id: true, email: true },
  });

  // Always return success to prevent email enumeration
  if (!user) {
    return res.json({ message: "If an account exists with that email, a reset link has been sent." });
  }

  const resetToken = crypto.randomBytes(32).toString("hex");
  const resetExpires = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

  // Store reset token in a simple approach - we'll use the verification token table
  await prisma.verificationToken.create({
    data: {
      identifier: `password-reset:${user.id}`,
      token: resetToken,
      expires: resetExpires,
    },
  });

  // TODO: Send email with reset link
  // For now, log it (in production, use Resend email service)
  console.log(`Password reset token for ${user.email}: ${resetToken}`);
  console.log(`Reset URL: ${process.env.NEXTAUTH_URL || "http://localhost:3000"}/reset-password?token=${resetToken}`);

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
