import { prisma } from "@/lib/db/prisma";
import type { Prisma } from "@prisma/client";

export const auditLogRepository = {
  record(entry: {
    organizationId?: string | null;
    actorUserId?: string | null;
    action: string;
    entityType: string;
    entityId?: string | null;
    metadata?: Prisma.InputJsonValue;
    ipAddress?: string | null;
  }) {
    return prisma.auditLog.create({ data: entry });
  },

  listForOrganization(organizationId: string, take = 50, cursor?: string) {
    return prisma.auditLog.findMany({
      where: { organizationId },
      orderBy: { createdAt: "desc" },
      take,
      ...(cursor && { skip: 1, cursor: { id: cursor } }),
      include: { actor: { select: { email: true, firstName: true, lastName: true } } },
    });
  },
};
