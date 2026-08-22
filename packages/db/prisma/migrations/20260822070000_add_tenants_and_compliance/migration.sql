-- Adds multi-tenancy (Tenant model + tenantId on User/Course/Cohort/
-- Enrollment/Campaign) and compliance-policy tracking (CompliancePolicy).
--
-- Generated offline via:
--   npx prisma migrate diff --from-schema-datamodel <previous schema.prisma> \
--     --to-schema-datamodel packages/db/prisma/schema.prisma --script
-- (no live DB connection was available in this environment to run
-- `prisma migrate dev` directly — DATABASE_URL/DIRECT_URL are unset here).
--
-- To apply:
--   1. Normal path once DB creds are available:
--        npx prisma migrate deploy --schema=packages/db/prisma/schema.prisma
--      (or `db:migrate` from package.json in dev).
--   2. If port 5432 (the direct/migrations connection) is blocked, e.g. from
--      this network: paste this file's contents into the Supabase SQL
--      Editor and run it, then tell Prisma it's already applied so future
--      `migrate deploy` runs don't try to reapply it:
--        npx prisma migrate resolve --applied 20260822070000_add_tenants_and_compliance \
--          --schema=packages/db/prisma/schema.prisma
--
-- All new columns are nullable (tenantId) or defaulted (Tenant.plan/
-- isActive), so this is safe to run against a database with existing rows —
-- nothing here backfills or reassigns existing data to a tenant.

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "tenantId" TEXT;

-- AlterTable
ALTER TABLE "Course" ADD COLUMN     "tenantId" TEXT;

-- AlterTable
ALTER TABLE "Enrollment" ADD COLUMN     "tenantId" TEXT;

-- AlterTable
ALTER TABLE "Cohort" ADD COLUMN     "tenantId" TEXT;

-- AlterTable
ALTER TABLE "Campaign" ADD COLUMN     "tenantId" TEXT;

-- CreateTable
CREATE TABLE "Tenant" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "plan" TEXT NOT NULL DEFAULT 'Starter',
    "logoUrl" TEXT,
    "primaryColor" TEXT,
    "secondaryColor" TEXT,
    "accentColor" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Tenant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CompliancePolicy" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "courseId" TEXT NOT NULL,
    "roleName" TEXT NOT NULL,
    "deadline" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CompliancePolicy_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Tenant_slug_key" ON "Tenant"("slug");

-- CreateIndex
CREATE INDEX "Tenant_slug_idx" ON "Tenant"("slug");

-- CreateIndex
CREATE INDEX "CompliancePolicy_tenantId_idx" ON "CompliancePolicy"("tenantId");

-- CreateIndex
CREATE INDEX "CompliancePolicy_courseId_idx" ON "CompliancePolicy"("courseId");

-- CreateIndex
CREATE INDEX "User_tenantId_idx" ON "User"("tenantId");

-- CreateIndex
CREATE INDEX "Course_tenantId_idx" ON "Course"("tenantId");

-- CreateIndex
CREATE INDEX "Enrollment_tenantId_idx" ON "Enrollment"("tenantId");

-- CreateIndex
CREATE INDEX "Cohort_tenantId_idx" ON "Cohort"("tenantId");

-- CreateIndex
CREATE INDEX "Campaign_tenantId_idx" ON "Campaign"("tenantId");

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Course" ADD CONSTRAINT "Course_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Enrollment" ADD CONSTRAINT "Enrollment_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Cohort" ADD CONSTRAINT "Cohort_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Campaign" ADD CONSTRAINT "Campaign_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CompliancePolicy" ADD CONSTRAINT "CompliancePolicy_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CompliancePolicy" ADD CONSTRAINT "CompliancePolicy_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "Course"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

