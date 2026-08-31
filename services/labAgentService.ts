import axios, { type AxiosInstance } from "axios";

const LAB_AGENT_URL = process.env.LAB_AGENT_URL;
const LAB_AGENT_API_KEY = process.env.LAB_AGENT_API_KEY;

if (!LAB_AGENT_API_KEY) {
  console.warn("WARNING: LAB_AGENT_API_KEY not set — Lab features will fail");
}

const client: AxiosInstance = axios.create({
  baseURL: LAB_AGENT_URL,
  headers: {
    "x-api-key": LAB_AGENT_API_KEY ?? "",
    "Content-Type": "application/json",
  },
  timeout: 30_000,
});

interface ProvisionResponse {
  sessionId: string;
  status: "running";
  iframeUrl: string;
  expiresAt: string;
}

interface StatusResponse {
  status: string;
  labId?: string;
  startedAt?: string;
  expiresAt?: string;
  iframeUrl?: string;
}

export async function startLab(
  sessionId: string,
  labTemplateId: string,
  ttlMinutes: number
): Promise<ProvisionResponse> {
  const res = await client.post<ProvisionResponse>(
    "/provision",
    { sessionId, labId: labTemplateId, ttlMinutes },
    { timeout: 60_000 }
  );
  return res.data;
}

export async function endLab(sessionId: string): Promise<{ sessionId: string; status: string }> {
  const res = await client.post("/destroy", { sessionId });
  return res.data;
}

export async function getLabStatus(sessionId: string): Promise<StatusResponse> {
  const res = await client.get<StatusResponse>(`/status/${sessionId}`);
  return res.data;
}

/**
 * Asks the Lab Agent which lab templates are available. Falls back to
 * a comma-separated list from `LAB_TEMPLATES_LIST` if the agent doesn't
 * expose a /templates route (older agent builds) or is unreachable.
 */
export async function listLabTemplates(): Promise<string[]> {
  try {
    const res = await client.get<string[]>("/templates");
    return res.data;
  } catch (err: any) {
    if (err?.response?.status === 404) {
      const fallback = (process.env.LAB_TEMPLATES_LIST ?? "")
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
      return fallback;
    }
    throw err;
  }
}
