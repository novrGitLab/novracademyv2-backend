-- AlterTable
ALTER TABLE "CampaignResult" ADD COLUMN     "userId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Campaign_gophishCampaignId_key" ON "Campaign"("gophishCampaignId");

-- CreateIndex
CREATE INDEX "CampaignResult_userId_idx" ON "CampaignResult"("userId");

-- AddForeignKey
ALTER TABLE "CampaignResult" ADD CONSTRAINT "CampaignResult_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

