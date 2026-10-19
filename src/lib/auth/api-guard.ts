import { NextRequest, NextResponse } from "next/server";
import { ZodError } from "zod";
import { AuthError, requirePermission, requireAuthContext, type AuthContext } from "./context";
import type { Permission } from "./permissions";
import { rateLimit } from "@/lib/utils/rate-limit";
import { fail, validationError } from "@/lib/utils/api-response";
import { logger } from "@/lib/utils/logger";

type Handler = (req: NextRequest, ctx: AuthContext) => Promise<NextResponse>;

interface GuardOptions {
  permission?: Permission;
  rateLimit?: { limit: number; windowSeconds: number };
}

/**
 * Wraps an API handler with: auth resolution → permission check →
 * per-org rate limit → uniform error translation. Route files stay thin.
 */
export function withAuth(handler: Handler, options: GuardOptions = {}) {
  return async (req: NextRequest): Promise<NextResponse> => {
    try {
      const ctx = options.permission
        ? await requirePermission(options.permission)
        : await requireAuthContext();

      const rl = options.rateLimit ?? { limit: 100, windowSeconds: 60 };
      const { allowed, remaining, resetAt } = await rateLimit(
        `${ctx.organizationId}:${req.nextUrl.pathname}`,
        rl.limit,
        rl.windowSeconds
      );
      if (!allowed) {
        return fail("Rate limit exceeded — try again shortly", 429, "RATE_LIMITED");
      }

      const res = await handler(req, ctx);
      res.headers.set("X-RateLimit-Remaining", String(remaining));
      res.headers.set("X-RateLimit-Reset", String(resetAt));
      return res;
    } catch (err) {
      if (err instanceof AuthError) return fail(err.message, err.status);
      if (err instanceof ZodError) return validationError(err);
      logger.error({ err, path: req.nextUrl.pathname }, "Unhandled API error");
      return fail("Internal server error", 500, "INTERNAL");
    }
  };
}
