import { Router } from "express";
import { ADMIN_ROLES } from "@novr/types";
import { authenticate, requireRole } from "../middleware/auth";
import * as r2Service from "../services/r2Service";

const router = Router();

router.use(authenticate, requireRole(...ADMIN_ROLES));

// GET /storage/status — is R2 configured, and with what bucket/account.
router.get("/status", (_req, res) => {
  res.json(r2Service.getStatus());
});

// POST /storage/test — round-trips a throwaway object through the bucket
// to confirm the credentials actually work.
router.post("/test", async (_req, res) => {
  const result = await r2Service.testConnection();
  res.json(result);
});

export default router;
