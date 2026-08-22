-- AlterTable: Add per-org phishing sender config
ALTER TABLE "Organization" ADD COLUMN "senderName" TEXT;
ALTER TABLE "Organization" ADD COLUMN "senderEmail" TEXT;
