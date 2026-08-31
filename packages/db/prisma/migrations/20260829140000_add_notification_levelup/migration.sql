-- Add missing NotificationType enum values for gamification notifications.
-- BADGE_AWARDED and LEVEL_UP exist in schema.prisma and packages/types but were
-- never applied to the database (the initial migration only had the 9 original
-- values). Prisma requires these to be added in separate statements — ALTER TYPE
-- does not allow adding multiple values in one statement.
ALTER TYPE "NotificationType" ADD VALUE 'BADGE_AWARDED';
ALTER TYPE "NotificationType" ADD VALUE 'LEVEL_UP';
