import { NextResponse } from "next/server";
import { withAuth } from "@/lib/auth/api-guard";
import { organizationRepository } from "@/server/repositories/organization.repository";
import { ok } from "@/lib/utils/api-response";

/** GET /api/v1/members — team roster with roles (requires org:view_members). */
export const GET = withAuth(
  async (_req, ctx): Promise<NextResponse> => {
    const members = await organizationRepository.listMembers(ctx.organizationId);
    return ok(
      members.map((m) => ({
        id: m.id,
        role: m.role,
        joinedAt: m.createdAt,
        user: m.user,
      }))
    );
  },
  { permission: "org:view_members" }
);
