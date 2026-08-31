import axios, { AxiosInstance, AxiosResponse } from "axios";
import https from "https";

const GOPHISH_URL = process.env.GOPHISH_URL ?? "https://172.236.25.61:3004/api";
const GOPHISH_API_KEY = process.env.GOPHISH_API_KEY;

if (!GOPHISH_API_KEY) {
  console.warn("WARNING: GOPHISH_API_KEY not set — GoPhish features will fail");
}

console.log(`GoPhish URL: ${GOPHISH_URL}`);
console.log(`GoPhish API Key set: ${!!GOPHISH_API_KEY}`);

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

// Helper to log and return GoPhish responses
function handleResponse(label: string, res: AxiosResponse) {
  console.log(`GoPhish ${label} response:`, JSON.stringify(res.data).substring(0, 500));
  return res;
}

// ─── Resources ───────────────────────────────────────────────────────────

export async function createSendingProfile(name: string, options?: { fromAddress?: string; senderName?: string }) {
  const smtpHost = process.env.GOPHISH_SMTP_HOST ?? "mailhog";
  const smtpPort = process.env.GOPHISH_SMTP_PORT ?? "1025";
  const host = smtpHost.includes(":") ? smtpHost : `${smtpHost}:${smtpPort}`;

  // GoPhish requires `from_address` to be a bare email address — a
  // "Display Name <email>" string is rejected as invalid.
  const fromAddress = options?.fromAddress ?? process.env.GOPHISH_SMTP_FROM_ADDRESS ?? "security@novracademy.com";

  const res = await client.post("/smtp/", {
    name,
    interface_type: "SMTP",
    from_address: fromAddress,
    host,
    username: process.env.GOPHISH_SMTP_USERNAME ?? "",
    password: process.env.GOPHISH_SMTP_PASSWORD ?? "",
    ignore_cert_errors: true,
  });
  return handleResponse("SMTP", res);
}

export async function createLandingPage(name: string, html: string) {
  const res = await client.post("/pages/", {
    name,
    html,
    capture_credentials: true,
    capture_passwords: false,
    redirect_url: process.env.GOPHISH_REDIRECT_URL ?? "http://172.236.25.61:3006",
  });
  return handleResponse("Page", res);
}

export async function createTemplate(name: string, subject: string, html: string, text = "") {
  const res = await client.post("/templates/", { name, subject, html, text });
  return handleResponse("Template", res);
}

export interface Target {
  email: string;
  firstName?: string;
  lastName?: string;
  position?: string;
}

export async function createGroup(name: string, targets: Target[]) {
  const res = await client.post("/groups/", {
    name,
    targets: targets.map((t) => ({
      first_name: t.firstName || t.email.split("@")[0],
      last_name: t.lastName || "",
      email: t.email,
      position: t.position || "",
    })),
  });
  return handleResponse("Group", res);
}

// ─── Campaigns ───────────────────────────────────────────────────────────

export interface LaunchCampaignParams {
  name: string;
  templateName: string;
  pageName: string;
  smtpName: string;
  groupName: string;
  url: string;
}

export async function launchCampaign(params: LaunchCampaignParams) {
  const res = await client.post("/campaigns/", {
    name: params.name,
    template: { name: params.templateName },
    page: { name: params.pageName },
    smtp: { name: params.smtpName },
    groups: [{ name: params.groupName }],
    url: params.url,
  });
  return handleResponse("Campaign", res);
}

export async function getCampaignSummary(campaignId: number) {
  const res = await client.get(`/campaigns/${campaignId}/summary`);
  return handleResponse("Summary", res);
}

export async function getCampaignResults(campaignId: number) {
  const res = await client.get(`/campaigns/${campaignId}/results`);
  return handleResponse("Results", res);
}

export async function deleteCampaign(campaignId: number) {
  return client.delete(`/campaigns/${campaignId}`);
}

// ─── List existing resources ─────────────────────────────────────────────

export async function listSendingProfiles() {
  return client.get("/smtp/");
}

export async function listTemplates() {
  return client.get("/templates/");
}

export async function listGroups() {
  return client.get("/groups/");
}

// ─── Health check ────────────────────────────────────────────────────────

export async function isHealthy(): Promise<boolean> {
  try {
    const res = await client.get("/config", { timeout: 5000 });
    console.log("GoPhish health check:", JSON.stringify(res.data).substring(0, 200));
    return true;
  } catch (err: any) {
    console.error("GoPhish health check failed:", err.message);
    return false;
  }
}
