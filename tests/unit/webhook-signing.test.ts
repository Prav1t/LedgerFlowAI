import { describe, it, expect } from "vitest";
import { createHmac } from "crypto";
import { signWebhookPayload, WEBHOOK_EVENTS } from "@/server/services/webhook-signing";
import { buildOpenApiSpec } from "@/lib/utils/openapi-spec";

describe("webhook signing", () => {
  it("computes HMAC-SHA256 over timestamp.body", () => {
    const secret = "whsec_test";
    const timestamp = "1760000000";
    const body = '{"event":"document.posted"}';
    const expected = createHmac("sha256", secret).update(`${timestamp}.${body}`).digest("hex");
    expect(signWebhookPayload(secret, timestamp, body)).toBe(expected);
  });

  it("changes when any input changes (receiver can verify integrity)", () => {
    const base = signWebhookPayload("s", "1", "{}");
    expect(signWebhookPayload("s2", "1", "{}")).not.toBe(base);
    expect(signWebhookPayload("s", "2", "{}")).not.toBe(base);
    expect(signWebhookPayload("s", "1", "{ }")).not.toBe(base);
  });

  it("exposes a stable event catalog", () => {
    expect(WEBHOOK_EVENTS).toContain("document.posted");
    expect(WEBHOOK_EVENTS).toContain("document.review_ready");
    expect(WEBHOOK_EVENTS).toContain("document.failed");
  });
});

describe("openapi spec", () => {
  const spec = buildOpenApiSpec("https://app.example.com");

  it("is OpenAPI 3.x with a versioned server URL", () => {
    expect(spec.openapi).toMatch(/^3\./);
    expect(spec.servers[0]!.url).toBe("https://app.example.com/api/v1");
  });

  it("documents the core resources", () => {
    const paths = Object.keys(spec.paths);
    for (const required of [
      "/documents",
      "/documents/upload-url",
      "/documents/{id}/approve",
      "/journal-entries",
      "/journal-entries/{id}/reverse",
      "/reports/{type}",
      "/webhook-endpoints",
    ]) {
      expect(paths).toContain(required);
    }
  });
});
