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
const types_1 = require("@novr/types");
const auth_1 = require("../middleware/auth");
const analyticsService = __importStar(require("../services/analyticsService"));
const router = (0, express_1.Router)();
router.use(auth_1.authenticate, (0, auth_1.requireRole)(...types_1.ADMIN_ROLES));
router.get("/overview", async (_req, res) => {
    res.json(await analyticsService.getOverviewMetrics());
});
router.get("/lms/course-health", async (_req, res) => {
    res.json({ courses: await analyticsService.getCourseHealth() });
});
router.get("/lms/drop-off/:courseId", async (req, res) => {
    res.json({ lessons: await analyticsService.getDropOffAnalysis(req.params.courseId) });
});
router.get("/lms/cohort-performance", async (_req, res) => {
    res.json({ cohorts: await analyticsService.getCohortPerformance() });
});
router.get("/lms/enrollment-validity", async (_req, res) => {
    res.json(await analyticsService.getEnrollmentValidityDashboard());
});
router.get("/community", async (_req, res) => {
    res.json(await analyticsService.getCommunityAnalytics());
});
router.get("/revenue", async (_req, res) => {
    res.json(await analyticsService.getRevenueSummary());
});
exports.default = router;
