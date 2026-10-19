/**
 * Worker entrypoint — runs as a separate process (Railway service / Docker container),
 * never inside the Next.js server. `npm run worker` in production, `worker:dev` locally.
 *
 * Individual processors are registered here as they're built in later phases:
 *   Phase 6 → OCR worker
 *   Phase 7 → AI extraction worker
 *   Phase 8 → Journal posting worker
 *   Phase 11 → Automations worker
 */
import { logger } from "@/lib/utils/logger";

const shutdownHandlers: Array<() => Promise<void>> = [];

export function onShutdown(handler: () => Promise<void>) {
  shutdownHandlers.push(handler);
}

async function main() {
  logger.info("LedgerFlow worker process starting");

  // Processors self-register via side-effect imports:
  await import("./processors/ocr.worker");
  await import("./processors/extraction.worker");
  // await import("./processors/posting.worker");      // Phase 8
  await import("./processors/automations.worker");
  await import("./processors/webhook-delivery.worker");

  logger.info("Worker ready — waiting for jobs");
}

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, async () => {
    logger.info({ signal }, "Shutting down worker");
    await Promise.allSettled(shutdownHandlers.map((h) => h()));
    process.exit(0);
  });
}

main().catch((err) => {
  logger.fatal(err, "Worker crashed on boot");
  process.exit(1);
});
