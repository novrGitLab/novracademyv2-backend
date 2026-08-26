-- AlterTable: Add ITF compliance profile fields to Organization
ALTER TABLE "Organization" ADD COLUMN "itfRcNumber" TEXT;
ALTER TABLE "Organization" ADD COLUMN "itfRegistrationNumber" TEXT;
ALTER TABLE "Organization" ADD COLUMN "itfIndustrySector" TEXT;
ALTER TABLE "Organization" ADD COLUMN "itfAnnualPayrollBand" TEXT;
ALTER TABLE "Organization" ADD COLUMN "itfEmployeeHeadcount" INTEGER;
ALTER TABLE "Organization" ADD COLUMN "itfContactPhone" TEXT;
ALTER TABLE "Organization" ADD COLUMN "itfContactEmail" TEXT;
ALTER TABLE "Organization" ADD COLUMN "itfContactAddress" TEXT;

-- AlterTable: Add ITF eligibility fields to Course
ALTER TABLE "Course" ADD COLUMN "isItfEligible" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Course" ADD COLUMN "itfDeliveryMode" TEXT;
ALTER TABLE "Course" ADD COLUMN "itfContactHours" DOUBLE PRECISION;
ALTER TABLE "Course" ADD COLUMN "itfFacilitator" TEXT;

-- AlterTable: Add attendance/proof-of-completion evidence fields to Enrollment
ALTER TABLE "Enrollment" ADD COLUMN "attendanceFirstAt" TIMESTAMP(3);
ALTER TABLE "Enrollment" ADD COLUMN "attendanceLastAt" TIMESTAMP(3);
ALTER TABLE "Enrollment" ADD COLUMN "attendanceMinutes" INTEGER DEFAULT 0;
ALTER TABLE "Enrollment" ADD COLUMN "quizPassed" BOOLEAN;
ALTER TABLE "Enrollment" ADD COLUMN "labCompleted" BOOLEAN;
ALTER TABLE "Enrollment" ADD COLUMN "itfLocked" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable: ItfExport (audit log)
CREATE TABLE "ItfExport" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT,
    "generatedById" TEXT NOT NULL,
    "trainingYear" INTEGER NOT NULL,
    "rowCount" INTEGER NOT NULL,
    "totalHours" DOUBLE PRECISION NOT NULL,
    "totalCostNgn" INTEGER NOT NULL,
    "format" TEXT NOT NULL DEFAULT 'xlsx',
    "notes" TEXT,
    "generatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ItfExport_pkey" PRIMARY KEY ("id")
);

-- CreateIndex: ItfExport
CREATE INDEX "ItfExport_organizationId_idx" ON "ItfExport"("organizationId");
CREATE INDEX "ItfExport_generatedById_idx" ON "ItfExport"("generatedById");
CREATE INDEX "ItfExport_trainingYear_idx" ON "ItfExport"("trainingYear");
CREATE INDEX "ItfExport_generatedAt_idx" ON "ItfExport"("generatedAt");

-- AddForeignKey: ItfExport -> Organization
ALTER TABLE "ItfExport" ADD CONSTRAINT "ItfExport_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey: ItfExport -> User
ALTER TABLE "ItfExport" ADD CONSTRAINT "ItfExport_generatedById_fkey" FOREIGN KEY ("generatedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
