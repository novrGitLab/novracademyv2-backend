import "dotenv/config";
import Mux from "@mux/mux-node";
import crypto from "crypto";

async function main() {
  const tokenId = process.env.MUX_TOKEN_ID;
  const tokenSecret = process.env.MUX_TOKEN_SECRET;
  const webhookSecret = process.env.MUX_WEBHOOK_SECRET;
  const corsOrigin = process.env.CORS_ORIGIN;

  console.log("=== Mux Configuration Diagnostic ===\n");

  console.log("MUX_TOKEN_ID:", tokenId ? `✓ Set (${tokenId.slice(0, 8)}...)` : "✗ NOT SET");
  console.log("MUX_TOKEN_SECRET:", tokenSecret ? "✓ Set" : "✗ NOT SET");
  console.log("MUX_WEBHOOK_SECRET:", webhookSecret ? "✓ Set" : "✗ NOT SET (webhooks will fail!)");
  console.log("CORS_ORIGIN:", corsOrigin ? `"${corsOrigin}"` : "✗ NOT SET (defaults to localhost:3000)");

  if (!tokenId || !tokenSecret) {
    console.log("\n❌ Mux credentials are not configured. Video uploads will fail.");
    process.exit(1);
  }

  console.log("\n--- Testing Mux API connection ---");

  const mux = new Mux({ tokenId, tokenSecret });

  try {
    console.log("Testing direct upload creation...");
    const upload = await mux.video.uploads.create({
      cors_origin: corsOrigin ?? "http://localhost:3000",
      new_asset_settings: {
        playback_policy: ["signed"],
        passthrough: "diagnostic-test",
      },
    });

    console.log(`✓ Direct upload URL created!`);
    console.log(`  Upload ID: ${upload.id}`);
    console.log(`  Upload URL: ${upload.url.substring(0, 80)}...`);

    console.log("\n--- Webhook Configuration Check ---");
    if (!webhookSecret) {
      console.log("⚠️  WARNING: MUX_WEBHOOK_SECRET is not set!");
      console.log("   When Mux finishes processing a video, it sends a webhook to your server.");
      console.log("   Without MUX_WEBHOOK_SECRET, signature verification fails and the webhook is rejected.");
      console.log("   This causes videos to stay in 'PREPARING' forever.");
      console.log("");
      console.log("   To fix this:");
      console.log("   1. Go to https://dashboard.mux.com/settings/webhooks");
      console.log("   2. Create or copy your webhook signing secret");
      console.log("   3. Set MUX_WEBHOOK_SECRET in your backend environment");
      console.log("");
      console.log("   Your webhook endpoint should be: https://your-backend-domain.com/webhooks/mux");
    } else {
      console.log("✓ MUX_WEBHOOK_SECRET is configured.");
      console.log("  Make sure your Mux dashboard webhook URL points to: https://your-backend-domain.com/webhooks/mux");
    }

    console.log("\n✓ All basic checks passed.");
  } catch (err) {
    console.error(`\n❌ Mux API error:`, err instanceof Error ? err.message : err);
    process.exit(1);
  }
}

main();
