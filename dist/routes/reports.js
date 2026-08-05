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
const csv_1 = require("../lib/csv");
const auth_1 = require("../middleware/auth");
const reportService = __importStar(require("../services/reportService"));
const router = (0, express_1.Router)();
router.use(auth_1.authenticate, (0, auth_1.requireRole)(...types_1.ADMIN_ROLES));
function sendCsv(res, filename, rows) {
    res.setHeader("Content-Type", "text/csv");
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    res.send((0, csv_1.toCsv)(rows));
}
router.get("/quiz-results", async (_req, res) => {
    sendCsv(res, "quiz-results.csv", await reportService.getQuizResultsReport());
});
router.get("/course-completion", async (_req, res) => {
    sendCsv(res, "course-completion.csv", await reportService.getCourseCompletionReport());
});
router.get("/enrollments", async (_req, res) => {
    sendCsv(res, "enrollments.csv", await reportService.getEnrollmentReport());
});
router.get("/time-spent", async (_req, res) => {
    sendCsv(res, "time-spent.csv", await reportService.getTimeSpentReport());
});
router.get("/learner-progress", async (req, res) => {
    const userId = String(req.query.userId ?? "");
    if (!userId)
        return res.status(400).json({ error: "userId query param is required" });
    sendCsv(res, "learner-progress.csv", await reportService.getLearnerProgressReport(userId));
});
router.get("/revenue", async (_req, res) => {
    sendCsv(res, "revenue.csv", await reportService.getRevenueReport());
});
router.get("/community-engagement", async (_req, res) => {
    sendCsv(res, "community-engagement.csv", await reportService.getCommunityEngagementReport());
});
exports.default = router;
