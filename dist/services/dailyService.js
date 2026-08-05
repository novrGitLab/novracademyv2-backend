"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.roomNameForLesson = roomNameForLesson;
exports.createRoom = createRoom;
exports.createMeetingToken = createMeetingToken;
exports.getRecordingAccessLink = getRecordingAccessLink;
exports.verifyWebhookSignature = verifyWebhookSignature;
const crypto_1 = __importDefault(require("crypto"));
const DAILY_API_URL = "https://api.daily.co/v1";
function getClient() {
    const key = process.env.DAILY_API_KEY;
    if (!key) {
        console.warn("Daily.co is not configured (DAILY_API_KEY missing).");
        return null;
    }
    return key;
}
async function dailyFetch(apiKey, path, init = {}) {
    const res = await fetch(`${DAILY_API_URL}${path}`, {
        ...init,
        headers: {
            Authorization: `Bearer ${apiKey}`,
            "Content-Type": "application/json",
            ...init.headers,
        },
    });
    const json = (await res.json());
    if (!res.ok) {
        throw new Error(json?.error ?? json?.info ?? `Daily API error (${res.status})`);
    }
    return json;
}
function roomNameForLesson(lessonId) {
    // Daily room names are restricted to a limited charset — lessonId (cuid)
    // is already alphanumeric, so this is safe as-is.
    return `lesson-${lessonId}`;
}
/**
 * Creates (or returns the existing) Daily.co room for a live lesson.
 * `exp` gives the room a lifetime so stale rooms don't accumulate in the
 * Daily dashboard — a few hours past the scheduled start is plenty for a
 * single class session.
 */
async function createRoom(lessonId, scheduledAt) {
    const apiKey = getClient();
    if (!apiKey)
        return null;
    const name = roomNameForLesson(lessonId);
    const expSeconds = Math.floor((scheduledAt?.getTime() ?? Date.now()) / 1000) + 6 * 60 * 60;
    try {
        return await dailyFetch(apiKey, `/rooms/${name}`);
    }
    catch {
        // Room doesn't exist yet — create it.
    }
    return dailyFetch(apiKey, "/rooms", {
        method: "POST",
        body: JSON.stringify({
            name,
            properties: {
                enable_recording: "cloud",
                exp: expSeconds,
            },
        }),
    });
}
/**
 * Mints a per-user Daily.co meeting token. `userId` is threaded through as
 * a custom claim so the participant-joined webhook can map an actual join
 * event back to our User/LiveAttendance rows — attendance is tracked from
 * that webhook, not from token issuance (a token doesn't guarantee someone
 * actually joined).
 */
async function createMeetingToken(params) {
    const apiKey = getClient();
    if (!apiKey)
        return null;
    const { token } = await dailyFetch(apiKey, "/meeting-tokens", {
        method: "POST",
        body: JSON.stringify({
            properties: {
                room_name: params.roomName,
                user_id: params.userId,
                user_name: params.userName,
                is_owner: params.isOwner,
            },
        }),
    });
    return token;
}
async function getRecordingAccessLink(recordingId) {
    const apiKey = getClient();
    if (!apiKey)
        return null;
    const { download_link } = await dailyFetch(apiKey, `/recordings/${recordingId}/access-link`);
    return download_link;
}
const WEBHOOK_TOLERANCE_SECONDS = 5 * 60;
/**
 * Verifies a Daily.co webhook per their documented HMAC scheme: headers
 * `X-Webhook-Timestamp` and `X-Webhook-Signature`, where the signature is
 * base64(HMAC-SHA256(secret, `${timestamp}.${rawBody}`)).
 */
function verifyWebhookSignature(rawBody, timestampHeader, signatureHeader) {
    const secret = process.env.DAILY_WEBHOOK_SECRET;
    if (!secret) {
        console.warn("Daily.co webhook secret is not configured (DAILY_WEBHOOK_SECRET missing).");
        return false;
    }
    if (!timestampHeader || !signatureHeader)
        return false;
    const ageSeconds = Math.abs(Date.now() / 1000 - Number(timestampHeader));
    if (Number.isNaN(ageSeconds) || ageSeconds > WEBHOOK_TOLERANCE_SECONDS)
        return false;
    const hmac = crypto_1.default
        .createHmac("sha256", secret)
        .update(`${timestampHeader}.${rawBody.toString("utf8")}`)
        .digest("base64");
    const expected = Buffer.from(signatureHeader, "utf8");
    const actual = Buffer.from(hmac, "utf8");
    if (expected.length !== actual.length)
        return false;
    return crypto_1.default.timingSafeEqual(expected, actual);
}
