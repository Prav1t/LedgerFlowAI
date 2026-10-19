import { prisma } from "@/lib/db/prisma";
import type { DocumentStatus, DocumentType, Prisma } from "@prisma/client";

/** Every query takes organizationId — tenancy enforced by signature. */
export const documentRepository = {
  create(data: {
    organizationId: string;
    uploadedById: string;
    filename: string;
    storageKey: string;
    mimeType: string;
    sizeBytes: number;
  }) {
    return prisma.document.create({ data });
  },

  findById(organizationId: string, id: string) {
    return prisma.document.findFirst({
      where: { id, organizationId },
      include: {
        fields: { orderBy: { key: "asc" } },
        vendor: true,
        uploadedBy: { select: { firstName: true, lastName: true, email: true } },
        journalEntry: { select: { id: true, entryNumber: true, status: true } },
      },
    });
  },

  async list(
    organizationId: string,
    opts: { page: number; pageSize: number; status?: DocumentStatus; type?: DocumentType; q?: string }
  ) {
    const where: Prisma.DocumentWhereInput = {
      organizationId,
      ...(opts.status && { status: opts.status }),
      ...(opts.type && { type: opts.type }),
      ...(opts.q && { filename: { contains: opts.q, mode: "insensitive" } }),
    };
    const [items, total] = await Promise.all([
      prisma.document.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip: (opts.page - 1) * opts.pageSize,
        take: opts.pageSize,
        include: {
          uploadedBy: { select: { firstName: true, lastName: true } },
          vendor: { select: { name: true } },
        },
      }),
      prisma.document.count({ where }),
    ]);
    return { items, total };
  },

  updateStatus(organizationId: string, id: string, status: DocumentStatus, extra?: Prisma.DocumentUpdateInput) {
    return prisma.document.update({
      where: { id, organizationId },
      data: { status, ...extra },
    });
  },

  delete(organizationId: string, id: string) {
    return prisma.document.delete({ where: { id, organizationId } });
  },
};
