import { Router } from "express";
import { z } from "zod";
import { prisma } from "@novr/db";
import * as gophish from "../services/gophishService";

// TODO: Re-enable auth once NEXTAUTH_SECRET is properly synced
// import { authenticate, requireRole } from "../middleware/auth";
// import { ADMIN_ROLES } from "@novr/types";
// router.use(authenticate, requireRole(...ADMIN_ROLES));

const router = Router();

const createCampaignSchema = z.object({
  name: z.string().min(1),
  employeeEmails: z
    .array(
      z.object({
        email: z.string().email(),
        firstName: z.string().optional(),
        lastName: z.string().optional(),
      })
    )
    .min(1),
  templateHtml: z.string().min(1),
  landingPageHtml: z.string().min(1),
});

// POST /campaigns — launch a phishing campaign
router.post("/", async (req, res) => {
  const parsed = createCampaignSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }

  const { name, employeeEmails, templateHtml, landingPageHtml } = parsed.data;
  const campaignUrl = process.env.GOPHISH_CAMPAIGN_URL ?? "http://172.236.25.61:3005";
  const timestamp = Date.now();

  // Unique names to avoid conflicts with existing resources
  const smtpName = `${name}-smtp-${timestamp}`;
  const pageName = `${name}-page-${timestamp}`;
  const templateName = `${name}-email-${timestamp}`;
  const groupName = `${name}-targets-${timestamp}`;

  try {
    // 1. Create GoPhish resources in parallel
    const [smtp, page, template, group] = await Promise.all([
      gophish.createSendingProfile(smtpName),
      gophish.createLandingPage(pageName, landingPageHtml),
      gophish.createTemplate(templateName, "Action Required: Verify Your Account", templateHtml),
      gophish.createGroup(groupName, employeeEmails),
    ]);

    // 2. Launch campaign using NAMES (official GoPhish API)
    const campaign = await gophish.launchCampaign({
      name,
      templateName: template.data.name,
      pageName: page.data.name,
      smtpName: smtp.data.name,
      groupName: group.data.name,
      url: campaignUrl,
    });

    // 3. Save to database
    const dbCampaign = await prisma.campaign.create({
      data: {
        gophishCampaignId: campaign.data.id,
        name,
        status: "active",
        launchedAt: new Date(),
      },
    });

    res.status(201).json({
      success: true,
      campaignId: campaign.data.id,
      dbCampaignId: dbCampaign.id,
    });
  } catch (err: any) {
    console.error("Campaign launch failed:", err.response?.data || err.message);
    res.status(500).json({
      error: "Campaign launch failed",
      details: err.response?.data || err.message,
    });
  }
});

// GET /campaigns — list all campaigns
router.get("/", async (_req, res) => {
  const campaigns = await prisma.campaign.findMany({
    orderBy: { createdAt: "desc" },
    include: { _count: { select: { campaignResults: true } } },
  });
  res.json(campaigns);
});

// GET /campaigns/:id — get single campaign
router.get("/:id", async (req, res) => {
  const campaign = await prisma.campaign.findUnique({
    where: { id: req.params.id },
    include: { campaignResults: true },
  });
  if (!campaign) return res.status(404).json({ error: "Campaign not found" });
  res.json(campaign);
});

// GET /campaigns/:id/results — get live results from GoPhish
// Official GoPhish API: GET /campaigns/:id/summary returns { stats: {...} }
// Official GoPhish API: GET /campaigns/:id/results returns { results: [...] }
router.get("/:id/results", async (req, res) => {
  const campaign = await prisma.campaign.findUnique({
    where: { id: req.params.id },
  });
  if (!campaign) return res.status(404).json({ error: "Campaign not found" });
  if (!campaign.gophishCampaignId) {
    return res.status(400).json({ error: "Campaign not linked to GoPhish" });
  }

  try {
    // Fetch summary and results in parallel
    const [summaryRes, resultsRes] = await Promise.all([
      gophish.getCampaignSummary(campaign.gophishCampaignId),
      gophish.getCampaignResults(campaign.gophishCampaignId),
    ]);

    // Official GoPhish summary response: { stats: { total, sent, opened, clicked, submitted_data, email_reported } }
    const stats = summaryRes.data.stats || {};

    // Official GoPhish results response: { results: [{ status, email, first_name, last_name, ip, send_date, modified_date }] }
    const results = resultsRes.data.results || [];

    const report = {
      total: stats.total || 0,
      sent: stats.sent || 0,
      opened: stats.opened || 0,
      clicked: stats.clicked || 0,
      submittedData: stats.submitted_data || 0,
      reported: stats.email_reported || 0,
      errors: stats.error || 0,
      clickedDetails: results
        .filter((r: any) => r.status === "Clicked Link")
        .map((r: any) => ({
          email: r.email,
          firstName: r.first_name,
          lastName: r.last_name,
          clickedAt: r.modified_date,
          ip: r.ip,
        })),
      submittedDetails: results
        .filter((r: any) => r.status === "Submitted Data")
        .map((r: any) => ({
          email: r.email,
          firstName: r.first_name,
          lastName: r.last_name,
          submittedAt: r.modified_date,
          ip: r.ip,
        })),
    };

    // Update database with latest results
    await prisma.campaign.update({
      where: { id: req.params.id },
      data: { results: report as any },
    });

    res.json(report);
  } catch (err: any) {
    console.error("Failed to fetch results:", err.response?.data || err.message);
    res.status(500).json({ error: err.message });
  }
});

// DELETE /campaigns/:id — delete campaign
router.delete("/:id", async (req, res) => {
  const campaign = await prisma.campaign.findUnique({
    where: { id: req.params.id },
  });
  if (!campaign) return res.status(404).json({ error: "Campaign not found" });

  if (campaign.gophishCampaignId) {
    try {
      await gophish.deleteCampaign(campaign.gophishCampaignId);
    } catch {
      // GoPhish campaign may already be deleted
    }
  }

  await prisma.campaign.delete({ where: { id: req.params.id } });
  res.status(204).send();
});

export default router;
