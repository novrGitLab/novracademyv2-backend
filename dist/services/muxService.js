"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.createDirectUpload = createDirectUpload;
exports.getAsset = getAsset;
exports.signPlaybackId = signPlaybackId;
exports.verifyMuxWebhookSignature = verifyMuxWebhookSignature;
const crypto_1 = __importDefault(require("crypto"));
const mux_node_1 = __importDefault(require("@mux/mux-node"));
const jose_1 = require("jose");
let muxClient;
function getClient() {
    if (muxClient === undefined) {
        const tokenId = process.env.MUX_TOKEN_ID;
        const tokenSecret = process.env.MUX_TOKEN_SECRET;
        muxClient = tokenId && tokenSecret ? new mux_node_1.default({ tokenId, tokenSecret }) : null;
    }
    if (!muxClient) {
        console.warn("Mux is not configured (MUX_TOKEN_ID / MUX_TOKEN_SECRET missing).");
    }
    return muxClient;
}
/**
 * Creates a Mux direct upload for a video lesson. The browser PUTs the file
 * straight to the returned URL — the file never touches our servers.
 * `passthrough` carries the lessonId so the webhook can map the resulting
 * asset back to the right lesson.
 */
async function createDirectUpload(lessonId) {
    const client = getClient();
    if (!client)
        return null;
    const upload = await client.video.uploads.create({
        cors_origin: process.env.CORS_ORIGIN ?? "http://localhost:3000",
        new_asset_settings: {
            playback_policy: ["signed"],
            passthrough: lessonId,
        },
    });
    return { uploadId: upload.id, uploadUrl: upload.url };
}
async function getAsset(assetId) {
    const client = getClient();
    if (!client)
        return null;
    return client.video.assets.retrieve(assetId);
}
/**
 * Signs a short-lived playback token for a `signed`-policy Mux playback ID.
 * Assets are created with playback_policy "signed" (see createDirectUpload)
 * specifically so a playback ID alone can't be used to stream the video —
 * every playback requires a fresh, per-request token from us, which we only
 * hand out after checking enrollment + lesson-unlock state.
 */
async function signPlaybackId(playbackId, audience = "v", expiresInSeconds = 3600) {
    const keyId = process.env.MUX_SIGNING_KEY_ID;
    const privateKeyPem = process.env.MUX_SIGNING_KEY_PRIVATE_KEY;
    if (!keyId || !privateKeyPem) {
        console.warn("Mux playback signing is not configured (MUX_SIGNING_KEY_ID / MUX_SIGNING_KEY_PRIVATE_KEY missing).");
        return null;
    }
    const privateKey = await (0, jose_1.importPKCS8)(privateKeyPem.replace(/\\n/g, "\n"), "RS256");
    return new jose_1.SignJWT({ sub: playbackId, aud: audience, kid: keyId })
        .setProtectedHeader({ alg: "RS256", kid: keyId })
        .setIssuedAt()
        .setExpirationTime(Math.floor(Date.now() / 1000) + expiresInSeconds)
        .sign(privateKey);
}
const WEBHOOK_TOLERANCE_SECONDS = 5 * 60;
/**
 * Verifies a Mux webhook per Mux's documented signing scheme:
 * header `Mux-Signature: t=<timestamp>,v1=<hex hmac>`, where the hmac is
 * HMAC-SHA256(secret, `${timestamp}.${rawBody}`).
 * Implemented directly against Node's crypto (rather than trusting a
 * specific SDK helper method name) so this stays stable across SDK versions.
 */
function verifyMuxWebhookSignature(rawBody, signatureHeader) {
    const secret = process.env.MUX_WEBHOOK_SECRET;
    if (!secret) {
        console.warn("Mux webhook secret is not configured (MUX_WEBHOOK_SECRET missing).");
        return false;
    }
    if (!signatureHeader)
        return false;
    const parts = Object.fromEntries(signatureHeader.split(",").map((part) => {
        const [key, value] = part.split("=");
        return [key, value];
    }));
    const timestamp = parts.t;
    const expectedSignature = parts.v1;
    if (!timestamp || !expectedSignature)
        return false;
    const ageSeconds = Math.abs(Date.now() / 1000 - Number(timestamp));
    if (Number.isNaN(ageSeconds) || ageSeconds > WEBHOOK_TOLERANCE_SECONDS)
        return false;
    const hmac = crypto_1.default
        .createHmac("sha256", secret)
        .update(`${timestamp}.${rawBody.toString("utf8")}`)
        .digest("hex");
    const expected = Buffer.from(expectedSignature, "utf8");
    const actual = Buffer.from(hmac, "utf8");
    if (expected.length !== actual.length)
        return false;
    return crypto_1.default.timingSafeEqual(expected, actual);
}
