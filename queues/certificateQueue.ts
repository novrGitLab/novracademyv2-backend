import { Queue } from "bullmq";
import { redisConnectionOptions } from "./connection";

export type CertificateJobData =
  | { type: "enrollment"; enrollmentId: string }
  | { type: "legacy"; alumniRecordId: string };

// Left untyped on the Queue generic — pinning it fights BullMQ's job-name
// type inference across versions. Data is typed at the call sites instead.
export const certificateQueue = redisConnectionOptions
  ? new Queue("certificates", { connection: redisConnectionOptions })
  : null;

certificateQueue?.on("error", (err) => {
  console.error("Certificate queue error (background jobs unavailable until Redis is reachable):", err.message);
});

/**
 * Enqueues certificate generation rather than running it inline — PDF
 * rendering + an R2 upload shouldn't block the learner's request (a video
 * heartbeat, a PDF "mark as read", or a quiz submission). Failures here
 * are logged, not thrown: a missed certificate shouldn't fail the action
 * that completed the course.
 */
export async function enqueueCertificateGeneration(enrollmentId: string) {
  await enqueue({ type: "enrollment", enrollmentId });
}

/** Legacy certs are pre-generated eagerly at CSV import time, before anyone has claimed the record. */
export async function enqueueLegacyCertificateGeneration(alumniRecordId: string) {
  await enqueue({ type: "legacy", alumniRecordId });
}

async function enqueue(data: CertificateJobData) {
  if (!certificateQueue) {
    console.warn(`Skipping certificate job "${data.type}" — REDIS_URL is not configured.`);
    return;
  }
  try {
    await certificateQueue.add(data.type, data, { attempts: 3, backoff: { type: "exponential", delay: 5000 } });
  } catch (err) {
    console.error("Failed to enqueue certificate job", data.type, err);
  }
}
