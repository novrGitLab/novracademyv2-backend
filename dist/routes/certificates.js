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
const certificateService = __importStar(require("../services/certificateService"));
const router = (0, express_1.Router)();
// GET /certificates/:certUid — public verification page data. No auth:
// certificates are meant to be shareable and independently verifiable.
router.get("/:certUid", async (req, res) => {
    const certificate = await certificateService.getCertificateByUid(req.params.certUid);
    res.json({
        certUid: certificate.certUid,
        learnerName: certificate.user.name ?? certificate.user.email,
        courseTitle: certificate.course?.title ?? null,
        issuedAt: certificate.issuedAt,
        isLegacy: certificate.isLegacy,
    });
});
// GET /certificates/:certUid/pdf — public, redirects to a short-lived
// signed R2 URL so a plain link/button can trigger the PDF to open.
router.get("/:certUid/pdf", async (req, res) => {
    const certificate = await certificateService.getCertificateByUid(req.params.certUid);
    if (!certificate.pdfUrl) {
        return res.status(404).json({
            error: "Certificate PDF is still being generated",
        });
    }
    const downloadUrl = await certificateService.getCertificateDownloadUrl(certificate.pdfUrl);
    if (!downloadUrl) {
        return res.status(404).json({
            error: "Certificate download URL could not be generated",
        });
    }
    return res.redirect(302, downloadUrl);
});
exports.default = router;
