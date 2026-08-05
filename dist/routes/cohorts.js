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
const cohortService = __importStar(require("../services/cohortService"));
const router = (0, express_1.Router)();
router.use(auth_1.authenticate, (0, auth_1.requireRole)(...types_1.ADMIN_ROLES));
router.get("/", async (_req, res) => {
    const cohorts = await cohortService.listCohorts();
    res.json({ cohorts });
});
router.get("/:id", async (req, res) => {
    const cohort = await cohortService.getCohortById(req.params.id);
    if (!cohort)
        return res.status(404).json({ error: "Cohort not found" });
    res.json(cohort);
});
const createCohortSchema = zod_1.z.object({
    name: zod_1.z.string().min(1),
    year: zod_1.z.number().int().positive().optional(),
    description: zod_1.z.string().optional(),
});
router.post("/", async (req, res) => {
    const parsed = createCohortSchema.safeParse(req.body);
    if (!parsed.success) {
        return res.status(400).json({ error: parsed.error.flatten() });
    }
    const cohort = await cohortService.createCohort(parsed.data);
    res.status(201).json(cohort);
});
const updateCohortSchema = createCohortSchema.partial();
router.patch("/:id", async (req, res) => {
    const parsed = updateCohortSchema.safeParse(req.body);
    if (!parsed.success) {
        return res.status(400).json({ error: parsed.error.flatten() });
    }
    const cohort = await cohortService.updateCohort(req.params.id, parsed.data);
    res.json(cohort);
});
router.delete("/:id", async (req, res) => {
    await cohortService.deleteCohort(req.params.id);
    res.status(204).send();
});
exports.default = router;
