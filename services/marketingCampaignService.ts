import { prisma } from "@novr/db";
import { MarketingCampaignStatus } from "@novr/types";
import { ApiError, NotFoundError } from "../lib/errors";
import { emailQueue, enqueueMarketingCampaignSend } from "../queues/emailQueue";
import * as emailService from "./emailService";
import * as newsletterService from "./newsletterService";

export async function listCampaigns() {
  return prisma.marketingCampaign.findMany({ orderBy: { createdAt: "desc" } });
}

export async function getCampaign(id: string) {
  const campaign = await prisma.marketingCampaign.findUnique({ where: { id } });
  if (!campaign) throw new NotFoundError("Campaign not found");
  return campaign;
}

export interface CreateCampaignInput {
  title: string;
  subject: string;
  bodyHtml: string;
  scheduledAt?: Date;
  createdById: string;
}

export async function createCampaign(input: CreateCampaignInput) {
  return prisma.marketingCampaign.create({
    data: {
      title: input.title,
      subject: input.subject,
      bodyHtml: input.bodyHtml,
      scheduledAt: input.scheduledAt,
      status: input.scheduledAt ? MarketingCampaignStatus.SCHEDULED : MarketingCampaignStatus.DRAFT,
      createdById: input.createdById,
    },
  });
}

export interface UpdateCampaignInput {
  title?: string;
  subject?: string;
  bodyHtml?: string;
  scheduledAt?: Date | null;
}

export async function updateCampaign(id: string, input: UpdateCampaignInput) {
  const campaign = await getCampaign(id);
  if (campaign.status === MarketingCampaignStatus.SENT) {
    throw new ApiError(400, "Cannot edit a campaign that has already been sent");
  }
  return prisma.marketingCampaign.update({
    where: { id },
    data: {
      ...input,
      status: input.scheduledAt !== undefined
        ? input.scheduledAt
          ? MarketingCampaignStatus.SCHEDULED
          : MarketingCampaignStatus.DRAFT
        : undefined,
    },
  });
}

export async function deleteCampaign(id: string) {
  const campaign = await getCampaign(id);
  if (campaign.status === MarketingCampaignStatus.SENT) {
    throw new ApiError(400, "Cannot delete a campaign that has already been sent");
  }
  await prisma.marketingCampaign.delete({ where: { id } });
}

/**
 * Kicks off sending: marks the campaign SENT immediately (so the admin UI
 * reflects the action right away) and hands the actual delivery off to a
 * BullMQ job when Redis is configured, or does it inline otherwise.
 *
 * `stats` is only populated for an inline (non-queued) send, since a queued
 * send happens after this call returns — the caller shows "sending in the
 * background" instead when `stats` is null.
 */
export async function sendCampaignNow(id: string) {
  const campaign = await getCampaign(id);
  if (campaign.status === MarketingCampaignStatus.SENT) {
    throw new ApiError(400, "Campaign has already been sent");
  }

  const recipients = await newsletterService.listAllActiveEmails();

  const sent = await prisma.marketingCampaign.update({
    where: { id },
    data: { status: MarketingCampaignStatus.SENT, sentAt: new Date(), recipientCount: recipients.length },
  });

  // Queue via BullMQ when Redis is configured; otherwise send inline now.
  let stats: { sent: number; failed: number } | null = null;
  if (emailQueue) {
    await enqueueMarketingCampaignSend(id);
  } else {
    stats = await emailService.sendMarketingCampaignBatch(recipients, campaign.subject, campaign.bodyHtml);
  }

  return { campaign: sent, stats };
}

/** Called by the email worker when a send was queued (see queues/emailWorker.ts). */
export async function deliverCampaignEmails(id: string) {
  const campaign = await getCampaign(id);
  const recipients = await newsletterService.listAllActiveEmails();
  await emailService.sendMarketingCampaignBatch(recipients, campaign.subject, campaign.bodyHtml);
}
