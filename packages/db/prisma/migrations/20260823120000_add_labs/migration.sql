-- CreateTable: Lab
CREATE TABLE "Lab" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT,
    "labTemplateId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "points" INTEGER NOT NULL DEFAULT 50,
    "flag" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Lab_pkey" PRIMARY KEY ("id")
);

-- CreateTable: LabSession
CREATE TABLE "LabSession" (
    "id" TEXT NOT NULL,
    "labId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "agentSessionId" TEXT NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endedAt" TIMESTAMP(3),
    "status" TEXT NOT NULL DEFAULT 'active',

    CONSTRAINT "LabSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable: LabSolve
CREATE TABLE "LabSolve" (
    "id" TEXT NOT NULL,
    "labId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "labSessionId" TEXT,
    "solvedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LabSolve_pkey" PRIMARY KEY ("id")
);

-- CreateIndex: Lab
CREATE INDEX "Lab_organizationId_idx" ON "Lab"("organizationId");
CREATE INDEX "Lab_category_idx" ON "Lab"("category");

-- CreateIndex: LabSession
CREATE INDEX "LabSession_labId_idx" ON "LabSession"("labId");
CREATE INDEX "LabSession_userId_idx" ON "LabSession"("userId");
CREATE INDEX "LabSession_status_idx" ON "LabSession"("status");

-- CreateIndex: LabSolve
CREATE UNIQUE INDEX "LabSolve_labId_userId_key" ON "LabSolve"("labId", "userId");
CREATE INDEX "LabSolve_userId_idx" ON "LabSolve"("userId");
CREATE INDEX "LabSolve_labId_idx" ON "LabSolve"("labId");

-- AddForeignKey: Lab -> Organization
ALTER TABLE "Lab" ADD CONSTRAINT "Lab_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey: LabSession -> Lab
ALTER TABLE "LabSession" ADD CONSTRAINT "LabSession_labId_fkey" FOREIGN KEY ("labId") REFERENCES "Lab"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey: LabSession -> User
ALTER TABLE "LabSession" ADD CONSTRAINT "LabSession_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey: LabSolve -> Lab
ALTER TABLE "LabSolve" ADD CONSTRAINT "LabSolve_labId_fkey" FOREIGN KEY ("labId") REFERENCES "Lab"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey: LabSolve -> User
ALTER TABLE "LabSolve" ADD CONSTRAINT "LabSolve_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey: LabSolve -> LabSession
ALTER TABLE "LabSolve" ADD CONSTRAINT "LabSolve_labSessionId_fkey" FOREIGN KEY ("labSessionId") REFERENCES "LabSession"("id") ON DELETE SET NULL ON UPDATE CASCADE;
