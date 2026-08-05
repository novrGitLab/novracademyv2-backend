import crypto from "crypto";

const PAYSTACK_API_URL = "https://api.paystack.co";

function getClient(): string | null {
  const key = process.env.PAYSTACK_SECRET_KEY;
  if (!key) {
    console.warn("Paystack is not configured (PAYSTACK_SECRET_KEY missing).");
    return null;
  }
  return key;
}

export interface InitializeTransactionParams {
  email: string;
  amountCents: number;
  currency: string;
  reference: string;
  callbackUrl: string;
  metadata: Record<string, unknown>;
}

interface PaystackInitializeResponse {
  status: boolean;
  message: string;
  data?: { authorization_url: string; access_code: string; reference: string };
}

/**
 * Initializes a Paystack transaction. Paystack's API takes the amount in
 * the smallest currency unit (kobo for NGN) — same convention as
 * Course.priceCents, so no conversion is needed here.
 */
export async function initializeTransaction(
  params: InitializeTransactionParams
): Promise<PaystackInitializeResponse["data"] | null> {
  const secretKey = getClient();
  if (!secretKey) return null;

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

  const json = (await res.json()) as PaystackInitializeResponse;
  if (!res.ok || !json.status || !json.data) {
    throw new Error(json.message ?? "Failed to initialize Paystack transaction");
  }
  return json.data;
}

/**
 * Verifies a Paystack webhook per their documented scheme: header
 * `x-paystack-signature` is HMAC-SHA512(secretKey, rawBody), hex-encoded.
 */
export function verifyWebhookSignature(rawBody: Buffer, signatureHeader: string | undefined): boolean {
  const secretKey = getClient();
  if (!secretKey || !signatureHeader) return false;
  const hash = crypto.createHmac("sha512", secretKey).update(rawBody).digest("hex");
  const expected = Buffer.from(signatureHeader, "utf8");
  const actual = Buffer.from(hash, "utf8");
  if (expected.length !== actual.length) return false;
  return crypto.timingSafeEqual(expected, actual);
}
