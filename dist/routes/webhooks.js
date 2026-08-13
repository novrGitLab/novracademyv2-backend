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
const express_1 = __importStar(require("express"));
const db_1 = require("@novr/db");
const types_1 = require("@novr/types");
const dailyService = __importStar(require("../services/dailyService"));
const enrollmentService = __importStar(require("../services/enrollmentService"));
const lessonService = __importStar(require("../services/lessonService"));
const liveAttendanceService = __importStar(require("../services/liveAttendanceService"));
const muxService = __importStar(require("../services/muxService"));
const paystackService = __importStar(require("../services/paystackService"));
const stripeService = __importStar(require("../services/stripeService"));
const router = (0, express_1.Router)();
// Mounted with express.raw() (not express.json()) so the exact bytes Mux
// signed are available for signature verification.
router.post("/mux", express_1.default.raw({ type: "application/json" }), async (req, res) => {
    const signature = req.header("mux-signature");
    const rawBody = req.body;
    if (!muxService.verifyMuxWebhookSignature(rawBody, signature)) {
        return res.status(401).json({ error: "Invalid signature" });
    }
    const event = JSON.parse(rawBody.toString("utf8"));
    switch (event.type) {
        case "video.asset.created": {
            const { upload_id: uploadId, id: assetId } = event.data;
            if (uploadId && assetId) {
                await lessonService.setLessonAssetCreated(uploadId, assetId);
            }
            break;
        }
        case "video.asset.ready": {
            const { id: assetId, playback_ids: playbackIds, duration } = event.data;
            const playbackId = playbackIds?.[0]?.id;
            if (assetId && playbackId) {
                await lessonService.setLessonAssetReady(assetId, playbackId, duration ? Math.round(duration) : undefined);
            }
            break;
        }
        case "video.asset.errored": {
            const { id: assetId } = event.data;
            if (assetId) {
                await lessonService.setLessonAssetErrored(assetId);
            }
            break;
        }
        default:
            break;
    }
    res.status(200).json({ received: true });
});
// Mounted with express.raw() so the exact bytes Stripe signed are
// available for signature verification.
router.post("/stripe", express_1.default.raw({ type: "application/json" }), async (req, res) => {
    const event = stripeService.constructWebhookEvent(req.body, req.header("stripe-signature"));
    if (!event) {
        return res.status(400).json({ error: "Invalid signature" });
    }
    if (event.type === "checkout.session.completed") {
        const session = event.data.object;
        const payment = await db_1.prisma.payment.findFirst({ where: { providerRef: session.id } });
        if (payment && session.payment_status === "paid") {
            await db_1.prisma.payment.update({ where: { id: payment.id }, data: { status: types_1.PaymentStatus.SUCCEEDED } });
            await enrollmentService.activateEnrollmentFromPayment(payment.id);
        }
    }
    res.status(200).json({ received: true });
});
// Paystack sends JSON but signature verification still needs the raw bytes.
router.post("/paystack", express_1.default.raw({ type: "application/json" }), async (req, res) => {
    const rawBody = req.body;
    const signature = req.header("x-paystack-signature");
    if (!paystackService.verifyWebhookSignature(rawBody, signature)) {
        return res.status(401).json({ error: "Invalid signature" });
    }
    const event = JSON.parse(rawBody.toString("utf8"));
    if (event.event === "charge.success") {
        const payment = await db_1.prisma.payment.findFirst({ where: { providerRef: event.data.reference } });
        if (payment && event.data.status === "success") {
            await db_1.prisma.payment.update({ where: { id: payment.id }, data: { status: types_1.PaymentStatus.SUCCEEDED } });
            await enrollmentService.activateEnrollmentFromPayment(payment.id);
        }
    }
    res.status(200).json({ received: true });
});
// Mounted with express.raw() so the exact bytes Daily.co signed are
// available for signature verification.
router.post("/daily", express_1.default.raw({ type: "application/json" }), async (req, res) => {
    const rawBody = req.body;
    const isValid = dailyService.verifyWebhookSignature(rawBody, req.header("x-webhook-timestamp"), req.header("x-webhook-signature"));
    if (!isValid) {
        return res.status(401).json({ error: "Invalid signature" });
    }
    const event = JSON.parse(rawBody.toString("utf8"));
    switch (event.type) {
        case "meeting.participant-joined": {
            const roomName = event.payload.room ?? event.payload.room_name;
            const userId = event.payload.user_id;
            if (roomName && userId) {
                const lesson = await lessonService.getLessonByDailyRoomName(roomName);
                if (lesson)
                    await liveAttendanceService.markAttended(lesson.id, userId);
            }
            break;
        }
        case "recording.ready-to-download": {
            const roomName = event.payload.room_name;
            const recordingId = event.payload.recording_id ?? event.payload.id;
            if (roomName && recordingId) {
                const lesson = await lessonService.getLessonByDailyRoomName(roomName);
                if (lesson)
                    await lessonService.setLessonRecording(lesson.id, recordingId);
            }
            break;
        }
        default:
            break;
    }
    res.status(200).json({ received: true });
});
const EVENT_MAP = {
    "Email Sent": "sent",
    "Email Opened": "opened",
    "Clicked Link": "clicked",
    "Submitted Data": "submitted",
    "Email Reported": "reported",
};
router.post("/gophish", async (req, res) => {
    const { campaign_id, email, message, details } = req.body;
    try {
        // Find the campaign by gophishCampaignId
        const campaign = await db_1.prisma.campaign.findFirst({
            where: { gophishCampaignId: campaign_id },
        });
        if (campaign) {
            await db_1.prisma.campaignResult.create({
                data: {
                    campaignId: campaign.id,
                    gophishCampaignId: campaign_id,
                    employeeEmail: email,
                    eventType: EVENT_MAP[message] || message,
                    metadata: details || {},
                },
            });
        }
        res.status(200).json({ received: true });
    }
    catch (err) {
        console.error("GoPhish webhook error:", err);
        res.status(500).json({ error: "Webhook processing failed" });
    }
});
exports.default = router;
