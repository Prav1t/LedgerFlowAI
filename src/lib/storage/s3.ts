import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { nanoid } from "nanoid";
import { env } from "@/config/env";

const s3 = new S3Client({
  region: env.S3_REGION,
  ...(env.S3_ENDPOINT && { endpoint: env.S3_ENDPOINT }),
  forcePathStyle: env.S3_FORCE_PATH_STYLE,
  credentials: {
    accessKeyId: env.S3_ACCESS_KEY_ID,
    secretAccessKey: env.S3_SECRET_ACCESS_KEY,
  },
});

/** Object keys are namespaced by org so IAM/lifecycle rules can scope per tenant. */
export function buildDocumentKey(orgId: string, filename: string): string {
  const safe = filename.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 120);
  return `orgs/${orgId}/documents/${nanoid(12)}/${safe}`;
}

/** Presigned PUT — the browser uploads directly to storage; the API never proxies bytes. */
export async function createSignedUploadUrl(key: string, contentType: string, expiresIn = 600) {
  const command = new PutObjectCommand({ Bucket: env.S3_BUCKET, Key: key, ContentType: contentType });
  return getSignedUrl(s3, command, { expiresIn });
}

export async function createSignedDownloadUrl(key: string, expiresIn = 300) {
  const command = new GetObjectCommand({ Bucket: env.S3_BUCKET, Key: key });
  return getSignedUrl(s3, command, { expiresIn });
}

export async function getObjectBuffer(key: string): Promise<Buffer> {
  const response = await s3.send(new GetObjectCommand({ Bucket: env.S3_BUCKET, Key: key }));
  const bytes = await response.Body?.transformToByteArray();
  if (!bytes) throw new Error(`Empty object body for key ${key}`);
  return Buffer.from(bytes);
}

export async function deleteObject(key: string): Promise<void> {
  await s3.send(new DeleteObjectCommand({ Bucket: env.S3_BUCKET, Key: key }));
}
