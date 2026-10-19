import { auth } from "@clerk/nextjs/server";
import type { MemberRole } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { hasPermission, type Permission } from "./permissions";

export interface AuthContext {
  userId: string; // local DB id
  clerkUserId: string;
  organizationId: string; // local DB id
  clerkOrgId: string;
  role: MemberRole;
  isPlatformAdmin: boolean;
}

export class AuthError extends Error {
  constructor(
    message: string,
    public readonly status: 401 | 403 | 404
  ) {
    super(message);
    this.name = "AuthError";
  }
}

/**
 * Resolve the current request to a tenant-scoped identity.
 * Every protected API route and server component goes through this —
 * it is the only bridge between Clerk session state and our DB rows.
 */
export async function getAuthContext(): Promise<AuthContext | null> {
  const { userId: clerkUserId, orgId: clerkOrgId } = await auth();
  if (!clerkUserId || !clerkOrgId) return null;

  const membership = await prisma.organizationMember.findFirst({
    where: { user: { clerkId: clerkUserId }, organization: { clerkOrgId } },
    include: {
      user: { select: { id: true, isPlatformAdmin: true } },
      organization: { select: { id: true } },
    },
  });
  if (!membership) return null;

  return {
    userId: membership.user.id,
    clerkUserId,
    organizationId: membership.organization.id,
    clerkOrgId,
    role: membership.role,
    isPlatformAdmin: membership.user.isPlatformAdmin,
  };
}

export async function requireAuthContext(): Promise<AuthContext> {
  const ctx = await getAuthContext();
  if (!ctx) throw new AuthError("Sign in and select an organization to continue", 401);
  return ctx;
}

export async function requirePermission(permission: Permission): Promise<AuthContext> {
  const ctx = await requireAuthContext();
  if (!hasPermission(ctx.role, permission)) {
    throw new AuthError(`Missing permission: ${permission}`, 403);
  }
  return ctx;
}

/** Platform staff gate for the /admin panel — unrelated to org roles. */
export async function requirePlatformAdmin(): Promise<AuthContext> {
  const ctx = await requireAuthContext();
  if (!ctx.isPlatformAdmin) throw new AuthError("Platform admin access required", 403);
  return ctx;
}
