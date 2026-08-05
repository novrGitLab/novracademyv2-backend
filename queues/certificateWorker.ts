import { Worker } from "bullmq";
import * as alumniService from "../services/alumniService";
import * as certificateService from "../services/certificateService";
import { redisConnectionOptions } from "./connection";
import type { CertificateJobData } from "./certificateQueue";

/**
 * Runs in the same process as the API for this scaffold (simplest setup
 * without a real Redis/infra yet). In production this would typically be
 * split into its own worker process/dyno so PDF rendering can't compete
 * with request handling.
 */
async function processCertificateJob(job: { data: unknown }) {
  const data = job.data as CertificateJobData;
  if (data.type === "enrollment") {
    await certificateService.issueCertificateForEnrollment(data.enrollmentId);
  } else {
    await alumniService.generateLegacyCertificatePdf(data.alumniRecordId);
  }
}

export const certificateWorker = redisConnectionOptions
  ? new Worker("certificates", processCertificateJob, { connection: redisConnectionOptions })
  : null;

certificateWorker?.on("failed", (job, err) => {
  console.error(`Certificate job ${job?.id} failed:`, err.message);
});

certificateWorker?.on("error", (err) => {
  console.error("Certificate worker error (background jobs unavailable until Redis is reachable):", err.message);
});
