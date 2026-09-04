import { enqueueJob } from "../services/jobQueue";

/**
 * Certificate enqueuers — persist a job row to the Postgres-backed queue and
 * return immediately. The worker loop performs the PDF generation + R2 upload
 * asynchronously, so course-completion requests aren't blocked by it, and the
 * job survives restarts (it stays pending until delivered/failed).
 */

export function enqueueCertificateGeneration(enrollmentId: string) {
  return enqueueJob("certificate.generate", { id: enrollmentId });
}

export function enqueueLegacyCertificateGeneration(alumniRecordId: string) {
  return enqueueJob("certificate.generate-legacy", { id: alumniRecordId });
}
