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
const jobService = __importStar(require("../services/jobService"));
const router = (0, express_1.Router)();
router.use(auth_1.authenticate);
router.get("/", async (req, res) => {
    const parsed = zod_1.z.object({ status: zod_1.z.nativeEnum(types_1.JobListingStatus).optional() }).safeParse(req.query);
    if (!parsed.success) {
        return res.status(400).json({ error: parsed.error.flatten() });
    }
    const isAdmin = types_1.ADMIN_ROLES.includes(req.user.role);
    const listings = await jobService.listListings({
        status: isAdmin ? parsed.data.status : undefined,
        viewerRole: req.user.role,
    });
    res.json({ listings });
});
const createListingSchema = zod_1.z.object({
    title: zod_1.z.string().min(1),
    company: zod_1.z.string().min(1),
    locationType: zod_1.z.nativeEnum(types_1.JobLocationType),
    location: zod_1.z.string().optional(),
    link: zod_1.z.string().url().optional(),
    description: zod_1.z.string().optional(),
    expiresAt: zod_1.z.coerce.date().optional(),
});
router.post("/", async (req, res) => {
    const parsed = createListingSchema.safeParse(req.body);
    if (!parsed.success) {
        return res.status(400).json({ error: parsed.error.flatten() });
    }
    const listing = await jobService.createListing({ ...parsed.data, postedById: req.user.id });
    res.status(201).json(listing);
});
router.patch("/:id/status", (0, auth_1.requireRole)(...types_1.ADMIN_ROLES), async (req, res) => {
    const parsed = zod_1.z.object({ status: zod_1.z.nativeEnum(types_1.JobListingStatus) }).safeParse(req.body);
    if (!parsed.success) {
        return res.status(400).json({ error: parsed.error.flatten() });
    }
    const listing = await jobService.updateListingStatus(req.params.id, parsed.data.status);
    res.json(listing);
});
router.patch("/:id/featured", (0, auth_1.requireRole)(...types_1.ADMIN_ROLES), async (req, res) => {
    const parsed = zod_1.z.object({ isFeatured: zod_1.z.boolean() }).safeParse(req.body);
    if (!parsed.success) {
        return res.status(400).json({ error: parsed.error.flatten() });
    }
    const listing = await jobService.toggleFeatured(req.params.id, parsed.data.isFeatured);
    res.json(listing);
});
router.delete("/:id", async (req, res) => {
    const isAdmin = types_1.ADMIN_ROLES.includes(req.user.role);
    await jobService.deleteListing(req.params.id, req.user.id, isAdmin);
    res.status(204).send();
});
exports.default = router;
