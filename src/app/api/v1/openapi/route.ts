import { NextResponse } from "next/server";
import { buildOpenApiSpec } from "@/lib/utils/openapi-spec";
import { env } from "@/config/env";

export const dynamic = "force-static";

/** GET /api/v1/openapi — machine-readable API description. */
export function GET() {
  return NextResponse.json(buildOpenApiSpec(env.NEXT_PUBLIC_APP_URL));
}
