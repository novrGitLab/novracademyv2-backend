import { GetObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
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
