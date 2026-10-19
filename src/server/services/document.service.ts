import { documentRepository } from "@/server/repositories/document.repository";
import { auditLogRepository } from "@/server/repositories/audit-log.repository";
import { prisma } from "@/lib/db/prisma";
import { buildDocumentKey, createSignedUploadUrl, deleteObject } from "@/lib/storage/s3";
import { documentProcessingQueue } from "@/lib/queue/queues";
import { QUEUE_NAMES } from "@/config/constants";
import { logger } from "@/lib/utils/logger";
import type { UploadFileInput, ListDocumentsInput } from "@/lib/validation/documents";

export class DocumentServiceError extends Error {
  constructor(
    message: string,
    public readonly status: 400 | 402 | 404 | 409
  ) {
    super(message);
    this.name = "DocumentServiceError";
  }
}

export const documentService = {
  /**
   * Stage 1 of upload: create Document rows and hand back short-lived
   * presigned PUT URLs. The browser uploads bytes directly to storage —
   * the API never proxies file content.
   */
  async createPendingUploads(organizationId: string, userId: string, files: UploadFileInput[]) {
    const { billingService } = await import("./billing.service");
    const entitlements = await billingService.getEntitlements(organizationId);
    if (!entitlements.canProcess) {
      throw new DocumentServiceError(
        "Your subscription is inactive — reactivate it in Settings → Billing to upload documents",
        402
      );
    }
    if (entitlements.documentsUsedThisMonth + files.length > entitlements.documentsPerMonth) {
      const remaining = Math.max(0, entitlements.documentsPerMonth - entitlements.documentsUsedThisMonth);
      throw new DocumentServiceError(
        `Monthly document limit reached (${entitlements.documentsPerMonth} on ${entitlements.plan}) — ${remaining} remaining. Upgrade in Settings → Billing.`,
        402
      );
    }
    return Promise.all(
      files.map(async (file) => {
        const storageKey = buildDocumentKey(organizationId, file.filename);
        const [document, uploadUrl] = await Promise.all([
          documentRepository.create({
            organizationId,
            uploadedById: userId,
            filename: file.filename,
            storageKey,
            mimeType: file.mimeType,
            sizeBytes: file.sizeBytes,
          }),
          createSignedUploadUrl(storageKey, file.mimeType),
        ]);
        return { documentId: document.id, uploadUrl };
      })
    );
  },

  /**
   * Stage 2: the browser confirms its PUT succeeded. Enqueue the processing
   * pipeline and mirror the job for the UI. Idempotent per document.
   */
  async completeUpload(organizationId: string, userId: string, documentId: string) {
    const document = await documentRepository.findById(organizationId, documentId);
    if (!document) throw new DocumentServiceError("Document not found", 404);
    if (document.status !== "UPLOADED") {
      throw new DocumentServiceError("Document is already processing", 409);
    }

    const existingJob = await prisma.job.findFirst({
      where: { documentId, queue: QUEUE_NAMES.DOCUMENT_PROCESSING, status: { in: ["QUEUED", "ACTIVE"] } },
    });
    if (existingJob) return { documentId, jobId: existingJob.id };

    const job = await prisma.job.create({
      data: {
        organizationId,
        documentId,
        queue: QUEUE_NAMES.DOCUMENT_PROCESSING,
        name: "process-document",
        payload: { documentId, organizationId },
      },
    });

    const bullJob = await documentProcessingQueue.add("process-document", {
      documentId,
      organizationId,
      jobId: job.id,
    });
    await prisma.job.update({ where: { id: job.id }, data: { bullJobId: bullJob.id } });

    await auditLogRepository.record({
      organizationId,
      actorUserId: userId,
      action: "document.uploaded",
      entityType: "Document",
      entityId: documentId,
      metadata: { filename: document.filename, sizeBytes: document.sizeBytes },
    });

    logger.info({ documentId, jobId: job.id }, "Document queued for processing");
    return { documentId, jobId: job.id };
  },

  async list(organizationId: string, input: ListDocumentsInput) {
    const { items, total } = await documentRepository.list(organizationId, input);
    return {
      items: items.map((d) => ({
        id: d.id,
        filename: d.filename,
        mimeType: d.mimeType,
        sizeBytes: d.sizeBytes,
        type: d.type,
        status: d.status,
        totalAmount: d.totalAmount?.toFixed(2) ?? null,
        currency: d.currency,
        documentDate: d.documentDate?.toISOString() ?? null,
        vendorName: d.vendor?.name ?? null,
        uploadedBy: d.uploadedBy ? [d.uploadedBy.firstName, d.uploadedBy.lastName].filter(Boolean).join(" ") : null,
        createdAt: d.createdAt.toISOString(),
      })),
      total,
      page: input.page,
      pageSize: input.pageSize,
      hasMore: input.page * input.pageSize < total,
    };
  },

  /** Delete a document, its storage object, and cascade rows. Posted docs are immutable. */
  async remove(organizationId: string, userId: string, documentId: string) {
    const document = await documentRepository.findById(organizationId, documentId);
    if (!document) throw new DocumentServiceError("Document not found", 404);
    if (document.status === "POSTED") {
      throw new DocumentServiceError("Posted documents can't be deleted — reverse the journal entry instead", 409);
    }

    await deleteObject(document.storageKey).catch((err) =>
      logger.warn({ err, storageKey: document.storageKey }, "Storage delete failed — continuing")
    );
    await documentRepository.delete(organizationId, documentId);
    await auditLogRepository.record({
      organizationId,
      actorUserId: userId,
      action: "document.deleted",
      entityType: "Document",
      entityId: documentId,
      metadata: { filename: document.filename },
    });
  },
};
