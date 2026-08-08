import { Router } from "express";
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
    select: { id: true, email: true, name: true, role: true, memberType: true, status: true, passwordHash: true },
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
    },
  });
});

export default router;
