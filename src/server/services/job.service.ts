import { prisma } from "@/lib/db/prisma";
import type { Prisma } from "@prisma/client";

/** Keeps the Job table (what the UI/admin sees) in lockstep with BullMQ reality. */
export const jobService = {
  markActive(jobId: string) {
    return prisma.job.update({
      where: { id: jobId },
      data: { status: "ACTIVE", startedAt: new Date(), attempts: { increment: 1 } },
    });
  },

  markCompleted(jobId: string, result?: Prisma.InputJsonValue) {
    return prisma.job.update({
      where: { id: jobId },
      data: { status: "COMPLETED", finishedAt: new Date(), ...(result !== undefined && { result }) },
    });
  },

  markFailed(jobId: string, error: string) {
    return prisma.job.update({
      where: { id: jobId },
      data: { status: "FAILED", finishedAt: new Date(), error: error.slice(0, 2000) },
    });
  },

  /** Create the DB mirror + payload for a follow-on pipeline stage. */
  createStage(data: {
    organizationId: string;
    documentId: string;
    queue: string;
    name: string;
  }) {
    return prisma.job.create({
      data: {
        organizationId: data.organizationId,
        documentId: data.documentId,
        queue: data.queue,
        name: data.name,
        payload: { documentId: data.documentId, organizationId: data.organizationId },
      },
    });
  },
};
