import { DeleteObjectCommand, GetObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

const bucket = process.env.R2_BUCKET_NAME ?? "novracademy-media";

let s3Client: S3Client | null | undefined;

function getClient(): S3Client | null {
  if (s3Client === undefined) {
    const accountId = process.env.R2_ACCOUNT_ID;
    const accessKeyId = process.env.R2_ACCESS_KEY_ID;
    const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY;
    s3Client =
      accountId && accessKeyId && secretAccessKey
        ? new S3Client({
            region: "auto",
            endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
            credentials: { accessKeyId, secretAccessKey },
          })
        : null;
  }
  if (!s3Client) {
    console.warn("R2 storage is not configured (R2_ACCOUNT_ID / R2_ACCESS_KEY_ID / R2_SECRET_ACCESS_KEY missing).");
  }
  return s3Client;
}

const UPLOAD_URL_TTL_SECONDS = 15 * 60;
const VIEW_URL_TTL_SECONDS = 5 * 60;

export function pdfObjectKey(lessonId: string) {
  return `lessons/${lessonId}/document.pdf`;
}

export function certificateObjectKey(certUid: string) {
  return `certificates/${certUid}.pdf`;
}

/** Server already has the file bytes (generated PDFs) — upload directly, no presigned round-trip needed. */
export async function uploadBuffer(key: string, body: Buffer, contentType: string): Promise<string | null> {
  const client = getClient();
  if (!client) return null;
  await client.send(new PutObjectCommand({ Bucket: bucket, Key: key, Body: body, ContentType: contentType }));
  return key;
}

/** Presigned PUT URL — the browser uploads the PDF straight to R2. */
export async function createPdfUploadUrl(lessonId: string): Promise<{ key: string; uploadUrl: string } | null> {
  const client = getClient();
  if (!client) return null;
  const key = pdfObjectKey(lessonId);
  const command = new PutObjectCommand({ Bucket: bucket, Key: key, ContentType: "application/pdf" });
  const uploadUrl = await getSignedUrl(client, command, { expiresIn: UPLOAD_URL_TTL_SECONDS });
  return { key, uploadUrl };
}

/**
 * Presigned GET URL for viewing a PDF in-browser. Short-lived and
 * content-disposition "inline" so it opens in the viewer rather than
 * prompting a download — the viewer additionally never surfaces this URL
 * as a clickable link unless the lesson has downloads enabled.
 */
export async function createPdfViewUrl(key: string): Promise<string | null> {
  return createViewUrl(key, "application/pdf");
}

/** Presigned PUT URL for any content type — event recordings, etc. */
export async function createGenericUploadUrl(key: string, contentType: string): Promise<string | null> {
  const client = getClient();
  if (!client) return null;
  const command = new PutObjectCommand({ Bucket: bucket, Key: key, ContentType: contentType });
  return getSignedUrl(client, command, { expiresIn: UPLOAD_URL_TTL_SECONDS });
}

/** Presigned GET URL for any content type, inline disposition. */
export async function createViewUrl(key: string, contentType: string): Promise<string | null> {
  const client = getClient();
  if (!client) return null;
  const command = new GetObjectCommand({
    Bucket: bucket,
    Key: key,
    ResponseContentDisposition: "inline",
    ResponseContentType: contentType,
  });
  return getSignedUrl(client, command, { expiresIn: VIEW_URL_TTL_SECONDS });
}

/** Whether R2 credentials are present — used by the admin storage settings page. */
export function isConfigured(): boolean {
  return Boolean(getClient());
}

export function getStatus() {
  return {
    configured: isConfigured(),
    bucketName: bucket,
    accountId: process.env.R2_ACCOUNT_ID ? `${process.env.R2_ACCOUNT_ID.slice(0, 4)}…${process.env.R2_ACCOUNT_ID.slice(-4)}` : null,
    publicUrl: process.env.R2_PUBLIC_URL || null,
  };
}

/**
 * Round-trips a tiny throwaway object through R2 (put, then delete) to
 * confirm the configured credentials actually work — not just that env
 * vars are non-empty, since a typo'd key/secret would otherwise only
 * surface as a mysterious failure on someone's first real upload.
 */
export async function testConnection(): Promise<{ ok: boolean; message: string }> {
  const client = getClient();
  if (!client) {
    return { ok: false, message: "R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, or R2_SECRET_ACCESS_KEY is missing." };
  }
  const key = `_connection-test/${Date.now()}.txt`;
  try {
    await client.send(
      new PutObjectCommand({ Bucket: bucket, Key: key, Body: Buffer.from("novr academy connection test"), ContentType: "text/plain" })
    );
    await client.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }));
    return { ok: true, message: `Connected — wrote and deleted a test object in "${bucket}".` };
  } catch (err) {
    return { ok: false, message: err instanceof Error ? err.message : "Connection test failed" };
  }
}
