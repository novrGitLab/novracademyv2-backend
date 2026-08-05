import express, { Router } from "express";
import { prisma } from "@novr/db";
import { PaymentStatus } from "@novr/types";
import * as dailyService from "../services/dailyService";
import * as enrollmentService from "../services/enrollmentService";
import * as lessonService from "../services/lessonService";
import * as liveAttendanceService from "../services/liveAttendanceService";
import * as muxService from "../services/muxService";
import * as paystackService from "../services/paystackService";
import * as stripeService from "../services/stripeService";

const router = Router();

interface MuxAsset {
  id: string;
  upload_id?: string;
  duration?: number;
  playback_ids?: { id: string }[];
}

// Mounted with express.raw() (not express.json()) so the exact bytes Mux
// signed are available for signature verification.
router.post("/mux", express.raw({ type: "application/json" }), async (req, res) => {
  const signature = req.header("mux-signature");
  const rawBody = req.body as Buffer;

  if (!muxService.verifyMuxWebhookSignature(rawBody, signature)) {
    return res.status(401).json({ error: "Invalid signature" });
  }

  const event = JSON.parse(rawBody.toString("utf8")) as { type: string; data: MuxAsset };

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
router.post("/stripe", express.raw({ type: "application/json" }), async (req, res) => {
  const event = stripeService.constructWebhookEvent(req.body as Buffer, req.header("stripe-signature"));
  if (!event) {
    return res.status(400).json({ error: "Invalid signature" });
  }

  if (event.type === "checkout.session.completed") {
    const session = event.data.object as { id: string; payment_status: string };
    const payment = await prisma.payment.findFirst({ where: { providerRef: session.id } });
    if (payment && session.payment_status === "paid") {
      await prisma.payment.update({ where: { id: payment.id }, data: { status: PaymentStatus.SUCCEEDED } });
      await enrollmentService.activateEnrollmentFromPayment(payment.id);
    }
  }

  res.status(200).json({ received: true });
});

// Paystack sends JSON but signature verification still needs the raw bytes.
router.post("/paystack", express.raw({ type: "application/json" }), async (req, res) => {
  const rawBody = req.body as Buffer;
  const signature = req.header("x-paystack-signature");

  if (!paystackService.verifyWebhookSignature(rawBody, signature)) {
    return res.status(401).json({ error: "Invalid signature" });
  }

  const event = JSON.parse(rawBody.toString("utf8")) as {
    event: string;
    data: { reference: string; status: string };
  };

  if (event.event === "charge.success") {
    const payment = await prisma.payment.findFirst({ where: { providerRef: event.data.reference } });
    if (payment && event.data.status === "success") {
      await prisma.payment.update({ where: { id: payment.id }, data: { status: PaymentStatus.SUCCEEDED } });
      await enrollmentService.activateEnrollmentFromPayment(payment.id);
    }
  }

  res.status(200).json({ received: true });
});

interface DailyEvent {
  type: string;
  payload: {
    room?: string;
    room_name?: string;
    user_id?: string;
    recording_id?: string;
    id?: string;
  };
}

// Mounted with express.raw() so the exact bytes Daily.co signed are
// available for signature verification.
router.post("/daily", express.raw({ type: "application/json" }), async (req, res) => {
  const rawBody = req.body as Buffer;
  const isValid = dailyService.verifyWebhookSignature(
    rawBody,
    req.header("x-webhook-timestamp"),
    req.header("x-webhook-signature")
  );
  if (!isValid) {
    return res.status(401).json({ error: "Invalid signature" });
  }

  const event = JSON.parse(rawBody.toString("utf8")) as DailyEvent;

  switch (event.type) {
    case "meeting.participant-joined": {
      const roomName = event.payload.room ?? event.payload.room_name;
      const userId = event.payload.user_id;
      if (roomName && userId) {
        const lesson = await lessonService.getLessonByDailyRoomName(roomName);
        if (lesson) await liveAttendanceService.markAttended(lesson.id, userId);
      }
      break;
    }
    case "recording.ready-to-download": {
      const roomName = event.payload.room_name;
      const recordingId = event.payload.recording_id ?? event.payload.id;
      if (roomName && recordingId) {
        const lesson = await lessonService.getLessonByDailyRoomName(roomName);
        if (lesson) await lessonService.setLessonRecording(lesson.id, recordingId);
      }
      break;
    }
    default:
      break;
  }

  res.status(200).json({ received: true });
});

export default router;
