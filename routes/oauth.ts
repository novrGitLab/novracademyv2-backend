// POST /oauth/token — machine-to-machine OAuth2 client_credentials.
// Returns a short-lived JWT usable as a Bearer token on scoped API routes.
// Callers use grant_type=client_credentials, client_id/client_secret, and an
// optional space-separated `scope` (must be a subset of the client's scopes).

import { Router } from "express";
import { z } from "zod";
import * as oauthService from "../services/oauthService";
import { oauthLimiter } from "../middleware/rateLimit";

const router = Router();

const tokenBodySchema = z.object({
  grant_type: z.literal("client_credentials"),
  client_id: z.string().min(1, "client_id is required"),
  client_secret: z.string().min(1, "client_secret is required"),
  scope: z.string().optional(),
});

router.post("/token", oauthLimiter, async (req, res) => {
  const parsed = tokenBodySchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({
      error: "invalid_request",
      error_description: parsed.error.message,
    });
  }
  try {
    const result = await oauthService.issueClientCredentialsToken({
      clientId: parsed.data.client_id,
      clientSecret: parsed.data.client_secret,
      requestScope: parsed.data.scope,
    });
    res.json(result);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Invalid client credentials";
    // isClientError helpers: unknown scope → 400, bad creds → 401.
    const code = msg.startsWith("Requested scope") ? 400 : 401;
    const errorName = code === 400 ? "invalid_scope" : "invalid_client";
    return res.status(code).json({ error: errorName, error_description: msg });
  }
});

export default router;
