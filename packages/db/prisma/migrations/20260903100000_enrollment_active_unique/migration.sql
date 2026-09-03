-- Phase 2: enforce one ACTIVE enrollment per (user, course).
-- A partial unique index is race-proof against duplicate enrollments that
-- the app-level check-then-insert can miss under concurrency (bulk assigns,
-- double webhook delivery). Only ACTIVE rows are constrained so re-enrollment
-- after expiry/suspension remains possible.

CREATE UNIQUE INDEX "Enrollment_userId_courseId_active_key"
  ON "Enrollment"("userId", "courseId")
  WHERE "status" = 'ACTIVE';
