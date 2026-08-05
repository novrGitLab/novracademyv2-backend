"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.initializeTransaction = initializeTransaction;
exports.verifyWebhookSignature = verifyWebhookSignature;
const crypto_1 = __importDefault(require("crypto"));
const PAYSTACK_API_URL = "https://api.paystack.co";
function getClient() {
    const key = process.env.PAYSTACK_SECRET_KEY;
    if (!key) {
        console.warn("Paystack is not configured (PAYSTACK_SECRET_KEY missing).");
        return null;
    }
    return key;
}
/**
 * Initializes a Paystack transaction. Paystack's API takes the amount in
 * the smallest currency unit (kobo for NGN) — same convention as
 * Course.priceCents, so no conversion is needed here.
 */
async function initializeTransaction(params) {
    const secretKey = getClient();
    if (!secretKey)
        return null;
    const res = await fetch(`${PAYSTACK_API_URL}/transaction/initialize`, {
        method: "POST",
        headers: {
            Authorization: `Bearer ${secretKey}`,
            "Content-Type": "application/json",
        },
        body: JSON.stringify({
            email: params.email,
            amount: params.amountCents,
            currency: params.currency,
            reference: params.reference,
            callback_url: params.callbackUrl,
            metadata: params.metadata,
        }),
    });
    const json = (await res.json());
    if (!res.ok || !json.status || !json.data) {
        throw new Error(json.message ?? "Failed to initialize Paystack transaction");
    }
    return json.data;
}
/**
 * Verifies a Paystack webhook per their documented scheme: header
 * `x-paystack-signature` is HMAC-SHA512(secretKey, rawBody), hex-encoded.
 */
function verifyWebhookSignature(rawBody, signatureHeader) {
    const secretKey = getClient();
    if (!secretKey || !signatureHeader)
        return false;
    const hash = crypto_1.default.createHmac("sha512", secretKey).update(rawBody).digest("hex");
    const expected = Buffer.from(signatureHeader, "utf8");
    const actual = Buffer.from(hash, "utf8");
    if (expected.length !== actual.length)
        return false;
    return crypto_1.default.timingSafeEqual(expected, actual);
}
