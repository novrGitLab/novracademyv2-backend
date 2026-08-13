import axios, { AxiosInstance } from "axios";
import https from "https";

const GOPHISH_URL = process.env.GOPHISH_URL ?? "https://172.236.25.61:3004/api";
const GOPHISH_API_KEY = process.env.GOPHISH_API_KEY;

if (!GOPHISH_API_KEY) {
  console.warn("WARNING: GOPHISH_API_KEY not set — GoPhish features will fail");
}

const client: AxiosInstance = axios.create({
  baseURL: GOPHISH_URL,
  headers: {
    Authorization: GOPHISH_API_KEY ?? "",
    "Content-Type": "application/json",
  },
  // Self-signed cert on GoPhish
  httpsAgent: new https.Agent({ rejectUnauthorized: false }),
  timeout: 30_000,
});

// ─── Resources ───────────────────────────────────────────────────────────

export async function createSendingProfile(name: string) {
  return client.post("/smtp", {
    name,
    interface_type: "SMTP",
    from_address: "security@novracademy.com",
    host: process.env.GOPHISH_SMTP_HOST ?? "mailhog",
    port: parseInt(process.env.GOPHISH_SMTP_PORT ?? "1025"),
    username: "",
    password: "",
    ignore_cert_errors: true,
  });
}

export async function createLandingPage(name: string, html: string) {
  return client.post("/pages", {
    name,
    html,
    capture_credentials: true,
    capture_passwords: false,
    redirect_url: process.env.GOPHISH_REDIRECT_URL ?? "http://172.236.25.61:3006",
  });
}

export async function createTemplate(name: string, subject: string, html: string, text = "") {
  return client.post("/templates", { name, subject, html, text });
}

export interface Target {
  email: string;
  firstName?: string;
  lastName?: string;
  position?: string;
}

export async function createGroup(name: string, targets: Target[]) {
  return client.post("/groups", {
    name,
    targets: targets.map((t) => ({
      first_name: t.firstName || t.email.split("@")[0],
      last_name: t.lastName || "",
      email: t.email,
      position: t.position || "",
    })),
  });
}

// ─── Campaigns ───────────────────────────────────────────────────────────

// Official GoPhish API uses NAMES, not IDs for campaign creation
export interface LaunchCampaignParams {
  name: string;
  templateName: string;
  pageName: string;
  smtpName: string;
  groupName: string;
  url: string;
}

export async function launchCampaign(params: LaunchCampaignParams) {
  return client.post("/campaigns", {
    name: params.name,
    template: { name: params.templateName },
    page: { name: params.pageName },
    smtp: { name: params.smtpName },
    groups: [{ name: params.groupName }],
    url: params.url,
  });
}

export async function getCampaignSummary(campaignId: number) {
  return client.get(`/campaigns/${campaignId}/summary`);
}

export async function getCampaignResults(campaignId: number) {
  return client.get(`/campaigns/${campaignId}/results`);
}

export async function deleteCampaign(campaignId: number) {
  return client.delete(`/campaigns/${campaignId}`);
}

// ─── List existing resources ─────────────────────────────────────────────

export async function listSendingProfiles() {
  return client.get("/smtp");
}

export async function listTemplates() {
  return client.get("/templates");
}

export async function listGroups() {
  return client.get("/groups");
}

// ─── Health check ────────────────────────────────────────────────────────

export async function isHealthy(): Promise<boolean> {
  try {
    await client.get("/config", { timeout: 5000 });
    return true;
  } catch {
    return false;
  }
}
