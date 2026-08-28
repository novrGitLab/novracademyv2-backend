-- CreateEnum
CREATE TYPE "ItfClaimStatus" AS ENUM ('DRAFT', 'SUBMITTED', 'APPROVED', 'REJECTED');

-- CreateTable
CREATE TABLE "ItfClaim" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT,
    "trainingYear" INTEGER NOT NULL,
    "status" "ItfClaimStatus" NOT NULL DEFAULT 'DRAFT',
    "estimatedAmountNgn" INTEGER NOT NULL,
    "totalTrainingCostNgn" INTEGER NOT NULL,
    "totalTrainees" INTEGER NOT NULL,
    "totalHours" DOUBLE PRECISION NOT NULL,
    "itfReference" TEXT,
    "submittedAt" TIMESTAMP(3),
    "submittedById" TEXT,
    "submissionNotes" TEXT,
    "approvedAmountNgn" INTEGER,
    "approvedAt" TIMESTAMP(3),
    "approvedById" TEXT,
    "approvalNotes" TEXT,
    "rejectedAt" TIMESTAMP(3),
    "rejectedById" TEXT,
    "rejectionReason" TEXT,
    "itfExportId" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ItfClaim_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ItfClaim_organizationId_trainingYear_idx" ON "ItfClaim"("organizationId", "trainingYear");

-- CreateIndex
CREATE INDEX "ItfClaim_status_idx" ON "ItfClaim"("status");

-- CreateIndex
CREATE INDEX "ItfClaim_trainingYear_idx" ON "ItfClaim"("trainingYear");

-- AddForeignKey
ALTER TABLE "ItfClaim" ADD CONSTRAINT "ItfClaim_itfExportId_fkey" FOREIGN KEY ("itfExportId") REFERENCES "ItfExport"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ItfClaim" ADD CONSTRAINT "ItfClaim_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ItfClaim" ADD CONSTRAINT "ItfClaim_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ItfClaim" ADD CONSTRAINT "ItfClaim_submittedById_fkey" FOREIGN KEY ("submittedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ItfClaim" ADD CONSTRAINT "ItfClaim_approvedById_fkey" FOREIGN KEY ("approvedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ItfClaim" ADD CONSTRAINT "ItfClaim_rejectedById_fkey" FOREIGN KEY ("rejectedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
