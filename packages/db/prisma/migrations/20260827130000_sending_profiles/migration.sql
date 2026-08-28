-- AlterTable
ALTER TABLE "Campaign" ADD COLUMN     "sendingProfileId" TEXT;

-- CreateTable
CREATE TABLE "SendingProfile" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT,
    "name" TEXT NOT NULL,
    "senderName" TEXT NOT NULL,
    "senderEmail" TEXT NOT NULL,
    "smtpHost" TEXT NOT NULL,
    "smtpPort" INTEGER NOT NULL DEFAULT 587,
    "smtpUsername" TEXT,
    "smtpPassword" TEXT,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SendingProfile_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SendingProfile_organizationId_idx" ON "SendingProfile"("organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "SendingProfile_organizationId_name_key" ON "SendingProfile"("organizationId", "name");

-- CreateIndex
CREATE INDEX "Campaign_sendingProfileId_idx" ON "Campaign"("sendingProfileId");

-- AddForeignKey
ALTER TABLE "Campaign" ADD CONSTRAINT "Campaign_sendingProfileId_fkey" FOREIGN KEY ("sendingProfileId") REFERENCES "SendingProfile"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SendingProfile" ADD CONSTRAINT "SendingProfile_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SendingProfile" ADD CONSTRAINT "SendingProfile_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
