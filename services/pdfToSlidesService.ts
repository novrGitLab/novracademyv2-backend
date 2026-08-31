import axios from "axios";

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
 * Uploads a PDF and blocks until the service has finished the whole pipeline
 * (Presenton generation + optional TTS voiceover + LibreOffice render). The
 * service's request timeout is ~10 min, which comfortably covers it.
 */
export async function generateDeckFromPDF(
  pdfBuffer: Buffer,
  opts: { voiceover: boolean; slides: number; filename?: string }
): Promise<GeneratedDeck> {
  const form = new FormData();
  form.append("pdf", new Blob([pdfBuffer], { type: "application/pdf" }), opts.filename || "document.pdf");

  const response = await axios.post(`${PDF_TO_SLIDES_URL}/api/upload`, form, {
    params: {
      voiceover: opts.voiceover ? "1" : "0",
      slides: String(opts.slides),
    },
    headers: authHeaders(),
    timeout: PDF_TO_SLIDES_TIMEOUT_MS,
    maxContentLength: Infinity,
    maxBodyLength: Infinity,
  });

  const data = response.data as { success?: boolean; deckId?: string; manifest?: DeckManifest };
  if (!data || data.success !== true || !data.deckId) {
    throw new Error(`pdf-to-slides upload failed: ${JSON.stringify(response.data).slice(0, 500)}`);
  }

  const deckId = data.deckId;
  const manifest = data.manifest ?? { deckId };
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
