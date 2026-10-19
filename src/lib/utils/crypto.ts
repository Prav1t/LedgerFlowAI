import { createCipheriv, createDecipheriv, randomBytes } from "crypto";
import { env } from "@/config/env";

/**
 * AES-256-GCM field-level encryption for sensitive values
 * (bank account numbers, routing numbers, API secrets).
 * Ciphertext format: base64(iv).base64(authTag).base64(data)
 */
const ALGO = "aes-256-gcm";

function key(): Buffer {
  const k = Buffer.from(env.FIELD_ENCRYPTION_KEY, "base64");
  if (k.length !== 32) throw new Error("FIELD_ENCRYPTION_KEY must be 32 bytes, base64-encoded");
  return k;
}

export function encryptField(plaintext: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv(ALGO, key(), iv);
  const data = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  return [iv, cipher.getAuthTag(), data].map((b) => b.toString("base64")).join(".");
}

export function decryptField(ciphertext: string): string {
  const [ivB64, tagB64, dataB64] = ciphertext.split(".");
  if (!ivB64 || !tagB64 || !dataB64) throw new Error("Malformed ciphertext");
  const decipher = createDecipheriv(ALGO, key(), Buffer.from(ivB64, "base64"));
  decipher.setAuthTag(Buffer.from(tagB64, "base64"));
  return Buffer.concat([decipher.update(Buffer.from(dataB64, "base64")), decipher.final()]).toString("utf8");
}

/** Mask all but the last 4 characters for display. */
export function maskSensitive(value: string): string {
  if (value.length <= 4) return "****";
  return "•".repeat(value.length - 4) + value.slice(-4);
}
