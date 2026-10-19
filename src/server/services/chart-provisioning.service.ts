import { prisma } from "@/lib/db/prisma";
import { DEFAULT_CHART } from "@/server/accounting-engine/default-chart";
import { logger } from "@/lib/utils/logger";

/**
 * Provision the default chart of accounts for a new organization.
 * Idempotent: skips if the org already has any accounts, so webhook
 * retries and re-runs are safe. Two passes resolve parent links since
 * templates reference parents by code.
 */
export async function provisionDefaultChart(organizationId: string): Promise<number> {
  const existing = await prisma.account.count({ where: { organizationId } });
  if (existing > 0) {
    logger.debug({ organizationId }, "Chart already provisioned — skipping");
    return 0;
  }

  return prisma.$transaction(async (tx) => {
    await tx.account.createMany({
      data: DEFAULT_CHART.map((a) => ({
        organizationId,
        code: a.code,
        name: a.name,
        type: a.type,
        subtype: a.subtype,
        isSystem: a.isSystem ?? false,
      })),
    });

    const accounts = await tx.account.findMany({
      where: { organizationId },
      select: { id: true, code: true },
    });
    const byCode = new Map(accounts.map((a) => [a.code, a.id]));

    for (const template of DEFAULT_CHART) {
      if (!template.parentCode) continue;
      const parentId = byCode.get(template.parentCode);
      const childId = byCode.get(template.code);
      if (parentId && childId) {
        await tx.account.update({ where: { id: childId }, data: { parentId } });
      }
    }

    logger.info({ organizationId, count: DEFAULT_CHART.length }, "Default chart provisioned");
    return DEFAULT_CHART.length;
  });
}
