import { NextResponse } from "next/server";
import { requirePlatformAdmin, AuthError } from "@/lib/auth/context";
import { getPlatformMetrics } from "@/server/services/admin.service";
import { ok, fail } from "@/lib/utils/api-response";

export const dynamic = "force-dynamic";

/** GET /api/v1/admin/metrics — platform staff only (User.isPlatformAdmin). */
export async function GET(): Promise<NextResponse> {
  try {
    await requirePlatformAdmin();
    return ok(await getPlatformMetrics());
  } catch (err) {
    if (err instanceof AuthError) return fail(err.message, err.status);
    throw err;
  }
}
