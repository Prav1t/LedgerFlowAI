import { NextResponse } from "next/server";
import { withAuth } from "@/lib/auth/api-guard";
import { automationsQueue } from "@/lib/queue/queues";
import { jobService } from "@/server/services/job.service";
import { prisma } from "@/lib/db/prisma";
import { QUEUE_NAMES } from "@/config/constants";
import { ok } from "@/lib/utils/api-response";

/** POST /api/v1/automations/run — enqueue a full sweep for this org, on demand. */
export const POST = withAuth(
  async (_req, ctx): Promise<NextResponse> => {
    const job = await prisma.job.create({
      data: {
        organizationId: ctx.organizationId,
        queue: QUEUE_NAMES.AUTOMATIONS,
        name: "run-sweep",
        payload: { kind: "run-sweep", organizationId: ctx.organizationId },
      },
    });
    const bullJob = await automationsQueue.add("run-sweep", {
      kind: "run-sweep",
      organizationId: ctx.organizationId,
      jobId: job.id,
    });
    await jobService
      .markActive(job.id)
      .catch(() => {}); // markActive happens in worker too; ensure row shows movement fast
    await prisma.job.update({ where: { id: job.id }, data: { bullJobId: bullJob.id, status: "QUEUED" } });
    return ok({ jobId: job.id, queued: true });
  },
  { permission: "automations:manage", rateLimit: { limit: 10, windowSeconds: 60 } }
);
