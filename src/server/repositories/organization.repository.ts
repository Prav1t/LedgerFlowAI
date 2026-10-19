import { prisma } from "@/lib/db/prisma";
import type { MemberRole } from "@prisma/client";

export const organizationRepository = {
  upsertFromClerk(data: { clerkOrgId: string; name: string; slug: string; imageUrl?: string | null }) {
    return prisma.organization.upsert({
      where: { clerkOrgId: data.clerkOrgId },
      create: data,
      update: { name: data.name, slug: data.slug, imageUrl: data.imageUrl },
    });
  },

  deleteByClerkOrgId(clerkOrgId: string) {
    return prisma.organization.deleteMany({ where: { clerkOrgId } });
  },

  upsertMembership(data: { clerkOrgId: string; clerkUserId: string; role: MemberRole }) {
    return prisma.$transaction(async (tx) => {
      const [org, user] = await Promise.all([
        tx.organization.findUnique({ where: { clerkOrgId: data.clerkOrgId } }),
        tx.user.findUnique({ where: { clerkId: data.clerkUserId } }),
      ]);
      // Webhooks can arrive out of order — membership before user.created.
      // Svix retries on non-2xx, so failing here is the correct behavior.
      if (!org || !user) {
        throw new Error(
          `Membership sync out of order (org: ${!!org}, user: ${!!user}) — will retry`
        );
      }
      return tx.organizationMember.upsert({
        where: { organizationId_userId: { organizationId: org.id, userId: user.id } },
        create: { organizationId: org.id, userId: user.id, role: data.role },
        update: { role: data.role },
      });
    });
  },

  removeMembership(clerkOrgId: string, clerkUserId: string) {
    return prisma.organizationMember.deleteMany({
      where: { organization: { clerkOrgId }, user: { clerkId: clerkUserId } },
    });
  },

  listMembers(organizationId: string) {
    return prisma.organizationMember.findMany({
      where: { organizationId },
      include: {
        user: {
          select: { id: true, email: true, firstName: true, lastName: true, imageUrl: true },
        },
      },
      orderBy: { createdAt: "asc" },
    });
  },
};
