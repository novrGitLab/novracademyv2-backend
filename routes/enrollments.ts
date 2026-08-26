import { Router } from "express";
import type { Request } from "express";
import { z } from "zod";
import { ADMIN_ROLES, MANAGER_ROLES, PaymentProvider, PaymentStatus } from "@novr/types";
import { prisma } from "@novr/db";
import { NotFoundError } from "../lib/errors";
import { requireRole } from "../middleware/auth";
import * as enrollmentService from "../services/enrollmentService";
import * as paystackService from "../services/paystackService";
import * as stripeService from "../services/stripeService";

const router = Router({ mergeParams: true });

function courseIdOf(req: Request): string {
  return (req.params as { courseId: string }).courseId;
}

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";

// POST /courses/:courseId/enroll/free — self-enroll, free courses only.
router.post("/free", async (req, res) => {
  try {
    const enrollment = await enrollmentService.selfEnrollFree(req.user!.id, courseIdOf(req));
    res.status(201).json(enrollment);
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : "Could not enroll" });
  }
});

// POST /courses/:courseId/enroll/checkout — self-enroll, paid courses.
// Creates a PENDING Payment + provider checkout session. The Enrollment
// itself is only created once the provider's webhook confirms payment
// (see routes/webhooks.ts) — never on the redirect back, which the client
// could forge.
const checkoutSchema = z.object({ provider: z.nativeEnum(PaymentProvider) });

router.post("/checkout", async (req, res) => {
  const parsed = checkoutSchema.safeParse(req.body);
  if (!parsed.success) {
    console.error(`[Enrollment] Checkout validation failed:`, parsed.error.flatten());
    return res.status(400).json({ error: "Invalid request parameters" });
  }

  try {
    const courseId = courseIdOf(req);
    const userId = req.user!.id;
    const provider = parsed.data.provider;

    console.log(`[Enrollment] Checkout initiated`, { courseId, userId, provider });

    const [course, user] = await Promise.all([
      prisma.course.findUnique({ where: { id: courseId } }),
      prisma.user.findUniqueOrThrow({ where: { id: userId } }),
    ]);

    if (!course) {
      console.error(`[Enrollment] Course not found: ${courseId}`);
      return res.status(404).json({ error: "Course not found" });
    }

    if (course.priceCents <= 0) {
      console.error(`[Enrollment] Course is free but checkout requested: ${courseId}`);
      return res.status(400).json({ error: "This course is free — use /enroll/free instead" });
    }

    console.log(`[Enrollment] Creating payment record`, {
      courseId,
      courseName: course.title,
      amount: course.priceCents,
      currency: course.currency,
      userId: user.id,
      userEmail: user.email,
      provider,
    });

    const payment = await prisma.payment.create({
      data: {
        userId: user.id,
        courseId,
        amountCents: course.priceCents,
        currency: course.currency,
        provider,
        status: PaymentStatus.PENDING,
      },
    });

    console.log(`[Enrollment] Payment record created: ${payment.id}`);

    const successUrl = `${APP_URL}/dashboard/learn/${courseId}?checkout=success`;
    const cancelUrl = `${APP_URL}/dashboard/learn/${courseId}?checkout=cancelled`;

    if (provider === PaymentProvider.STRIPE) {
      try {
        console.log(`[Enrollment] Initializing Stripe checkout for payment: ${payment.id}`);
        const session = await stripeService.createCheckoutSession({
          courseId,
          courseTitle: course.title,
        priceCents: course.priceCents,
        currency: course.currency,
        userId: user.id,
        userEmail: user.email,
        successUrl,
        cancelUrl,
      });
      if (!session) {
        console.error(`[Enrollment] Stripe not configured`);
        return res.status(503).json({ error: "Stripe is not configured" });
      }
      await prisma.payment.update({ where: { id: payment.id }, data: { providerRef: session.id } });
      console.log(`[Enrollment] Stripe session created: ${session.id}`);
      return res.status(201).json({ checkoutUrl: session.url });
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : String(err);
        console.error(`[Enrollment] Stripe checkout error:`, errorMsg);
        
        // Mark payment as failed if provider initialization fails
        await prisma.payment.update({
          where: { id: payment.id },
          data: { status: PaymentStatus.FAILED },
        });
        
        return res.status(503).json({ 
          error: "Stripe payment initialization failed. Please try again or contact support." 
        });
      }
    }

    try {
      console.log(`[Enrollment] Initializing Paystack checkout for payment: ${payment.id}`);
      const transaction = await paystackService.initializeTransaction({
        email: user.email,
        amountCents: course.priceCents,
        currency: course.currency,
        reference: payment.id,
        callbackUrl: successUrl,
        metadata: { courseId, userId: user.id, paymentId: payment.id },
      });
      if (!transaction) {
        console.error(`[Enrollment] Paystack not configured`);
        return res.status(503).json({ error: "Paystack is not configured" });
      }
      await prisma.payment.update({ where: { id: payment.id }, data: { providerRef: transaction.reference } });
      console.log(`[Enrollment] Paystack transaction initialized: ${transaction.reference}`);
      return res.status(201).json({
        checkoutUrl: transaction.authorization_url,
        accessCode: transaction.access_code,
        publicKey: process.env.PAYSTACK_PUBLIC_KEY ?? null,
      });
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      console.error(`[Enrollment] Paystack checkout error:`, errorMsg);
      
      // Mark payment as failed if provider initialization fails
      await prisma.payment.update({
        where: { id: payment.id },
        data: { status: PaymentStatus.FAILED },
      });
      
      return res.status(503).json({ 
        error: "Paystack payment initialization failed. Please try again or contact support." 
      });
    }
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    console.error(`[Enrollment] Checkout error:`, errorMsg);
    return res.status(500).json({ error: "An error occurred while processing your request" });
  }
});

// POST /courses/:courseId/enroll/assign — admin/manager assigns one learner.
const assignSchema = z.object({
  email: z.string().email(),
  validityDays: z.number().int().positive().optional(),
});

router.post("/assign", requireRole(...MANAGER_ROLES), async (req, res) => {
  const parsed = assignSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }
  const user = await prisma.user.findUnique({ where: { email: parsed.data.email } });
  if (!user) return res.status(404).json({ error: "No user with that email" });

  const result = await enrollmentService.assignEnrollment({
    courseId: courseIdOf(req),
    userId: user.id,
    assignedById: req.user!.id,
    validityDays: parsed.data.validityDays,
  });
  res.status(201).json(result);
});

// POST /courses/:courseId/enroll/bulk — admin bulk-assigns by email list
// (pasted or parsed client-side from an uploaded CSV).
const bulkSchema = z.object({
  emails: z.array(z.string().email()).min(1),
  validityDays: z.number().int().positive().optional(),
});

router.post("/bulk", requireRole(...ADMIN_ROLES), async (req, res) => {
  const parsed = bulkSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }
  const result = await enrollmentService.bulkAssignEnrollments({
    courseId: courseIdOf(req),
    assignedById: req.user!.id,
    emails: parsed.data.emails,
    validityDays: parsed.data.validityDays,
  });
  res.status(201).json(result);
});

// POST /courses/:courseId/enroll/cohort — admin enrolls an entire cohort.
const cohortSchema = z.object({
  cohortId: z.string(),
  validityDays: z.number().int().positive().optional(),
});

router.post("/cohort", requireRole(...ADMIN_ROLES), async (req, res) => {
  const parsed = cohortSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }
  const result = await enrollmentService.cohortEnroll({
    courseId: courseIdOf(req),
    assignedById: req.user!.id,
    ...parsed.data,
  });
  res.status(201).json(result);
});

// GET /courses/:courseId/enroll — admin views all enrollments for a course.
router.get("/", requireRole(...ADMIN_ROLES), async (req, res) => {
  const enrollments = await enrollmentService.listCourseEnrollments(courseIdOf(req));
  res.json({ enrollments });
});

export default router;
