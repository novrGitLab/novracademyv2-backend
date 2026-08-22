import { Router } from "express";
import { z } from "zod";
import { prisma } from "@novr/db";
import { UserRole, ADMIN_ROLES } from "@novr/types";
import { authenticate, requireRole } from "../middleware/auth";
import * as gophish from "../services/gophishService";

const router = Router();
router.use(authenticate);

async function canManageOrg(userId: string, orgId: string, role: string): Promise<boolean> {
  if (role === UserRole.SUPER_ADMIN) return true;
  if (!ADMIN_ROLES.includes(role as any)) return false;
  const member = await prisma.user.findFirst({ where: { id: userId, organizationId: orgId } });
  return !!member;
}

function getOrgId(req: any): string | null {
  if (req.user.role === UserRole.SUPER_ADMIN) {
    return (req.query.organizationId as string) || req.user.organizationId;
  }
  return req.user.organizationId;
}

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
router.post("/", requireRole(...ADMIN_ROLES), async (req, res) => {
  const orgId = getOrgId(req);
  if (!orgId) return res.status(400).json({ error: "No organization associated with your account" });

  if (!(await canManageOrg(req.user!.id, orgId, req.user!.role))) {
    return res.status(403).json({ error: "Insufficient permissions" });
  }

  const parsed = createCampaignSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }

  const { name, employeeEmails, templateHtml, landingPageHtml } = parsed.data;
  const campaignUrl = process.env.GOPHISH_CAMPAIGN_URL ?? "http://172.236.25.61:3005";
  const timestamp = Date.now();

  // Scope target lookup to organization users
  const targetEmails = employeeEmails.map((e) => e.email.toLowerCase());
  const users = await prisma.user.findMany({ where: { email: { in: targetEmails }, organizationId: orgId } });
  const userByEmail = new Map(users.map((u) => [u.email.toLowerCase(), u]));
  const missing = targetEmails.filter((e) => !userByEmail.has(e));
  if (missing.length > 0) {
    return res.status(400).json({
      error: "Some target emails are not members of your organization",
      emails: missing,
    });
  }
  const targets = [...userByEmail.values()].map((u) => {
    const [first, ...rest] = (u.name ?? "").split(" ").filter(Boolean);
    return {
      email: u.email,
      firstName: first || u.email.split("@")[0],
      lastName: rest.join(" "),
      userId: u.id,
    };
  });

  // Unique names to avoid conflicts with existing resources
  const smtpName = `${name}-smtp-${timestamp}`;
  const pageName = `${name}-page-${timestamp}`;
  const templateName = `${name}-email-${timestamp}`;
  const groupName = `${name}-targets-${timestamp}`;

  try {
    // 1. Fetch org's sender config for phishing emails
    const org = await prisma.organization.findUnique({
      where: { id: orgId },
      select: { senderName: true, senderEmail: true, name: true },
    });
    const senderDisplay = org?.senderName || org?.name || "Security Team";
    const senderAddress = org?.senderEmail || process.env.GOPHISH_SMTP_FROM_ADDRESS || "security@novracademy.com";

    // 2. Create GoPhish resources sequentially (with logging)
    console.log("GoPhish: Creating sending profile...");
    const smtpRes = await gophish.createSendingProfile(smtpName, {
      fromAddress: `${senderDisplay} <${senderAddress}>`,
    });
    const smtpData = smtpRes.data?.data || smtpRes.data;
    console.log("GoPhish: SMTP created:", smtpData?.id);

    console.log("GoPhish: Creating landing page...");
    const pageRes = await gophish.createLandingPage(pageName, landingPageHtml);
    const pageData = pageRes.data?.data || pageRes.data;
    console.log("GoPhish: Page created:", pageData?.id);

    console.log("GoPhish: Creating template...");
    const templateRes = await gophish.createTemplate(templateName, "Action Required: Verify Your Account", templateHtml);
    const templateData = templateRes.data?.data || templateRes.data;
    console.log("GoPhish: Template created:", templateData?.id);

    console.log("GoPhish: Creating group...");
    const groupRes = await gophish.createGroup(groupName, targets);
    const groupData = groupRes.data?.data || groupRes.data;
    console.log("GoPhish: Group created:", groupData?.id);

    // 2. Launch campaign using NAMES (official GoPhish API)
    console.log("GoPhish: Launching campaign...");
    const campaignRes = await gophish.launchCampaign({
      name,
      templateName: templateData.name,
      pageName: pageData.name,
      smtpName: smtpData.name,
      groupName: groupData.name,
      url: campaignUrl,
    });
    const campaignData = campaignRes.data?.data || campaignRes.data;
    console.log("GoPhish: Campaign launched:", campaignData?.id);

    // 3. Save to database
    const dbCampaign = await prisma.campaign.create({
      data: {
        gophishCampaignId: campaignData.id,
        name,
        status: "active",
        organizationId: orgId,
        launchedAt: new Date(),
        templateHtml,
        landingPageHtml,
      },
    });

    res.status(201).json({
      success: true,
      campaignId: campaignData.id,
      dbCampaignId: dbCampaign.id,
    });
  } catch (err: any) {
    console.error("Campaign launch failed:", JSON.stringify(err.response?.data || err.message));
    console.error("Full error:", err.stack || err);
    res.status(500).json({
      error: "Campaign launch failed",
      details: err.response?.data || err.message,
    });
  }
});

// GET /campaigns — list campaigns scoped to organization
router.get("/", requireRole(...ADMIN_ROLES), async (req, res) => {
  const orgId = getOrgId(req);
  const where = orgId ? { organizationId: orgId } : {};
  const campaigns = await prisma.campaign.findMany({
    where,
    orderBy: { createdAt: "desc" },
    include: { _count: { select: { campaignResults: true } } },
  });
  res.json(campaigns);
});

// GET /campaigns/:id — get single campaign (accepts DB id or GoPhish id)
router.get("/:id", requireRole(...ADMIN_ROLES), async (req, res) => {
  const id = req.params.id;
  const isNumeric = /^\d+$/.test(id);
  const campaign = await prisma.campaign.findFirst({
    where: isNumeric ? { gophishCampaignId: parseInt(id) } : { id },
    include: { campaignResults: true },
  });
  if (!campaign) return res.status(404).json({ error: "Campaign not found" });

  const orgId = getOrgId(req);
  if (orgId && campaign.organizationId !== orgId) {
    return res.status(403).json({ error: "Insufficient permissions" });
  }

  res.json(campaign);
});

// GET /campaigns/:id/results — get live results from GoPhish
// Official GoPhish API: GET /campaigns/:id/summary returns { stats: {...} }
// Official GoPhish API: GET /campaigns/:id/results returns { results: [...] }
router.get("/:id/results", async (req, res) => {
  const id = req.params.id;
  const isNumeric = /^\d+$/.test(id);
  const campaign = await prisma.campaign.findFirst({
    where: isNumeric ? { gophishCampaignId: parseInt(id) } : { id },
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
    const results: any[] = resultsRes.data.results || [];

    // Persist one CampaignResult row per (target, event) — idempotent across polls
    const STATUS_TO_EVENT: Record<string, string> = {
      Sent: "sent",
      Opened: "opened",
      "Clicked Link": "clicked",
      "Submitted Data": "submitted",
      "Email Reported": "reported",
    };
    const resultEmails = [...new Set(results.map((r: any) => String(r.email)))];
    const resultUsers = await prisma.user.findMany({ where: { email: { in: resultEmails } } });
    const userIdByEmail = new Map(resultUsers.map((u) => [u.email.toLowerCase(), u.id]));
    for (const r of results) {
      const eventType = STATUS_TO_EVENT[r.status] ?? r.status;
      const resultId = `cr_${campaign.id}_${Buffer.from(r.email).toString("hex")}_${eventType}`;
      const meta = { status: r.status, ip: r.ip ?? null, sendDate: r.send_date ?? null, modifiedDate: r.modified_date ?? null };
      await prisma.campaignResult.upsert({
        where: { id: resultId },
        create: {
          id: resultId,
          campaignId: campaign.id,
          gophishCampaignId: campaign.gophishCampaignId,
          userId: userIdByEmail.get(r.email.toLowerCase()) ?? null,
          employeeEmail: r.email,
          eventType,
          metadata: meta,
        },
        update: { metadata: meta },
      });
    }

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
      where: { id: campaign.id },
      data: { results: report as any },
    });

    res.json(report);
  } catch (err: any) {
    console.error("Failed to fetch results:", err.response?.data || err.message);
    res.status(500).json({ error: err.message });
  }
});

// DELETE /campaigns/:id — delete campaign (accepts DB id or GoPhish id)
router.delete("/:id", requireRole(...ADMIN_ROLES), async (req, res) => {
  const id = req.params.id;
  const isNumeric = /^\d+$/.test(id);

  const campaign = await prisma.campaign.findFirst({
    where: isNumeric ? { gophishCampaignId: parseInt(id) } : { id },
  });
  if (!campaign) return res.status(404).json({ error: "Campaign not found" });

  const orgId = getOrgId(req);
  if (orgId && campaign.organizationId !== orgId) {
    return res.status(403).json({ error: "Insufficient permissions" });
  }

  if (campaign.gophishCampaignId) {
    try {
      await gophish.deleteCampaign(campaign.gophishCampaignId);
    } catch {
      // GoPhish campaign may already be deleted
    }
  }

  await prisma.campaign.delete({ where: { id: campaign.id } });
  res.status(204).send();
});

export default router;
