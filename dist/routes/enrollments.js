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
const express_1 = require("express");
const zod_1 = require("zod");
const types_1 = require("@novr/types");
const db_1 = require("@novr/db");
const errors_1 = require("../lib/errors");
const auth_1 = require("../middleware/auth");
const enrollmentService = __importStar(require("../services/enrollmentService"));
const paystackService = __importStar(require("../services/paystackService"));
const stripeService = __importStar(require("../services/stripeService"));
const router = (0, express_1.Router)({ mergeParams: true });
function courseIdOf(req) {
    return req.params.courseId;
}
const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
// POST /courses/:courseId/enroll/free — self-enroll, free courses only.
router.post("/free", async (req, res) => {
    try {
        const enrollment = await enrollmentService.selfEnrollFree(req.user.id, courseIdOf(req));
        res.status(201).json(enrollment);
    }
    catch (err) {
        res.status(400).json({ error: err instanceof Error ? err.message : "Could not enroll" });
    }
});
// POST /courses/:courseId/enroll/checkout — self-enroll, paid courses.
// Creates a PENDING Payment + provider checkout session. The Enrollment
// itself is only created once the provider's webhook confirms payment
// (see routes/webhooks.ts) — never on the redirect back, which the client
// could forge.
const checkoutSchema = zod_1.z.object({ provider: zod_1.z.nativeEnum(types_1.PaymentProvider) });
router.post("/checkout", async (req, res) => {
    const parsed = checkoutSchema.safeParse(req.body);
    if (!parsed.success) {
        return res.status(400).json({ error: parsed.error.flatten() });
    }
    const courseId = courseIdOf(req);
    const [course, user] = await Promise.all([
        db_1.prisma.course.findUnique({ where: { id: courseId } }),
        db_1.prisma.user.findUniqueOrThrow({ where: { id: req.user.id } }),
    ]);
    if (!course)
        throw new errors_1.NotFoundError("Course not found");
    if (course.priceCents <= 0) {
        return res.status(400).json({ error: "This course is free — use /enroll/free instead" });
    }
    const payment = await db_1.prisma.payment.create({
        data: {
            userId: user.id,
            courseId,
            amountCents: course.priceCents,
            currency: course.currency,
            provider: parsed.data.provider,
            status: types_1.PaymentStatus.PENDING,
        },
    });
    const successUrl = `${APP_URL}/dashboard/learn/${courseId}?checkout=success`;
    const cancelUrl = `${APP_URL}/dashboard/learn/${courseId}?checkout=cancelled`;
    if (parsed.data.provider === types_1.PaymentProvider.STRIPE) {
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
            return res.status(503).json({ error: "Stripe is not configured" });
        }
        await db_1.prisma.payment.update({ where: { id: payment.id }, data: { providerRef: session.id } });
        return res.status(201).json({ checkoutUrl: session.url });
    }
    const transaction = await paystackService.initializeTransaction({
        email: user.email,
        amountCents: course.priceCents,
        currency: course.currency,
        reference: payment.id,
        callbackUrl: successUrl,
        metadata: { courseId, userId: user.id, paymentId: payment.id },
    });
    if (!transaction) {
        return res.status(503).json({ error: "Paystack is not configured" });
    }
    await db_1.prisma.payment.update({ where: { id: payment.id }, data: { providerRef: transaction.reference } });
    res.status(201).json({ checkoutUrl: transaction.authorization_url });
});
// POST /courses/:courseId/enroll/assign — admin/manager assigns one learner.
const assignSchema = zod_1.z.object({
    email: zod_1.z.string().email(),
    validityDays: zod_1.z.number().int().positive().optional(),
});
router.post("/assign", (0, auth_1.requireRole)(...types_1.MANAGER_ROLES), async (req, res) => {
    const parsed = assignSchema.safeParse(req.body);
    if (!parsed.success) {
        return res.status(400).json({ error: parsed.error.flatten() });
    }
    const user = await db_1.prisma.user.findUnique({ where: { email: parsed.data.email } });
    if (!user)
        return res.status(404).json({ error: "No user with that email" });
    const result = await enrollmentService.assignEnrollment({
        courseId: courseIdOf(req),
        userId: user.id,
        assignedById: req.user.id,
        validityDays: parsed.data.validityDays,
    });
    res.status(201).json(result);
});
// POST /courses/:courseId/enroll/bulk — admin bulk-assigns by email list
// (pasted or parsed client-side from an uploaded CSV).
const bulkSchema = zod_1.z.object({
    emails: zod_1.z.array(zod_1.z.string().email()).min(1),
    validityDays: zod_1.z.number().int().positive().optional(),
});
router.post("/bulk", (0, auth_1.requireRole)(...types_1.ADMIN_ROLES), async (req, res) => {
    const parsed = bulkSchema.safeParse(req.body);
    if (!parsed.success) {
        return res.status(400).json({ error: parsed.error.flatten() });
    }
    const result = await enrollmentService.bulkAssignEnrollments({
        courseId: courseIdOf(req),
        assignedById: req.user.id,
        emails: parsed.data.emails,
        validityDays: parsed.data.validityDays,
    });
    res.status(201).json(result);
});
// POST /courses/:courseId/enroll/cohort — admin enrolls an entire cohort.
const cohortSchema = zod_1.z.object({
    cohortId: zod_1.z.string(),
    validityDays: zod_1.z.number().int().positive().optional(),
});
router.post("/cohort", (0, auth_1.requireRole)(...types_1.ADMIN_ROLES), async (req, res) => {
    const parsed = cohortSchema.safeParse(req.body);
    if (!parsed.success) {
        return res.status(400).json({ error: parsed.error.flatten() });
    }
    const result = await enrollmentService.cohortEnroll({
        courseId: courseIdOf(req),
        assignedById: req.user.id,
        ...parsed.data,
    });
    res.status(201).json(result);
});
// GET /courses/:courseId/enroll — admin views all enrollments for a course.
router.get("/", (0, auth_1.requireRole)(...types_1.ADMIN_ROLES), async (req, res) => {
    const enrollments = await enrollmentService.listCourseEnrollments(courseIdOf(req));
    res.json({ enrollments });
});
exports.default = router;
