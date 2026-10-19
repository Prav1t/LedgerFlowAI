import { describe, it, expect } from "vitest";
import { uploadFileSchema, uploadRequestSchema, listDocumentsSchema } from "@/lib/validation/documents";
import { DOCUMENT_MAX_SIZE_BYTES } from "@/config/constants";

describe("upload validation", () => {
  const valid = { filename: "invoice.pdf", mimeType: "application/pdf", sizeBytes: 1024 };

  it("accepts a valid PDF", () => {
    expect(uploadFileSchema.safeParse(valid).success).toBe(true);
  });

  it("rejects unsupported mime types", () => {
    expect(uploadFileSchema.safeParse({ ...valid, mimeType: "application/zip" }).success).toBe(false);
    expect(uploadFileSchema.safeParse({ ...valid, mimeType: "text/javascript" }).success).toBe(false);
  });

  it("rejects files over the size cap and non-positive sizes", () => {
    expect(uploadFileSchema.safeParse({ ...valid, sizeBytes: DOCUMENT_MAX_SIZE_BYTES + 1 }).success).toBe(false);
    expect(uploadFileSchema.safeParse({ ...valid, sizeBytes: 0 }).success).toBe(false);
  });

  it("rejects path traversal in filenames", () => {
    expect(uploadFileSchema.safeParse({ ...valid, filename: "../../etc/passwd" }).success).toBe(false);
    expect(uploadFileSchema.safeParse({ ...valid, filename: "a\\b.pdf" }).success).toBe(false);
  });

  it("caps batches at 20 files and requires at least one", () => {
    expect(uploadRequestSchema.safeParse({ files: [] }).success).toBe(false);
    expect(uploadRequestSchema.safeParse({ files: Array(21).fill(valid) }).success).toBe(false);
    expect(uploadRequestSchema.safeParse({ files: Array(20).fill(valid) }).success).toBe(true);
  });
});

describe("list query validation", () => {
  it("applies defaults and coerces strings", () => {
    const parsed = listDocumentsSchema.parse({});
    expect(parsed).toMatchObject({ page: 1, pageSize: 25 });
    expect(listDocumentsSchema.parse({ page: "3" }).page).toBe(3);
  });

  it("rejects unknown statuses and oversized pages", () => {
    expect(listDocumentsSchema.safeParse({ status: "BOGUS" }).success).toBe(false);
    expect(listDocumentsSchema.safeParse({ pageSize: "500" }).success).toBe(false);
  });
});
