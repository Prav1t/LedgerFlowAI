import { Worker, type Job as BullJob } from "bullmq";
import { QUEUE_NAMES } from "@/config/constants";
import { createQueueConnection } from "@/lib/redis/client";
import { automationsQueue } from "@/lib/queue/queues";
import { automationService } from "@/server/services/automation.service";
import { jobService } from "@/server/services/job.service";
import { logger } from "@/lib/utils/logger";
import { onShutdown } from "../index";

type AutomationJobPayload =
  | { kind: "post-extraction"; organizationId: string; documentId: string; jobId?: string }
  | { kind: "run-sweep"; organizationId: string; jobId?: string }
  | { kind: "daily-reminders" }
  | { kind: "month-end" };

async function process(job: BullJob<AutomationJobPayload>): Promise<void> {
  const payload = job.data;
  if ("jobId" in payload && payload.jobId) await jobService.markActive(payload.jobId);

  switch (payload.kind) {
    case "post-extraction": {
      const result = await automationService.runPostExtraction(payload.organizationId, payload.documentId);
      if (payload.jobId) await jobService.markCompleted(payload.jobId, result);
      return;
    }
    case "run-sweep": {
      const result = {
        categorized: await automationService.autoCategorize(payload.organizationId),
        matched: await automationService.matchReceipts(payload.organizationId),
        recurring: await automationService.detectRecurring(payload.organizationId),
      };
      if (payload.jobId) await jobService.markCompleted(payload.jobId, result);
      return;
    }
    case "daily-reminders":
      return automationService.dailyReminders();
    case "month-end":
      return automationService.monthEndChecklist();
  }
}

export async function registerAutomationsWorker(): Promise<Worker<AutomationJobPayload>> {
  const worker = new Worker<AutomationJobPayload>(QUEUE_NAMES.AUTOMATIONS, process, {
    connection: createQueueConnection(),
    concurrency: 2,
  });

  worker.on("failed", (job, err) => {
    logger.error({ kind: job?.data.kind, err: err.message }, "Automation job failed");
    const jobId = job?.data && "jobId" in job.data ? job.data.jobId : undefined;
    if (jobId && job && job.attemptsMade >= (job.opts.attempts ?? 1)) {
      void jobService.markFailed(jobId, err.message).catch(() => {});
    }
  });
  worker.on("error", (err) => logger.error(err, "Automations worker error"));

  // Scheduled sweeps — upserted by jobId so restarts don't duplicate schedules.
  await automationsQueue.add(
    "daily-reminders",
    { kind: "daily-reminders" },
    { repeat: { pattern: "0 13 * * *" }, jobId: "schedule:daily-reminders" } // 13:00 UTC daily
  );
  await automationsQueue.add(
    "month-end",
    { kind: "month-end" },
    { repeat: { pattern: "0 14 1 * *" }, jobId: "schedule:month-end" } // 1st of month
  );

  onShutdown(async () => {
    await worker.close();
  });

  logger.info("Automations worker registered (queue: %s) with schedules", QUEUE_NAMES.AUTOMATIONS);
  return worker;
}

void registerAutomationsWorker();
