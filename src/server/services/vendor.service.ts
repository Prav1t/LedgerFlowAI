import { prisma } from "@/lib/db/prisma";
import type { Prisma } from "@prisma/client";

/**
 * Canonical vendor identity: lowercase, collapse whitespace, strip
 * punctuation and trailing corporate suffixes so "Shell Canada Ltd." and
 * "SHELL  CANADA" resolve to the same vendor.
 */
export function normalizeVendorName(name: string): string {
  return name
    .toLowerCase()
    .replace(/[.,'"()]/g, " ")
    .replace(/\s+(inc|ltd|llc|corp|co|limited|incorporated)\.?\s*$/i, "")
    .replace(/\s+/g, " ")
    .trim();
}

export const vendorService = {
  /** Find-or-create inside the caller's transaction for pipeline atomicity. */
  async findOrCreate(
    tx: Prisma.TransactionClient,
    organizationId: string,
    rawName: string
  ): Promise<{ id: string; name: string } | null> {
    const normalizedName = normalizeVendorName(rawName);
    if (!normalizedName) return null;

    const existing = await tx.vendor.findUnique({
      where: { organizationId_normalizedName: { organizationId, normalizedName } },
      select: { id: true, name: true },
    });
    if (existing) return existing;

    return tx.vendor.create({
      data: { organizationId, name: rawName.trim(), normalizedName },
      select: { id: true, name: true },
    });
  },

  list(organizationId: string) {
    return prisma.vendor.findMany({
      where: { organizationId },
      orderBy: { name: "asc" },
      include: { defaultAccount: { select: { code: true, name: true } } },
    });
  },
};
