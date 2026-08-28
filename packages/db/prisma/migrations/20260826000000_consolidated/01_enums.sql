-- Section 1 of 4: enums only. Paste this whole file into the Supabase SQL
-- Editor and Run, then move on to 02_tables.sql.

-- CreateEnum
DO $enum$ BEGIN
    CREATE TYPE "UserRole" AS ENUM ('SUPER_ADMIN', 'ORG_ADMIN', 'INSTITUTION_ADMIN', 'MANAGER', 'LEARNER', 'LEGACY_ALUMNI', 'COMMUNITY_ONLY');
EXCEPTION
    WHEN duplicate_object THEN null;
END $enum$;

-- CreateEnum
DO $enum$ BEGIN
    CREATE TYPE "MemberType" AS ENUM ('LEGACY_ALUMNI', 'NEW_LEARNER', 'COMMUNITY_ONLY');
EXCEPTION
    WHEN duplicate_object THEN null;
END $enum$;

-- CreateEnum
DO $enum$ BEGIN
    CREATE TYPE "UserStatus" AS ENUM ('ACTIVE', 'SUSPENDED', 'PENDING');
EXCEPTION
    WHEN duplicate_object THEN null;
END $enum$;

-- CreateEnum
DO $enum$ BEGIN
    CREATE TYPE "ReputationLevel" AS ENUM ('NEWCOMER', 'MEMBER', 'CONTRIBUTOR', 'MENTOR', 'LEGEND');
EXCEPTION
    WHEN duplicate_object THEN null;
END $enum$;

-- CreateEnum
DO $enum$ BEGIN
    CREATE TYPE "CourseStatus" AS ENUM ('DRAFT', 'PUBLISHED', 'ARCHIVED');
EXCEPTION
    WHEN duplicate_object THEN null;
END $enum$;

-- CreateEnum
DO $enum$ BEGIN
    CREATE TYPE "LessonType" AS ENUM ('VIDEO', 'PDF', 'QUIZ', 'LIVE');
EXCEPTION
    WHEN duplicate_object THEN null;
END $enum$;

-- CreateEnum
DO $enum$ BEGIN
    CREATE TYPE "QuestionType" AS ENUM ('MULTIPLE_CHOICE', 'TRUE_FALSE', 'SHORT_ANSWER');
EXCEPTION
    WHEN duplicate_object THEN null;
END $enum$;

-- CreateEnum
DO $enum$ BEGIN
    CREATE TYPE "VideoStatus" AS ENUM ('PREPARING', 'READY', 'ERRORED');
EXCEPTION
    WHEN duplicate_object THEN null;
END $enum$;

-- CreateEnum
DO $enum$ BEGIN
    CREATE TYPE "EnrollmentSource" AS ENUM ('SELF_PAID', 'ADMIN_ASSIGNED', 'BULK', 'COHORT', 'CODE');
EXCEPTION
    WHEN duplicate_object THEN null;
END $enum$;

-- CreateEnum
DO $enum$ BEGIN
    CREATE TYPE "EnrollmentStatus" AS ENUM ('ACTIVE', 'EXPIRED', 'PENDING', 'CANCELLED');
EXCEPTION
    WHEN duplicate_object THEN null;
END $enum$;

-- CreateEnum
DO $enum$ BEGIN
    CREATE TYPE "PaymentProvider" AS ENUM ('STRIPE', 'PAYSTACK');
EXCEPTION
    WHEN duplicate_object THEN null;
END $enum$;

-- CreateEnum
DO $enum$ BEGIN
    CREATE TYPE "PaymentStatus" AS ENUM ('PENDING', 'SUCCEEDED', 'FAILED', 'REFUNDED');
EXCEPTION
    WHEN duplicate_object THEN null;
END $enum$;

-- CreateEnum
DO $enum$ BEGIN
    CREATE TYPE "GroupType" AS ENUM ('GENERAL', 'COHORT', 'INTEREST', 'COURSE');
EXCEPTION
    WHEN duplicate_object THEN null;
END $enum$;

-- CreateEnum
DO $enum$ BEGIN
    CREATE TYPE "PostVisibility" AS ENUM ('NETWORK', 'GROUP', 'COHORT');
EXCEPTION
    WHEN duplicate_object THEN null;
END $enum$;

-- CreateEnum
DO $enum$ BEGIN
    CREATE TYPE "ReactionType" AS ENUM ('LIKE', 'CELEBRATE', 'INSIGHTFUL');
EXCEPTION
    WHEN duplicate_object THEN null;
END $enum$;

-- CreateEnum
DO $enum$ BEGIN
    CREATE TYPE "EventVisibility" AS ENUM ('ALL_MEMBERS', 'ENROLLED_ONLY');
EXCEPTION
    WHEN duplicate_object THEN null;
END $enum$;

-- CreateEnum
DO $enum$ BEGIN
    CREATE TYPE "EventRsvpStatus" AS ENUM ('GOING', 'WAITLIST', 'CANCELLED');
EXCEPTION
    WHEN duplicate_object THEN null;
END $enum$;

-- CreateEnum
DO $enum$ BEGIN
    CREATE TYPE "MentorSessionStatus" AS ENUM ('REQUESTED', 'ACCEPTED', 'DECLINED', 'COMPLETED', 'CANCELLED');
EXCEPTION
    WHEN duplicate_object THEN null;
END $enum$;

-- CreateEnum
DO $enum$ BEGIN
    CREATE TYPE "JobLocationType" AS ENUM ('REMOTE', 'ONSITE', 'HYBRID');
EXCEPTION
    WHEN duplicate_object THEN null;
END $enum$;

-- CreateEnum
DO $enum$ BEGIN
    CREATE TYPE "JobListingStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'EXPIRED');
EXCEPTION
    WHEN duplicate_object THEN null;
END $enum$;

-- CreateEnum
DO $enum$ BEGIN
    CREATE TYPE "BadgeTriggerType" AS ENUM ('COURSE_SPECIFIC', 'PLATFORM_MILESTONE', 'MANUAL');
EXCEPTION
    WHEN duplicate_object THEN null;
END $enum$;

-- CreateEnum
DO $enum$ BEGIN
    CREATE TYPE "NotificationType" AS ENUM ('ENROLLMENT_CONFIRMATION', 'LESSON_REMINDER', 'ENROLLMENT_EXPIRY_WARNING', 'QUIZ_RESULT', 'CERTIFICATE_ISSUED', 'COMMUNITY_MENTION', 'DM_RECEIVED', 'EVENT_REMINDER', 'GENERAL');
EXCEPTION
    WHEN duplicate_object THEN null;
END $enum$;

-- CreateEnum
DO $enum$ BEGIN
    CREATE TYPE "NewsletterSource" AS ENUM ('WEBSITE', 'IMPORT', 'MANUAL');
EXCEPTION
    WHEN duplicate_object THEN null;
END $enum$;

-- CreateEnum
DO $enum$ BEGIN
    CREATE TYPE "NewsletterStatus" AS ENUM ('ACTIVE', 'UNSUBSCRIBED');
EXCEPTION
    WHEN duplicate_object THEN null;
END $enum$;

-- CreateEnum
DO $enum$ BEGIN
    CREATE TYPE "MarketingCampaignStatus" AS ENUM ('DRAFT', 'SCHEDULED', 'SENT');
EXCEPTION
    WHEN duplicate_object THEN null;
END $enum$;

-- CreateEnum
DO $enum$ BEGIN
    CREATE TYPE "AssessmentType" AS ENUM ('BASELINE', 'MONTHLY', 'CLOSING');
EXCEPTION
    WHEN duplicate_object THEN null;
END $enum$;

-- CreateEnum
DO $enum$ BEGIN
    CREATE TYPE "AssessmentScope" AS ENUM ('UNIVERSAL', 'ORGANIZATION');
EXCEPTION
    WHEN duplicate_object THEN null;
END $enum$;

-- CreateEnum
DO $enum$ BEGIN
    CREATE TYPE "DiscountType" AS ENUM ('FREE', 'PERCENTAGE', 'FIXED_AMOUNT');
EXCEPTION
    WHEN duplicate_object THEN null;
END $enum$;

