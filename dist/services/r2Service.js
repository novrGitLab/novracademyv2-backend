"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.pdfObjectKey = pdfObjectKey;
exports.certificateObjectKey = certificateObjectKey;
exports.uploadBuffer = uploadBuffer;
exports.createPdfUploadUrl = createPdfUploadUrl;
exports.createPdfViewUrl = createPdfViewUrl;
exports.createGenericUploadUrl = createGenericUploadUrl;
exports.createViewUrl = createViewUrl;
const client_s3_1 = require("@aws-sdk/client-s3");
const s3_request_presigner_1 = require("@aws-sdk/s3-request-presigner");
const bucket = process.env.R2_BUCKET_NAME ?? "novracademy-media";
let s3Client;
function getClient() {
    if (s3Client === undefined) {
        const accountId = process.env.R2_ACCOUNT_ID;
        const accessKeyId = process.env.R2_ACCESS_KEY_ID;
        const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY;
        s3Client =
            accountId && accessKeyId && secretAccessKey
                ? new client_s3_1.S3Client({
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
function pdfObjectKey(lessonId) {
    return `lessons/${lessonId}/document.pdf`;
}
function certificateObjectKey(certUid) {
    return `certificates/${certUid}.pdf`;
}
/** Server already has the file bytes (generated PDFs) — upload directly, no presigned round-trip needed. */
async function uploadBuffer(key, body, contentType) {
    const client = getClient();
    if (!client)
        return null;
    await client.send(new client_s3_1.PutObjectCommand({ Bucket: bucket, Key: key, Body: body, ContentType: contentType }));
    return key;
}
/** Presigned PUT URL — the browser uploads the PDF straight to R2. */
async function createPdfUploadUrl(lessonId) {
    const client = getClient();
    if (!client)
        return null;
    const key = pdfObjectKey(lessonId);
    const command = new client_s3_1.PutObjectCommand({ Bucket: bucket, Key: key, ContentType: "application/pdf" });
    const uploadUrl = await (0, s3_request_presigner_1.getSignedUrl)(client, command, { expiresIn: UPLOAD_URL_TTL_SECONDS });
    return { key, uploadUrl };
}
/**
 * Presigned GET URL for viewing a PDF in-browser. Short-lived and
 * content-disposition "inline" so it opens in the viewer rather than
 * prompting a download — the viewer additionally never surfaces this URL
 * as a clickable link unless the lesson has downloads enabled.
 */
async function createPdfViewUrl(key) {
    return createViewUrl(key, "application/pdf");
}
/** Presigned PUT URL for any content type — event recordings, etc. */
async function createGenericUploadUrl(key, contentType) {
    const client = getClient();
    if (!client)
        return null;
    const command = new client_s3_1.PutObjectCommand({ Bucket: bucket, Key: key, ContentType: contentType });
    return (0, s3_request_presigner_1.getSignedUrl)(client, command, { expiresIn: UPLOAD_URL_TTL_SECONDS });
}
/** Presigned GET URL for any content type, inline disposition. */
async function createViewUrl(key, contentType) {
    const client = getClient();
    if (!client)
        return null;
    const command = new client_s3_1.GetObjectCommand({
        Bucket: bucket,
        Key: key,
        ResponseContentDisposition: "inline",
        ResponseContentType: contentType,
    });
    return (0, s3_request_presigner_1.getSignedUrl)(client, command, { expiresIn: VIEW_URL_TTL_SECONDS });
}
