"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.createCheckoutSession = createCheckoutSession;
exports.constructWebhookEvent = constructWebhookEvent;
const stripe_1 = __importDefault(require("stripe"));
let stripeClient;
// No explicit apiVersion — the installed SDK's TS types pin a specific
// literal that drifts with every stripe package update, so pinning here
// would break typecheck on every SDK bump. The SDK defaults to the API
// version it was built against.
function getClient() {
    if (stripeClient === undefined) {
        // Stripe's constructor throws on a falsy key, so this stays lazy —
        // constructing it at module load would crash the whole API on boot
        // whenever STRIPE_SECRET_KEY is unset.
        stripeClient = process.env.STRIPE_SECRET_KEY ? new stripe_1.default(process.env.STRIPE_SECRET_KEY) : null;
    }
    if (!stripeClient) {
        console.warn("Stripe is not configured (STRIPE_SECRET_KEY missing).");
    }
    return stripeClient;
}
async function createCheckoutSession(params) {
    const client = getClient();
    if (!client)
        return null;
    return client.checkout.sessions.create({
        mode: "payment",
        customer_email: params.userEmail,
        line_items: [
            {
                price_data: {
                    currency: params.currency.toLowerCase(),
                    unit_amount: params.priceCents,
                    product_data: { name: params.courseTitle },
                },
                quantity: 1,
            },
        ],
        success_url: params.successUrl,
        cancel_url: params.cancelUrl,
        metadata: { courseId: params.courseId, userId: params.userId },
    });
}
/** Verifies a Stripe webhook signature and parses the event. Returns null if Stripe isn't configured or the signature is invalid/missing. */
function constructWebhookEvent(rawBody, signature) {
    const client = getClient();
    if (!client || !signature)
        return null;
    const secret = process.env.STRIPE_WEBHOOK_SECRET;
    if (!secret) {
        console.warn("Stripe webhook secret is not configured (STRIPE_WEBHOOK_SECRET missing).");
        return null;
    }
    try {
        return client.webhooks.constructEvent(rawBody, signature, secret);
    }
    catch (err) {
        console.error("Invalid Stripe webhook signature:", err.message);
        return null;
    }
}
