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
const csv_1 = require("../lib/csv");
const auth_1 = require("../middleware/auth");
const bulkActionService = __importStar(require("../services/bulkActionService"));
const router = (0, express_1.Router)();
router.use(auth_1.authenticate, (0, auth_1.requireRole)(...types_1.ADMIN_ROLES));
router.post("/unenroll", async (req, res) => {
    const parsed = zod_1.z.object({ enrollmentIds: zod_1.z.array(zod_1.z.string()).min(1) }).safeParse(req.body);
    if (!parsed.success)
        return res.status(400).json({ error: parsed.error.flatten() });
    const count = await bulkActionService.bulkUnenroll(parsed.data.enrollmentIds);
    res.json({ count });
});
router.post("/extend-validity", async (req, res) => {
    const parsed = zod_1.z
        .object({ enrollmentIds: zod_1.z.array(zod_1.z.string()).min(1), additionalDays: zod_1.z.number().int().positive() })
        .safeParse(req.body);
    if (!parsed.success)
        return res.status(400).json({ error: parsed.error.flatten() });
    const count = await bulkActionService.bulkExtendValidity(parsed.data.enrollmentIds, parsed.data.additionalDays);
    res.json({ count });
});
router.post("/user-status", async (req, res) => {
    const parsed = zod_1.z.object({ userIds: zod_1.z.array(zod_1.z.string()).min(1), status: zod_1.z.nativeEnum(types_1.UserStatus) }).safeParse(req.body);
    if (!parsed.success)
        return res.status(400).json({ error: parsed.error.flatten() });
    const count = await bulkActionService.bulkSetUserStatus(parsed.data.userIds, parsed.data.status);
    res.json({ count });
});
router.post("/assign-cohort", async (req, res) => {
    const parsed = zod_1.z.object({ userIds: zod_1.z.array(zod_1.z.string()).min(1), cohortId: zod_1.z.string() }).safeParse(req.body);
    if (!parsed.success)
        return res.status(400).json({ error: parsed.error.flatten() });
    const count = await bulkActionService.bulkAssignCohort(parsed.data.userIds, parsed.data.cohortId);
    res.json({ count });
});
router.post("/award-xp", async (req, res) => {
    const parsed = zod_1.z.object({ userIds: zod_1.z.array(zod_1.z.string()).min(1), xpAmount: zod_1.z.number().int() }).safeParse(req.body);
    if (!parsed.success)
        return res.status(400).json({ error: parsed.error.flatten() });
    const count = await bulkActionService.bulkAwardXp(parsed.data.userIds, parsed.data.xpAmount);
    res.json({ count });
});
router.post("/award-badge", async (req, res) => {
    const parsed = zod_1.z.object({ userIds: zod_1.z.array(zod_1.z.string()).min(1), badgeId: zod_1.z.string() }).safeParse(req.body);
    if (!parsed.success)
        return res.status(400).json({ error: parsed.error.flatten() });
    const count = await bulkActionService.bulkAwardBadge(parsed.data.userIds, parsed.data.badgeId);
    res.json({ count });
});
router.post("/archive-courses", async (req, res) => {
    const parsed = zod_1.z.object({ courseIds: zod_1.z.array(zod_1.z.string()).min(1) }).safeParse(req.body);
    if (!parsed.success)
        return res.status(400).json({ error: parsed.error.flatten() });
    const count = await bulkActionService.bulkArchiveCourses(parsed.data.courseIds);
    res.json({ count });
});
router.get("/export-users", async (req, res) => {
    const userIds = typeof req.query.userIds === "string" ? req.query.userIds.split(",") : undefined;
    const users = await bulkActionService.getUsersForExport(userIds);
    res.setHeader("Content-Type", "text/csv");
    res.setHeader("Content-Disposition", 'attachment; filename="users.csv"');
    res.send((0, csv_1.toCsv)(users));
});
exports.default = router;
