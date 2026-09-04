import axios from "axios";
import http from "http";
import https from "https";

/**
 * Thin client over the deployed pdf-to-slides service. The service owns the
 * whole pipeline (Presenton → PPTX, LibreOffice raster rendering, OpenAI TTS
 * with slide timings) and exposes it as one `POST /api/upload` call. This
 * module never touches OOXML — it just forwards the PDF and mirrors the
 * resulting assets back into our own R2 bucket.
 */

const PDF_TO_SLIDES_URL = (process.env.PDF_TO_SLIDES_URL ?? "http://172.237.112.83:3005").replace(/\/+$/, "");
const PDF_TO_SLIDES_API_KEY = process.env.PDF_TO_SLIDES_API_KEY ?? "";
const PDF_TO_SLIDES_TIMEOUT_MS = Number(process.env.PDF_TO_SLIDES_TIMEOUT_MS ?? 600_000);
// Async jobs poll until the deck is done. This caps the total wall time we'll
// wait before giving up (default 20 min) — comfortably above a voiceover deck.
const PDF_TO_SLIDES_POLL_INTERVAL_MS = 3000;
const PDF_TO_SLIDES_MAX_WAIT_MS = Number(process.env.PDF_TO_SLIDES_MAX_WAIT_MS ?? 1_200_000);

export interface SlideTiming {
  index: number;
  start: number;
  end: number;
}

export interface RenderItem {
  type: "bg" | "text" | "image";
  color?: string;
  src?: string;
  x?: number;
  y?: number;
  w?: number;
  h?: number;
  text?: string;
  fontSize?: number;
  bold?: boolean;
  align?: string;
}

export interface RenderSlide {
  index: number;
  src?: string;
  items?: RenderItem[];
}

export interface RenderSpec {
  mode: "raster" | "composited";
  slideW: number;
  slideH: number;
  slides: RenderSlide[];
}

export interface DeckManifest {
  deckId: string;
  title?: string;
  slideCount?: number;
  pptxUrl?: string;
  pptxBytes?: number;
  presentationId?: string | null;
  template?: string;
  generatedAt?: string;
  voiceoverUrl?: string;
  voiceoverBytes?: number;
  voiceoverSlides?: number;
  slideTimings?: SlideTiming[];
  viewerUrl?: string;
  [key: string]: unknown;
}

export interface GeneratedDeck {
  deckId: string;
  pptxUrl: string;
  voiceoverUrl: string | null;
  manifest: DeckManifest;
  render: RenderSpec | null;
  slideCount: number;
  bytes: { pptx: number; voiceover: number | null };
}

function authHeaders(): Record<string, string> {
  return PDF_TO_SLIDES_API_KEY ? { Authorization: `Bearer ${PDF_TO_SLIDES_API_KEY}` } : {};
}

function absoluteUrl(path: string): string {
  if (/^https?:\/\//i.test(path)) return path;
  return `${PDF_TO_SLIDES_URL}${path.startsWith("/") ? "" : "/"}${path}`;
}

/**
 * Uploads a PDF asynchronously and polls until the deck is ready. The service
 * returns a deckId immediately (`POST /api/upload-async`); the heavy pipeline
 * (Presenton + TTS + render) runs server-side in the background. We poll
 * `GET /api/decks/:id/status` until it reports "completed" or "failed".
 *
 * Unlike the old synchronous call, no socket is held open for the whole
 * pipeline, so a slow deck can no longer be cut off by a request timeout or
 * double-created by a client-side retry. Throws after `maxWaitMs` if the deck
 * never finishes.
 */
export async function generateDeckFromPDF(
  pdfBuffer: Buffer,
  opts: { voiceover: boolean; slides: number; filename?: string }
): Promise<GeneratedDeck> {
  const form = new FormData();
  form.append("pdf", new Blob([pdfBuffer], { type: "application/pdf" }), opts.filename || "document.pdf");

  // 1. Submit — returns immediately with a deckId.
  const submitResponse = await axios.post(`${PDF_TO_SLIDES_URL}/api/upload-async`, form, {
    params: {
      voiceover: opts.voiceover ? "1" : "0",
      slides: String(opts.slides),
    },
    headers: authHeaders(),
    timeout: 60_000,
    maxContentLength: Infinity,
    maxBodyLength: Infinity,
    // The 202 + immediate body must not be treated as an error by axios.
    validateStatus: (s) => s >= 200 && s < 300,
  });

  const submitData = submitResponse.data as { success?: boolean; deckId?: string; status?: string };
  if (!submitData || submitData.success !== true || !submitData.deckId) {
    throw new Error(`pdf-to-slides submit failed: ${JSON.stringify(submitResponse.data).slice(0, 500)}`);
  }
  const deckId = submitData.deckId;

  // 2. Poll until the deck is completed (or failed / max wait reached).
  //    The status endpoint is idempotent and cheap, and the deck keeps being
  //    processed server-side even if our connection drops (ECONNRESET, keep-
  //    alive socket closed by a service restart, timeout, transient 5xx).
  //    We therefore tolerate up to POLL_MAX_CONSECUTIVE_ERRORS failures in a
  //    row and only give up if the status endpoint is persistently down.
  const deadline = Date.now() + PDF_TO_SLIDES_MAX_WAIT_MS;
  const POLL_MAX_CONSECUTIVE_ERRORS = 8;
  let status = submitData.status ?? "queued";
  let consecutiveErrors = 0;
  while (status !== "completed") {
    if (Date.now() > deadline) {
      throw new Error(`pdf-to-slides generation timed out after ${Math.round(PDF_TO_SLIDES_MAX_WAIT_MS / 60000)} min (deck ${deckId})`);
    }
    await new Promise((r) => setTimeout(r, PDF_TO_SLIDES_POLL_INTERVAL_MS));
    try {
      const statusResponse = await axios.get(`${PDF_TO_SLIDES_URL}/api/decks/${encodeURIComponent(deckId)}/status`, {
        headers: authHeaders(),
        timeout: 30_000,
        // Fresh socket per poll: avoids ECONNRESET on a reused keep-alive
        // connection that the remote closed (e.g. a service restart).
        httpAgent: new http.Agent({ keepAlive: false }),
        httpsAgent: new https.Agent({ keepAlive: false }),
      });
      const data = statusResponse.data as { status?: string; error?: string | null };
      status = data.status ?? "processing";
      consecutiveErrors = 0;
      if (status === "failed") {
        throw new Error(`pdf-to-slides generation failed: ${data.error ?? "unknown error"}`);
      }
    } catch (err) {
      // 404 while queued/processing means status.json hasn't been written yet
      // (harmless race). Connection resets / timeouts / 5xx are transient —
      // the deck is still processing server-side. Only abort when the status
      // endpoint fails repeatedly (it would then be genuinely unreachable).
      if (axios.isAxiosError(err) && err.response?.status === 404) {
        continue;
      }
      consecutiveErrors += 1;
      if (consecutiveErrors >= POLL_MAX_CONSECUTIVE_ERRORS) {
        throw err;
      }
    }
  }

  // 3. Deck is ready — fetch the manifest and render spec.
  const manifest = await fetchDeckManifest(deckId);
  const render = await getRender(deckId);

  return {
    deckId,
    pptxUrl: manifest.pptxUrl ?? `/decks/${deckId}/deck.pptx`,
    voiceoverUrl: manifest.voiceoverUrl ?? null,
    manifest,
    render,
    slideCount: manifest.slideCount ?? render?.slides?.length ?? opts.slides,
    bytes: {
      pptx: manifest.pptxBytes ?? 0,
      voiceover: manifest.voiceoverBytes ?? null,
    },
  };
}

/** Fetches a deck's manifest.json (written when the async pipeline completes). */
async function fetchDeckManifest(deckId: string): Promise<DeckManifest> {
  const response = await axios.get(`${PDF_TO_SLIDES_URL}/api/decks/${encodeURIComponent(deckId)}/manifest`, {
    headers: authHeaders(),
    timeout: 30_000,
  });
  return response.data as DeckManifest;
}

/**
 * Fetches a deck's render spec (`/decks/<id>/render.json`). Returns null when
 * the deck has no render data (the service only renders when voiceover is on).
 * Non-404 failures are retried once and then degrade to null so a transient
 * network blip never fails the whole generation.
 */
export async function getRender(deckId: string): Promise<RenderSpec | null> {
  const url = `${PDF_TO_SLIDES_URL}/decks/${encodeURIComponent(deckId)}/render.json`;
  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      const response = await axios.get(url, {
        headers: authHeaders(),
        timeout: 30_000,
      });
      return response.data as RenderSpec;
    } catch (err: any) {
      if (err?.response?.status === 404) return null;
      if (attempt === 2) {
        console.warn(`[pdf-to-slides] render.json fetch failed for deck ${deckId}:`, err?.message ?? err);
        return null;
      }
      await new Promise((r) => setTimeout(r, 2000));
    }
  }
  return null;
}

/** Downloads a deck asset (pptx, voiceover.mp3, slide PNGs, media) as a Buffer. */
export async function fetchDeckAsset(remotePath: string): Promise<Buffer> {
  const response = await axios.get(absoluteUrl(remotePath), {
    headers: authHeaders(),
    responseType: "arraybuffer",
    timeout: PDF_TO_SLIDES_TIMEOUT_MS,
    maxContentLength: Infinity,
    maxBodyLength: Infinity,
  });
  return Buffer.from(response.data);
}
