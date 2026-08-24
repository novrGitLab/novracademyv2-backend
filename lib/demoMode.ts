/**
 * Demo mode skips real payment processing entirely — checkout auto-approves
 * enrollment instead of creating a Stripe/Paystack session. Toggle via
 * DEMO_MODE=true in .env. Stripe/Paystack service code is untouched; this
 * just short-circuits the routes that would call into them.
 */
export function isDemoMode(): boolean {
  return process.env.DEMO_MODE === "true";
}
