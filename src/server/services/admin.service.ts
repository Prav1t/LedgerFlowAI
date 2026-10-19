import { prisma } from "@/lib/db/prisma";
import { PLAN_CONFIG } from "@/lib/stripe/plans";

/** Platform-wide metrics for the /admin panel. Platform-admin gated at the route. */
export async function getPlatformMetrics() {
  const dayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const monthAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

  const [
    organizations,
    users,
    documentsTotal,
    documents30d,
    documentsFailed30d,
    jobsByStatus,
    recentFailedJobs,
    subscriptionsByPlan,
    aiMessages30d,
  ] = await Promise.all([
    prisma.organization.count(),
    prisma.user.count(),
    prisma.document.count(),
    prisma.document.count({ where: { createdAt: { gte: monthAgo } } }),
    prisma.document.count({ where: { status: "FAILED", updatedAt: { gte: monthAgo } } }),
    prisma.job.groupBy({ by: ["status"], where: { updatedAt: { gte: dayAgo } }, _count: true }),
    prisma.job.findMany({
      where: { status: "FAILED", updatedAt: { gte: dayAgo } },
      orderBy: { updatedAt: "desc" },
      take: 10,
      select: {
        id: true,
        queue: true,
        name: true,
        error: true,
        updatedAt: true,
        organization: { select: { name: true } },
      },
    }),
    prisma.subscription.groupBy({ by: ["plan"], where: { status: "ACTIVE" }, _count: true }),
    prisma.aiChatMessage.count({ where: { createdAt: { gte: monthAgo }, role: "ASSISTANT" } }),
  ]);

  // MRR estimate from active plans at list price.
  const PRICE: Record<string, number> = { STARTER: 29, PROFESSIONAL: 99, FIRM: 299 };
  const mrr = subscriptionsByPlan.reduce((acc, s) => acc + (PRICE[s.plan] ?? 0) * s._count, 0);

  return {
    organizations,
    users,
    documents: { total: documentsTotal, last30d: documents30d, failed30d: documentsFailed30d },
    jobs24h: Object.fromEntries(jobsByStatus.map((j) => [j.status, j._count])),
    recentFailedJobs: recentFailedJobs.map((j) => ({
      id: j.id,
      queue: j.queue,
      name: j.name,
      error: j.error,
      organization: j.organization?.name ?? "—",
      at: j.updatedAt.toISOString(),
    })),
    revenue: {
      mrrEstimate: mrr,
      activeByPlan: Object.fromEntries(
        subscriptionsByPlan.map((s) => [PLAN_CONFIG[s.plan].name, s._count])
      ),
    },
    aiUsage: { copilotReplies30d: aiMessages30d },
  };
}
