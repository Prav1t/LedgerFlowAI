import { prisma } from "@/lib/db/prisma";

/** All identity writes flow through here so webhook sync stays idempotent. */
export const userRepository = {
  upsertFromClerk(data: {
    clerkId: string;
    email: string;
    firstName?: string | null;
    lastName?: string | null;
    imageUrl?: string | null;
  }) {
    return prisma.user.upsert({
      where: { clerkId: data.clerkId },
      create: data,
      update: {
        email: data.email,
        firstName: data.firstName,
        lastName: data.lastName,
        imageUrl: data.imageUrl,
      },
    });
  },

  deleteByClerkId(clerkId: string) {
    return prisma.user.deleteMany({ where: { clerkId } });
  },

  findByClerkId(clerkId: string) {
    return prisma.user.findUnique({ where: { clerkId } });
  },
};
