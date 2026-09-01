import { prisma, Prisma } from "@novr/db";
import { LessonType } from "@novr/types";
import JSZip from "jszip";
import * as pdfToSlidesService from "./pdfToSlidesService";
import * as r2Service from "./r2Service";

/**
 * Slides generation orchestration. The heavy lifting (PDF → Presenton PPTX →
 * LibreOffice raster render → OpenAI TTS voiceover with slide timings) lives
 * in the pdf-to-slides service; this module is now a thin orchestrator that:
 *   1. reads the source PDF from R2,
 *   2. delegates to `POST /api/upload` on the pdf-to-slides service,
 *   3. mirrors the resulting deck assets into our own R2 bucket,
 *   4. writes a `SlidesManifest` onto a generated SLIDES lesson.
 */

const R2_BUCKET = process.env.R2_BUCKET_NAME ?? "novracademy-media";

/** Public URL for an R2 object. Prefers R2_PUBLIC_URL (custom domain) and
 * falls back to the bucket's auto public endpoint. */
function publicR2Url(key: string): string {
  const base = (process.env.R2_PUBLIC_URL ?? `https://${R2_BUCKET}.r2.dev`).replace(/\/+$/, "");
  return `${base}/${key}`;
}

export interface SlideItem {
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

export interface SlideContent {
  index: number;
  items: SlideItem[];
}

export interface SlideTiming {
  index: number;
  start: number;
  end: number;
}

export interface SlidesManifest {
  slideImages: string[];
  slideCount: number;
  audioUrl: string | null;
  voiceoverEnabled: boolean;
  pptxUrl: string;
  sourceLessonId: string;
  generatedAt: string;
  slidesData: SlideContent[];
  slideW: number;
  slideH: number;
  mode: "raster" | "composited";
  slideTimings?: SlideTiming[];
  remoteDeckId?: string;
}

/**
 * Runs `fn` with exponential backoff + jitter, retrying on network errors
 * (ECONNRESET, timeouts, 5xx, 429). The pdf-to-slides service can be slow or
 * transiently 5xx, so we retry before giving up. 4xx (except 429) are not
 * retried.
 */
async function withRetry<T>(fn: () => Promise<T>, opts: { retries?: number; baseDelayMs?: number; label?: string } = {}): Promise<T> {
  const { retries = 3, baseDelayMs = 3000, label = "request" } = opts;
  let lastErr: unknown;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await fn();
    } catch (err: any) {
      lastErr = err;
      const status = err?.response?.status as number | undefined;
      const retryable =
        !status || // network / timeout / DNS — no status at all
        status === 408 ||
        status === 429 ||
        status >= 500;
      if (!retryable || attempt === retries) break;
      const delayMs = baseDelayMs * 2 ** attempt + Math.random() * 1000;
      console.log(`[slides] ${label} failed (attempt ${attempt + 1}/${retries}), retrying in ${Math.round(delayMs)}ms:`, status ?? err?.code ?? err?.message);
      await new Promise((r) => setTimeout(r, delayMs));
    }
  }
  throw lastErr;
}

// ── OOXML composited fallback ──────────────────────────────────────────────
// Used when the pdf-to-slides service returns no render data (voiceover off,
// renderer unavailable, or the deployed instance lacks LibreOffice). Parses
// the mirrored PPTX for positioned text + images so the student viewer still
// has something to render. Kept deliberately minimal — the remote service is
// the primary renderer.

const SLIDE_W = 12192000;
const SLIDE_H = 6858000;

function parseRels(xml: string): Record<string, string> {
  const out: Record<string, string> = {};
  const re = /<Relationship\b([^>]*?)\/?>/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(xml)) !== null) {
    const attrs = m[1];
    const id = (attrs.match(/\bId="([^"]+)"/) || [])[1];
    const target = (attrs.match(/\bTarget="([^"]+)"/) || [])[1];
    if (id && target) out[id] = target;
  }
  return out;
}

function parseOff(block: string): { x: number; y: number } | null {
  const m = block.match(/<a:off\s+x="(-?\d+)"\s+y="(-?\d+)"/);
  if (!m) return null;
  return { x: parseInt(m[1], 10), y: parseInt(m[2], 10) };
}

function parseExt(block: string): { cx: number; cy: number } | null {
  const m = block.match(/<a:ext\s+cx="(\d+)"\s+cy="(\d+)"/);
  if (!m) return null;
  return { cx: parseInt(m[1], 10), cy: parseInt(m[2], 10) };
}

function decodeXml(s: string): string {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'");
}

function joinRuns(runs: string[]): string {
  let out = "";
  for (const r of runs) {
    if (!r) { out += r; continue; }
    if (!out) { out = r; continue; }
    const last = out.slice(-1);
    const first = r[0];
    const lastIsSpace = /\s/.test(last);
    const firstIsPunct = /[.,!?;:]/.test(first);
    const lastIsPunct = /[.,!?;:]/.test(last);
    if (!lastIsSpace && !firstIsPunct && !lastIsPunct) {
      out += " " + r;
    } else {
      out += r;
    }
  }
  return out;
}

function collectText(spBlock: string): string {
  const paras: string[] = [];
  const pRe = /<a:p>[\s\S]*?<\/a:p>/g;
  let m: RegExpExecArray | null;
  while ((m = pRe.exec(spBlock)) !== null) {
    const p = m[0];
    const runs: string[] = [];
    const rRe = /<a:r>[\s\S]*?<\/a:r>/g;
    let rm: RegExpExecArray | null;
    while ((rm = rRe.exec(p)) !== null) {
      const t = (rm[0].match(/<a:t>([\s\S]*?)<\/a:t>/) || [])[1] || "";
      runs.push(decodeXml(t));
    }
    paras.push(joinRuns(runs));
  }
  return paras.join("\n");
}

function parseSlideItems(xml: string, rels: Record<string, string>): SlideItem[] {
  const items: SlideItem[] = [];

  const bg = (xml.match(/<p:bg>[\s\S]*?<\/p:bg>/) || [""])[0];
  const bgColor = (bg.match(/<a:srgbClr\s+val="([0-9A-Fa-f]{6})"/) || [])[1];
  if (bgColor) items.push({ type: "bg", color: `#${bgColor}` });

  const picRe = /<p:pic>[\s\S]*?<\/p:pic>/g;
  let m: RegExpExecArray | null;
  while ((m = picRe.exec(xml)) !== null) {
    const block = m[0];
    const off = parseOff(block);
    const ext = parseExt(block);
    if (!off || !ext) continue;
    const embed = (block.match(/r:embed="(rId\d+)"/) || [])[1];
    if (!embed) continue;
    const target = rels[embed];
    if (!target) continue;
    const mediaPath = target.replace(/^\.\.\//, "");
    const extLower = mediaPath.split(".").pop()?.toLowerCase() ?? "";
    if (extLower === "svg") continue;
    items.push({ type: "image", x: off.x, y: off.y, w: ext.cx, h: ext.cy, src: mediaPath });
  }

  const spRe = /<p:sp>[\s\S]*?<\/p:sp>/g;
  while ((m = spRe.exec(xml)) !== null) {
    const block = m[0];
    const off = parseOff(block);
    const ext = parseExt(block);
    if (!off || !ext) continue;
    const text = collectText(block);
    if (text.length === 0) continue;
    const szMatch = block.match(/<a:rPr[^>]*\bsz="(\d+)"/);
    const fontSize = szMatch ? parseInt(szMatch[1], 10) / 100 : null;
    let color: string | null = null;
    const cMatch = block.match(/<a:solidFill>[\s\S]*?<a:srgbClr\s+val="([0-9A-Fa-f]{6})"/);
    if (cMatch) color = `#${cMatch[1]}`;
    const bold = /<a:rPr[^>]*\bb="1"/.test(block);
    let align = "left";
    if (/<a:pPr[^>]*algn="ctr"/.test(block)) align = "center";
    else if (/<a:pPr[^>]*algn="r"/.test(block)) align = "right";

    items.push({ type: "text", x: off.x, y: off.y, w: ext.cx, h: ext.cy, text, fontSize: fontSize ?? undefined, color: color ?? undefined, bold, align });
  }

  return items;
}

/**
 * Parses a PPTX buffer into a composited render spec and uploads any
 * referenced media to R2. Used as a fallback when the remote service doesn't
 * produce render.json.
 */
async function extractCompositedFallback(
  pptxBuffer: Buffer,
  lessonId: string
): Promise<{ render: pdfToSlidesService.RenderSpec; slideImages: string[] }> {
  const zip = await JSZip.loadAsync(pptxBuffer);
  const slideNames = Object.keys(zip.files)
    .filter((n) => /^ppt\/slides\/slide\d+\.xml$/.test(n))
    .sort((a, b) => {
      const na = parseInt((a.match(/slide(\d+)\.xml$/) ?? [])[1] ?? "0", 10);
      const nb = parseInt((b.match(/slide(\d+)\.xml$/) ?? [])[1] ?? "0", 10);
      return na - nb;
    });
  if (slideNames.length === 0) throw new Error("PPTX contains no slides");

  const slides: pdfToSlidesService.RenderSlide[] = [];
  const mediaDir = `lessons/${lessonId}/slides/media`;

  for (let i = 0; i < slideNames.length; i++) {
    const slideXml = await zip.files[slideNames[i]].async("text");
    const relsName = slideNames[i].replace("slides/", "slides/_rels/") + ".rels";
    const relsEntry = zip.files[relsName];
    let relsMap: Record<string, string> = {};
    if (relsEntry) {
      try {
        relsMap = parseRels(await relsEntry.async("text"));
      } catch {}
    }

    const items = parseSlideItems(slideXml, relsMap);
    for (const it of items) {
      if (it.type === "image" && it.src) {
        const zipKey = `ppt/${it.src}`;
        const entry = zip.files[zipKey];
        if (entry) {
          const buf = await entry.async("nodebuffer");
          const ext = it.src.split(".").pop()?.toLowerCase() ?? "png";
          const outKey = `${mediaDir}/slide${i + 1}_${it.src.split("/").pop()}`;
          await r2Service.uploadBuffer(outKey, buf, `image/${ext === "jpg" ? "jpeg" : ext}`);
          it.src = publicR2Url(outKey);
        } else {
          it.src = undefined;
        }
      }
    }

    slides.push({ index: i + 1, items });
  }

  return {
    render: { mode: "composited", slideW: SLIDE_W, slideH: SLIDE_H, slides },
    slideImages: [],
  };
}

async function downloadPdfFromR2(key: string): Promise<Buffer> {
  const { S3Client, GetObjectCommand } = await import("@aws-sdk/client-s3");
  const accountId = process.env.R2_ACCOUNT_ID!;
  const accessKeyId = process.env.R2_ACCESS_KEY_ID!;
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY!;
  const bucket = process.env.R2_BUCKET_NAME ?? "novracademy-media";

  const client = new S3Client({
    region: "auto",
    endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
    credentials: { accessKeyId, secretAccessKey },
  });

  const response = await client.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
  const chunks: Uint8Array[] = [];
  for await (const chunk of response.Body as AsyncIterable<Uint8Array>) {
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}

/** Rejects PDFs larger than the pdf-to-slides service's 50 MB upload cap. */
function assertPdfSize(pdfBuffer: Buffer): void {
  const MAX_BYTES = 50 * 1024 * 1024;
  if (pdfBuffer.byteLength > MAX_BYTES) {
    throw new Error(`PDF is ${(pdfBuffer.byteLength / 1024 / 1024).toFixed(1)} MB — the slide engine accepts PDFs up to 50 MB.`);
  }
}

const PPTX_MIME = "application/vnd.openxmlformats-officedocument.presentationml.presentation";

function mimeForPath(remotePath: string): string {
  const ext = remotePath.split(".").pop()?.toLowerCase() ?? "";
  switch (ext) {
    case "png": return "image/png";
    case "jpg":
    case "jpeg": return "image/jpeg";
    case "svg": return "image/svg+xml";
    case "mp3": return "audio/mpeg";
    default: return "application/octet-stream";
  }
}

/**
 * Mirrors the remote deck's assets into our R2 bucket and rewrites every URL
 * in the render spec / manifest to our public CDN URLs. Returns null when the
 * remote produced no render data — callers then fall back to parsing the
 * mirrored PPTX themselves.
 */
async function mirrorDeckAssets(lessonId: string, deck: pdfToSlidesService.GeneratedDeck): Promise<{
  render: pdfToSlidesService.RenderSpec;
  slideImages: string[];
} | null> {
  const render = deck.render;
  if (!render) return null;

  const slideImages: string[] = [];
  const slidesBase = `lessons/${lessonId}/slides`;
  const deckId = deck.deckId;

  // The pdf-to-slides service serves deck assets at:
  //   /decks/<deckId>/slides/<file>   (raster slide PNGs)
  //   /decks/<deckId>/media/<file>    (composited media)
  // render.json stores relative filenames, so resolve them against the
  // correct sub-path before fetching.
  const resolveAssetUrl = (src: string, kind: "slides" | "media"): string => {
    if (/^https?:\/\//i.test(src)) return src;
    const clean = src.replace(/^\.?\//, "");
    // If it already contains a deck path, use as-is.
    if (clean.includes(`/decks/${deckId}/`)) return `/${clean}`;
    return `/decks/${encodeURIComponent(deckId)}/${kind}/${clean.split("/").pop()}`;
  };

  // Raster mode: each slide is a pre-rendered PNG (pixel-perfect, 150 DPI).
  for (const slide of render.slides) {
    if (!slide.src) continue;
    const resolved = resolveAssetUrl(slide.src, "slides");
    const buf = await withRetry(() => pdfToSlidesService.fetchDeckAsset(resolved), { label: `slide asset ${slide.src}` });
    const ext = slide.src.split(".").pop()?.toLowerCase() ?? "png";
    const key = `${slidesBase}/slides/${String(slide.index).padStart(2, "0")}.${ext}`;
    await r2Service.uploadBuffer(key, buf, mimeForPath(slide.src));
    slide.src = publicR2Url(key);
    slideImages.push(publicR2Url(key));
  }

  // Composited mode: positioned text + image items. Copy referenced media
  // into R2 and rewrite their `src` fields to public URLs.
  for (const slide of render.slides) {
    for (const item of slide.items ?? []) {
      if (item.type !== "image" || !item.src) continue;
      const resolved = resolveAssetUrl(item.src, "media");
      const buf = await withRetry(() => pdfToSlidesService.fetchDeckAsset(resolved), { label: `media asset ${item.src}` });
      const filename = item.src.split("/").pop()?.replace(/[^a-zA-Z0-9._-]/g, "_") ?? "image.bin";
      const key = `${slidesBase}/media/slide${slide.index}_${filename}`;
      await r2Service.uploadBuffer(key, buf, mimeForPath(item.src));
      item.src = publicR2Url(key);
    }
  }

  return { render, slideImages };
}

async function createSlidesGenerationRecord(
  lessonId: string,
  adminUserId: string,
  slideCount: number,
  voiceover: boolean
) {
  const lesson = await prisma.lesson.findUnique({ where: { id: lessonId } });
  if (!lesson) throw new Error("Lesson not found");
  if (lesson.type !== LessonType.PDF && lesson.type !== LessonType.SLIDES) {
    throw new Error("Only PDF and Slides lessons can generate slides");
  }
  if (!lesson.contentUrl) throw new Error("Lesson has no PDF uploaded");

  // `sourceLessonId` is unique — there can only be one generation record per
  // lesson. If one already exists (COMPLETED, FAILED, or stuck in
  // PENDING/PROCESSING), reuse it for this new request instead of trying to
  // create a duplicate row (which would hit the unique constraint).
  const existing = await prisma.slidesGeneration.findUnique({ where: { sourceLessonId: lessonId } });
  if (existing) {
    return prisma.slidesGeneration.update({
      where: { id: existing.id },
      data: {
        adminUserId,
        slideCount,
        voiceover,
        status: "PENDING",
        manifestUrl: null,
        errorMessage: null,
        deckId: null,
        generatedLessonIds: [],
        updatedAt: new Date(),
      },
    });
  }

  return prisma.slidesGeneration.create({
    data: {
      sourceLessonId: lessonId,
      courseId: lesson.courseId,
      adminUserId,
      slideCount,
      voiceover,
      status: "PENDING",
    },
  });
}

export async function createSlidesGeneration(
  lessonId: string,
  adminUserId: string,
  slideCount: number,
  voiceover: boolean
) {
  const generation = await createSlidesGenerationRecord(lessonId, adminUserId, slideCount, voiceover);

  triggerSlidesGeneration(generation.id).catch((err) => {
    console.error("Slides generation failed:", err);
    prisma.slidesGeneration.update({
      where: { id: generation.id },
      data: { status: "FAILED", errorMessage: String(err) },
    });
  });

  return generation;
}

async function triggerSlidesGeneration(generationId: string) {
  const generation = await prisma.slidesGeneration.findUnique({ where: { id: generationId } });
  if (!generation) return;

  const lesson = await prisma.lesson.findUnique({ where: { id: generation.sourceLessonId } });
  if (!lesson || !lesson.contentUrl) throw new Error("Source lesson or PDF not found");

  await prisma.slidesGeneration.update({ where: { id: generationId }, data: { status: "PROCESSING" } });

  const pdfBuffer = await downloadPdfFromR2(lesson.contentUrl);
  assertPdfSize(pdfBuffer);

  // Delegate the entire pipeline to the pdf-to-slides service. This blocks
  // until the deck is fully generated (Presenton + TTS + LibreOffice render).
  const deck = await withRetry(
    () =>
      pdfToSlidesService.generateDeckFromPDF(pdfBuffer, {
        voiceover: generation.voiceover,
        slides: generation.slideCount,
        filename: `${lesson.title.replace(/[^a-zA-Z0-9]+/g, "-") || "document"}.pdf`,
      }),
    { label: "pdf-to-slides upload", retries: 2 }
  );

  await prisma.slidesGeneration.update({ where: { id: generationId }, data: { deckId: deck.deckId } });

  // Mirror the deck's assets into our R2 and rewrite URLs to our CDN.
  // When the remote has no render data (voiceover off / renderer unavailable),
  // fall back to our own OOXML compositor so the student viewer still renders
  // slides from the mirrored PPTX.
  const mirrored = await mirrorDeckAssets(lesson.id, deck);
  let render = mirrored?.render ?? null;
  let slideImages = mirrored?.slideImages ?? [];

  // Always mirror the .pptx so the download link is stable and we own it.
  const pptxKey = `lessons/${lesson.id}/slides/deck.pptx`;
  const pptxBuffer = await withRetry(() => pdfToSlidesService.fetchDeckAsset(deck.pptxUrl), { label: "pptx download" });
  await r2Service.uploadBuffer(pptxKey, pptxBuffer, PPTX_MIME);

  // Mirror the voiceover when present.
  let audioUrl: string | null = null;
  if (deck.voiceoverUrl) {
    const audioKey = `lessons/${lesson.id}/slides/voiceover.mp3`;
    const audioBuffer = await withRetry(() => pdfToSlidesService.fetchDeckAsset(deck.voiceoverUrl!), { label: "voiceover download" });
    await r2Service.uploadBuffer(audioKey, audioBuffer, "audio/mpeg");
    audioUrl = publicR2Url(audioKey);
  }

  if (!render || slideImages.length === 0) {
    try {
      const fallback = await extractCompositedFallback(pptxBuffer, lesson.id);
      render = fallback.render;
      slideImages = fallback.slideImages;
    } catch (err) {
      console.warn("[slides] composited fallback failed, deck has no slide images:", err instanceof Error ? err.message : err);
    }
  }
  // A deck is usable when it has raster slide images OR a valid composited
  // render spec (positioned text + images). Composited decks legitimately
  // have zero PNGs — `slideImages` staying empty is not a failure on its own.
  const hasRaster = slideImages.length > 0;
  const hasComposited = !!render && render.slides.length > 0;
  if (!hasRaster && !hasComposited) {
    throw new Error("No slide images could be produced for the generated deck");
  }

  const manifestData: SlidesManifest = {
    slideImages,
    slideCount: slideImages.length || deck.slideCount,
    audioUrl,
    voiceoverEnabled: generation.voiceover,
    pptxUrl: publicR2Url(pptxKey),
    sourceLessonId: lesson.id,
    generatedAt: new Date().toISOString(),
    slidesData:
      render.mode === "composited"
        ? render.slides.map((s) => ({
            index: s.index - 1,
            items: (s.items ?? []).map((it) => ({
              type: it.type,
              color: it.color,
              src: it.src,
              x: it.x,
              y: it.y,
              w: it.w,
              h: it.h,
              text: it.text,
              fontSize: it.fontSize,
              bold: it.bold,
              align: it.align,
            })),
          }))
        : [],
    slideW: render.slideW,
    slideH: render.slideH,
    mode: render.mode,
    slideTimings: deck.manifest.slideTimings,
    remoteDeckId: deck.deckId,
  };

  const generatedLessonIds = await createSlidesLessons(generation, manifestData);

  await prisma.slidesGeneration.update({
    where: { id: generationId },
    data: { status: "COMPLETED", generatedLessonIds },
  });
}

async function createSlidesLessons(
  generation: { id: string; sourceLessonId: string; courseId: string },
  manifest: SlidesManifest
): Promise<string[]> {
  const sourceLesson = await prisma.lesson.findUnique({ where: { id: generation.sourceLessonId } });
  if (!sourceLesson) throw new Error("Source lesson not found");

  const existingGenerations = await prisma.slidesGeneration.findMany({
    where: { sourceLessonId: generation.sourceLessonId, status: "COMPLETED", id: { not: generation.id } },
  });

  for (const oldGen of existingGenerations) {
    await prisma.lesson.deleteMany({
      where: { id: { in: oldGen.generatedLessonIds } },
    });
  }

  const maxOrder = await prisma.lesson.aggregate({
    where: { courseId: generation.courseId },
    _max: { order: true },
  });
  const order = (maxOrder._max.order ?? 0) + 1;

  const lesson = await prisma.lesson.create({
    data: {
      courseId: generation.courseId,
      title: `${sourceLesson.title} — Presentation`,
      type: LessonType.SLIDES,
      order,
      slidesManifest: {
        slideImages: manifest.slideImages,
        slideCount: manifest.slideCount,
        audioUrl: manifest.audioUrl,
        voiceoverEnabled: manifest.voiceoverEnabled,
        pptxUrl: manifest.pptxUrl,
        sourceLessonId: manifest.sourceLessonId,
        generatedAt: manifest.generatedAt,
        slidesData: manifest.slidesData as unknown as Prisma.InputJsonValue,
        slideW: manifest.slideW,
        slideH: manifest.slideH,
        mode: manifest.mode,
        slideTimings: manifest.slideTimings as unknown as Prisma.InputJsonValue,
        remoteDeckId: manifest.remoteDeckId,
      },
    },
  });

  return [lesson.id];
}

export async function getSlidesGenerationStatus(lessonId: string) {
  const generation = await prisma.slidesGeneration.findUnique({ where: { sourceLessonId: lessonId } });
  if (!generation) return null;

  const progressMessages: Record<string, string> = {
    PENDING: "Waiting to start…",
    PROCESSING: "Generating slides + voiceover — this takes 1–3 minutes…",
    COMPLETED: "Done!",
    FAILED: generation.errorMessage ?? "Generation failed",
  };

  return {
    generationId: generation.id,
    status: generation.status,
    errorMessage: generation.errorMessage,
    generatedLessonIds: generation.generatedLessonIds,
    progress: progressMessages[generation.status] ?? generation.status,
  };
}

export async function getSlidesGenerationById(generationId: string) {
  return prisma.slidesGeneration.findUnique({ where: { id: generationId } });
}
