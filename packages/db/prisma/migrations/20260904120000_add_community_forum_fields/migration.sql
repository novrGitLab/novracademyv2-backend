-- Phase A: forum support on CommunityPost.
ALTER TABLE "CommunityPost" ADD COLUMN IF NOT EXISTS "title" TEXT;
ALTER TABLE "CommunityPost" ADD COLUMN IF NOT EXISTS "category" TEXT;
ALTER TABLE "CommunityPost" ADD COLUMN IF NOT EXISTS "tags" TEXT[] NOT NULL DEFAULT '{}';
ALTER TABLE "CommunityPost" ADD COLUMN IF NOT EXISTS "viewCount" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "CommunityPost" ADD COLUMN IF NOT EXISTS "isPinned" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "CommunityPost" ADD COLUMN IF NOT EXISTS "lastActivityAt" TIMESTAMP(3);

-- Backfill existing rows so the new column isn't left null.
UPDATE "CommunityPost" SET "lastActivityAt" = "createdAt" WHERE "lastActivityAt" IS NULL;

CREATE INDEX IF NOT EXISTS "CommunityPost_category_createdAt_idx" ON "CommunityPost"("category", "createdAt");
CREATE INDEX IF NOT EXISTS "CommunityPost_isPinned_lastActivityAt_idx" ON "CommunityPost"("isPinned", "lastActivityAt");
