import { describe, it, expect, beforeAll } from "vitest";

beforeAll(() => {
  // 32-byte base64 key for tests only.
  process.env.FIELD_ENCRYPTION_KEY = Buffer.alloc(32, 7).toString("base64");
  process.env.DATABASE_URL = "postgresql://t:t@localhost:5432/t";
  process.env.REDIS_URL = "redis://localhost:6379";
  process.env.CLERK_SECRET_KEY = "sk_test";
  process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY = "pk_test";
  process.env.S3_ACCESS_KEY_ID = "t";
  process.env.S3_SECRET_ACCESS_KEY = "t";
  process.env.S3_BUCKET = "t";
  process.env.OPENAI_API_KEY = "t";
  process.env.ANTHROPIC_API_KEY = "t";
  process.env.STRIPE_SECRET_KEY = "t";
});

describe("field encryption", () => {
  it("round-trips plaintext", async () => {
    const { encryptField, decryptField } = await import("@/lib/utils/crypto");
    const secret = "021000021-1234567890";
    const cipher = encryptField(secret);
    expect(cipher).not.toContain(secret);
    expect(decryptField(cipher)).toBe(secret);
  });

  it("produces unique ciphertexts per call (random IV)", async () => {
    const { encryptField } = await import("@/lib/utils/crypto");
    expect(encryptField("same")).not.toBe(encryptField("same"));
  });

  it("masks sensitive values for display", async () => {
    const { maskSensitive } = await import("@/lib/utils/crypto");
    expect(maskSensitive("1234567890")).toBe("••••••7890");
    expect(maskSensitive("123")).toBe("****");
  });
});
