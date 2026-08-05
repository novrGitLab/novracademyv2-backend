import { Router } from "express";
import * as certificateService from "../services/certificateService";

const router = Router();

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

  const downloadUrl = await certificateService.getCertificateDownloadUrl(
    certificate.pdfUrl
  );

  if (!downloadUrl) {
    return res.status(404).json({
      error: "Certificate download URL could not be generated",
    });
  }

  return res.redirect(302, downloadUrl);
});

export default router;
