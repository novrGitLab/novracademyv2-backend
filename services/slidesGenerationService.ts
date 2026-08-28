import { prisma } from "@novr/db";
import { LessonType } from "@novr/types";
import axios from "axios";
import JSZip from "jszip";
import * as r2Service from "./r2Service";

const PDF_SLIDES_URL = process.env.PDF_SLIDES_URL ?? "http://172.236.25.61:3007";
const PRESENTON_API_KEY = process.env.PRESENTON_API_KEY ?? "";
const REQUEST_TIMEOUT_MS = Number(process.env.REQUEST_TIMEOUT_MS ?? 600_000);

export interface SlidesManifest {
  slideImages: string[];
  slideCount: number;
  audioUrl: string | null;
  voiceoverEnabled: boolean;
  pptxUrl: string;
  sourceLessonId: string;
  generatedAt: string;
}

function getAuthHeaders() {
  if (!PRESENTON_API_KEY) {
    throw new Error("PRESENTON_API_KEY environment variable is not set");
  }
  return { Authorization: `Bearer ${PRESENTON_API_KEY}` };
}

export async function createSlidesGeneration(
  lessonId: string,
  adminUserId: string,
  slideCount: number,
  voiceover: boolean
) {
  const lesson = await prisma.lesson.findUnique({ where: { id: lessonId } });
  if (!lesson) throw new Error("Lesson not found");
  if (lesson.type !== LessonType.PDF) throw new Error("Only PDF lessons can generate slides");
  if (!lesson.contentUrl) throw new Error("PDF lesson has no file uploaded");

  const existing = await prisma.slidesGeneration.findUnique({ where: { sourceLessonId: lessonId } });
  if (existing && ["PENDING", "PROCESSING"].includes(existing.status)) {
    throw new Error("A slides generation is already in progress for this lesson");
  }

  const generation = await prisma.slidesGeneration.create({
    data: {
      sourceLessonId: lessonId,
      courseId: lesson.courseId,
      adminUserId,
      slideCount,
      voiceover,
      status: "PENDING",
    },
  });

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

  const uploadFormData = new FormData();
  const pdfBlob = new Blob([pdfBuffer], { type: "application/pdf" });
  uploadFormData.append("file", pdfBlob, "document.pdf");

  const uploadResponse = await axios.post(`${PDF_SLIDES_URL}/api/v1/ppt/files/upload`, uploadFormData, {
    headers: {
      ...getAuthHeaders(),
      "Content-Type": "multipart/form-data",
    },
    timeout: REQUEST_TIMEOUT_MS,
    maxContentLength: Infinity,
    maxBodyLength: Infinity,
  });

  const uploadedFilePath = uploadResponse.data.path;
  if (!uploadedFilePath) {
    throw new Error(`File upload failed: ${JSON.stringify(uploadResponse.data)}`);
  }

  const generateResponse = await axios.post(
    `${PDF_SLIDES_URL}/api/v1/ppt/presentation/generate`,
    {
      content: "Convert this document to slides",
      files: [uploadedFilePath],
      n_slides: generation.slideCount,
      template: "general",
      export_as: "pptx",
    },
    {
      headers: getAuthHeaders(),
      timeout: REQUEST_TIMEOUT_MS,
    }
  );

  const { presentation_id, path: pptxPath } = generateResponse.data;
  if (!pptxPath) {
    throw new Error(`Presentation generation failed: ${JSON.stringify(generateResponse.data)}`);
  }

  await prisma.slidesGeneration.update({ where: { id: generationId }, data: { deckId: presentation_id } });

  const pptxBuffer = await downloadFromPresenton(pptxPath);

  const pptxKey = `lessons/${lesson.id}/slides/deck.pptx`;
  await r2Service.uploadBuffer(pptxKey, pptxBuffer, "application/vnd.openxmlformats-officedocument.presentationml.presentation");

  let audioUrl: string | null = null;
  if (generation.voiceover) {
    const audioKey = `lessons/${lesson.id}/slides/voiceover.mp3`;
    const audioBuffer = await downloadAudioFromPresenton(presentation_id);
    if (audioBuffer) {
      await r2Service.uploadBuffer(audioKey, audioBuffer, "audio/mpeg");
      audioUrl = `https://novracademy-media.r2.dev/${audioKey}`;
    }
  }

  const slideImages = await extractSlidesFromPptx(pptxBuffer, lesson.id);

  const pptxPresignedUrl = await r2Service.createViewUrl(pptxKey, "application/vnd.openxmlformats-officedocument.presentationml.presentation");
  const manifestData: SlidesManifest = {
    slideImages,
    slideCount: slideImages.length,
    audioUrl,
    voiceoverEnabled: generation.voiceover,
    pptxUrl: pptxPresignedUrl ?? `https://novracademy-media.r2.dev/${pptxKey}`,
    sourceLessonId: lesson.id,
    generatedAt: new Date().toISOString(),
  };

  const generatedLessonIds = await createSlidesLessons(generation, manifestData);

  await prisma.slidesGeneration.update({
    where: { id: generationId },
    data: { status: "COMPLETED", generatedLessonIds },
  });
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

async function downloadFromPresenton(filePath: string): Promise<Buffer> {
  const encodedPath = encodeURIComponent(filePath);
  const response = await axios.get(`${PDF_SLIDES_URL}/api/v1/ppt/files/download?path=${encodedPath}`, {
    headers: getAuthHeaders(),
    responseType: "arraybuffer",
    timeout: REQUEST_TIMEOUT_MS,
  });
  return Buffer.from(response.data);
}

async function downloadAudioFromPresenton(presentationId: string): Promise<Buffer | null> {
  try {
    const voiceoverPath = `/app_data/${presentationId}/voiceover.mp3`;
    const encodedPath = encodeURIComponent(voiceoverPath);
    const response = await axios.get(`${PDF_SLIDES_URL}/api/v1/ppt/files/download?path=${encodedPath}`, {
      headers: getAuthHeaders(),
      responseType: "arraybuffer",
      timeout: REQUEST_TIMEOUT_MS,
    });
    return Buffer.from(response.data);
  } catch {
    return null;
  }
}

async function extractSlidesFromPptx(deckBuffer: Buffer, lessonId: string): Promise<string[]> {
  const zip = await JSZip.loadAsync(deckBuffer);
  const slideUrls: string[] = [];

  const slideFiles = Object.keys(zip.files)
    .filter((name) => /^pptx\/slides\/slide\d+\.png$/.test(name))
    .sort((a, b) => {
      const numA = parseInt((a.match(/slide(\d+)/)?.[1]) ?? "0");
      const numB = parseInt((b.match(/slide(\d+)/)?.[1]) ?? "0");
      return numA - numB;
    });

  for (let i = 0; i < slideFiles.length; i++) {
    const file = zip.files[slideFiles[i]];
    const buffer = await file.async("nodebuffer");
    const key = `lessons/${lessonId}/slides/slide-${i}.png`;
    await r2Service.uploadBuffer(key, buffer, "image/png");
    slideUrls.push(`https://novracademy-media.r2.dev/${key}`);
  }

  return slideUrls;
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
  let order = (maxOrder._max.order ?? 0) + 1;

  const lessonIds: string[] = [];

  for (let i = 0; i < manifest.slideCount; i++) {
    const lesson = await prisma.lesson.create({
      data: {
        courseId: generation.courseId,
        title: `${sourceLesson.title} — Slide ${i + 1}`,
        type: LessonType.SLIDES,
        order: order++,
        slidesManifest: {
          slideImages: manifest.slideImages,
          slideCount: manifest.slideCount,
          audioUrl: manifest.audioUrl,
          voiceoverEnabled: manifest.voiceoverEnabled,
          pptxUrl: manifest.pptxUrl,
          sourceLessonId: manifest.sourceLessonId,
          generatedAt: manifest.generatedAt,
        },
      },
    });
    lessonIds.push(lesson.id);
  }

  return lessonIds;
}

export async function getSlidesGenerationStatus(lessonId: string) {
  const generation = await prisma.slidesGeneration.findUnique({ where: { sourceLessonId: lessonId } });
  if (!generation) return null;

  const progressMessages: Record<string, string> = {
    PENDING: "Waiting to start…",
    PROCESSING: "Generating slides…",
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
