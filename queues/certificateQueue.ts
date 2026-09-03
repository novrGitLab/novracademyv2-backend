import * as alumniService from "../services/alumniService";
import * as certificateService from "../services/certificateService";

/**
 * Runs a certificate-generation job off the request path (course completion
 * fires this from the heartbeat). PDF rendering + R2 upload can take
 * seconds; deferring keeps the learner's request snappy. Errors are logged,
 * never thrown to the caller.
 */
function deferCertificate(jobName: string, run: () => Promise<unknown>): void {
  setImmediate(() => {
    run().catch((err) => {
      console.error(`[queue:${jobName}] job failed:`, err instanceof Error ? err.message : err);
    });
  });
}

export function enqueueCertificateGeneration(enrollmentId: string) {
  deferCertificate("certificate-generation", () =>
    certificateService.issueCertificateForEnrollment(enrollmentId)
  );
}

export function enqueueLegacyCertificateGeneration(alumniRecordId: string) {
  deferCertificate("legacy-certificate-generation", () =>
    alumniService.generateLegacyCertificatePdf(alumniRecordId)
  );
}
