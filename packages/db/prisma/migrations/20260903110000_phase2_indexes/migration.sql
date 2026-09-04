-- Phase 2 index batch (performance audit P1/P2 items):
-- 1. Enrollment(courseId) — course-scoped enrollment queries (analytics,
--    admin "view enrollments") couldn't use the (userId, courseId) index.
-- 2. Payment(status, createdAt) — admin payment dashboards filter by status
--    then sort by date; Payment(courseId) — revenue-by-course analytics.
-- 3. Notification(userId, createdAt) — "recent notifications" feed sorts by
--    createdAt within a user; Notification(createdAt) — admin history.
-- 4. Message(threadId, createdAt) — per-thread message list ordered by time.
-- 5. CommunityPost(visibility, groupId, createdAt) — the main feed query
--    (network posts / group posts, newest first) was a seq scan + sort.

CREATE INDEX IF NOT EXISTS "Enrollment_courseId_idx" ON "Enrollment"("courseId");

CREATE INDEX IF NOT EXISTS "Payment_status_createdAt_idx" ON "Payment"("status", "createdAt");
CREATE INDEX IF NOT EXISTS "Payment_courseId_idx" ON "Payment"("courseId");

CREATE INDEX IF NOT EXISTS "Notification_userId_createdAt_idx" ON "Notification"("userId", "createdAt");
CREATE INDEX IF NOT EXISTS "Notification_createdAt_idx" ON "Notification"("createdAt");

CREATE INDEX IF NOT EXISTS "Message_threadId_createdAt_idx" ON "Message"("threadId", "createdAt");

CREATE INDEX IF NOT EXISTS "CommunityPost_visibility_groupId_createdAt_idx"
  ON "CommunityPost"("visibility", "groupId", "createdAt");
