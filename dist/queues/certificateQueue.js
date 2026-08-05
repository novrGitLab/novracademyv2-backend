"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.certificateQueue = void 0;
exports.enqueueCertificateGeneration = enqueueCertificateGeneration;
exports.enqueueLegacyCertificateGeneration = enqueueLegacyCertificateGeneration;
const bullmq_1 = require("bullmq");
const connection_1 = require("./connection");
// Left untyped on the Queue generic — pinning it fights BullMQ's job-name
// type inference across versions. Data is typed at the call sites instead.
exports.certificateQueue = connection_1.redisConnectionOptions
    ? new bullmq_1.Queue("certificates", { connection: connection_1.redisConnectionOptions })
    : null;
exports.certificateQueue?.on("error", (err) => {
    console.error("Certificate queue error (background jobs unavailable until Redis is reachable):", err.message);
});
/**
 * Enqueues certificate generation rather than running it inline — PDF
 * rendering + an R2 upload shouldn't block the learner's request (a video
 * heartbeat, a PDF "mark as read", or a quiz submission). Failures here
 * are logged, not thrown: a missed certificate shouldn't fail the action
 * that completed the course.
 */
async function enqueueCertificateGeneration(enrollmentId) {
    await enqueue({ type: "enrollment", enrollmentId });
}
/** Legacy certs are pre-generated eagerly at CSV import time, before anyone has claimed the record. */
async function enqueueLegacyCertificateGeneration(alumniRecordId) {
    await enqueue({ type: "legacy", alumniRecordId });
}
async function enqueue(data) {
    if (!exports.certificateQueue) {
        console.warn(`Skipping certificate job "${data.type}" — REDIS_URL is not configured.`);
        return;
    }
    try {
        await exports.certificateQueue.add(data.type, data, { attempts: 3, backoff: { type: "exponential", delay: 5000 } });
    }
    catch (err) {
        console.error("Failed to enqueue certificate job", data.type, err);
    }
}
