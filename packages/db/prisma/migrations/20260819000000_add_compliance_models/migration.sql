-- AlterTable: Add organizationId to Course, Cohort, and Campaign
ALTER TABLE "Course" ADD COLUMN "organizationId" TEXT;
ALTER TABLE "Cohort" ADD COLUMN "organizationId" TEXT;
ALTER TABLE "Campaign" ADD COLUMN "organizationId" TEXT;

-- CreateTable: ComplianceSetting
CREATE TABLE "ComplianceSetting" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "deadline" TIMESTAMP(3) NOT NULL,
    "threshold" INTEGER NOT NULL DEFAULT 80,
    "autoSuspend" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ComplianceSetting_pkey" PRIMARY KEY ("id")
);

-- CreateTable: ComplianceAssignment
CREATE TABLE "ComplianceAssignment" (
    "id" TEXT NOT NULL,
    "courseId" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ComplianceAssignment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex: ComplianceSetting
CREATE UNIQUE INDEX "ComplianceSetting_organizationId_key" ON "ComplianceSetting"("organizationId");

-- CreateIndex: ComplianceAssignment
CREATE UNIQUE INDEX "ComplianceAssignment_courseId_organizationId_key" ON "ComplianceAssignment"("courseId", "organizationId");
CREATE INDEX "ComplianceAssignment_organizationId_idx" ON "ComplianceAssignment"("organizationId");

-- CreateIndex: Course organizationId
CREATE INDEX "Course_organizationId_idx" ON "Course"("organizationId");

-- CreateIndex: Cohort organizationId
CREATE INDEX "Cohort_organizationId_idx" ON "Cohort"("organizationId");

-- CreateIndex: Campaign organizationId
CREATE INDEX "Campaign_organizationId_idx" ON "Campaign"("organizationId");

-- AddForeignKey: ComplianceSetting -> Organization
ALTER TABLE "ComplianceSetting" ADD CONSTRAINT "ComplianceSetting_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey: ComplianceAssignment -> Course
ALTER TABLE "ComplianceAssignment" ADD CONSTRAINT "ComplianceAssignment_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "Course"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey: ComplianceAssignment -> Organization
ALTER TABLE "ComplianceAssignment" ADD CONSTRAINT "ComplianceAssignment_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey: Course -> Organization
ALTER TABLE "Course" ADD CONSTRAINT "Course_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey: Cohort -> Organization
ALTER TABLE "Cohort" ADD CONSTRAINT "Cohort_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey: Campaign -> Organization
ALTER TABLE "Campaign" ADD CONSTRAINT "Campaign_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE SET NULL ON UPDATE CASCADE;
