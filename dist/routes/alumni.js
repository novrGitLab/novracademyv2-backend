"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const zod_1 = require("zod");
const types_1 = require("@novr/types");
const auth_1 = require("../middleware/auth");
const alumniService = __importStar(require("../services/alumniService"));
const router = (0, express_1.Router)();
const recordSchema = zod_1.z.object({
    fullName: zod_1.z.string().min(1),
    email: zod_1.z.string().email().optional(),
    phone: zod_1.z.string().optional(),
    courseName: zod_1.z.string().min(1),
    completionDate: zod_1.z.coerce.date().optional(),
    score: zod_1.z.number().optional(),
    cohortLabel: zod_1.z.string().optional(),
});
// POST /alumni/import — admin, bulk CSV import (rows parsed client-side, posted as JSON).
router.post("/import", auth_1.authenticate, (0, auth_1.requireRole)(...types_1.ADMIN_ROLES), async (req, res) => {
    const parsed = zod_1.z.object({ records: zod_1.z.array(recordSchema).min(1) }).safeParse(req.body);
    if (!parsed.success) {
        return res.status(400).json({ error: parsed.error.flatten() });
    }
    const result = await alumniService.importAlumniRecords(parsed.data.records);
    res.status(201).json(result);
});
// POST /alumni — admin, manual single-record entry for edge cases.
router.post("/", auth_1.authenticate, (0, auth_1.requireRole)(...types_1.ADMIN_ROLES), async (req, res) => {
    const parsed = recordSchema.safeParse(req.body);
    if (!parsed.success) {
        return res.status(400).json({ error: parsed.error.flatten() });
    }
    const record = await alumniService.createManualRecord(parsed.data);
    res.status(201).json(record);
});
const listQuerySchema = zod_1.z.object({
    claimed: zod_1.z.enum(["true", "false"]).transform((v) => v === "true").optional(),
    search: zod_1.z.string().optional(),
    page: zod_1.z.coerce.number().int().positive().optional(),
    pageSize: zod_1.z.coerce.number().int().positive().optional(),
});
// GET /alumni — admin listing.
router.get("/", auth_1.authenticate, (0, auth_1.requireRole)(...types_1.ADMIN_ROLES), async (req, res) => {
    const parsed = listQuerySchema.safeParse(req.query);
    if (!parsed.success) {
        return res.status(400).json({ error: parsed.error.flatten() });
    }
    const result = await alumniService.listAlumniRecords(parsed.data);
    res.json(result);
});
// GET /alumni/claim/:token — public, no auth: the claim landing page needs
// this before the visitor necessarily has an account.
router.get("/claim/:token", async (req, res) => {
    const info = await alumniService.getClaimInfo(req.params.token);
    res.json(info);
});
const claimSchema = zod_1.z.object({
    claimToken: zod_1.z.string(),
    password: zod_1.z.string().min(8).optional(),
});
// POST /alumni/claim — optionalAuthenticate: an anonymous visitor can claim
// a record with no existing account (creates one), but linking to an
// *existing* account requires being logged in as that same email.
router.post("/claim", auth_1.optionalAuthenticate, async (req, res) => {
    const parsed = claimSchema.safeParse(req.body);
    if (!parsed.success) {
        return res.status(400).json({ error: parsed.error.flatten() });
    }
    const user = await alumniService.claimRecord({ ...parsed.data, requestingUserEmail: req.user?.email });
    res.json({ userId: user.id, email: user.email });
});
exports.default = router;
