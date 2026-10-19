import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { redis } from "@/lib/redis/client";

export const dynamic = "force-dynamic";

/** Liveness + dependency check for load balancers and uptime monitors. */
export async function GET() {
  const checks: Record<string, "ok" | "error"> = { app: "ok", database: "error", redis: "error" };

  try {
    await prisma.$queryRaw`SELECT 1`;
    checks.database = "ok";
  } catch {
    /* reported below */
  }

  try {
    const pong = await redis.ping();
    if (pong === "PONG") checks.redis = "ok";
  } catch {
    /* reported below */
  }

  const healthy = Object.values(checks).every((c) => c === "ok");
  return NextResponse.json(
    { status: healthy ? "healthy" : "degraded", checks, timestamp: new Date().toISOString() },
    { status: healthy ? 200 : 503 }
  );
}
