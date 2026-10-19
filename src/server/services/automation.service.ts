import { prisma } from "@/lib/db/prisma";
import { evaluateRules } from "@/server/automations/rule-engine";
import { detectRecurringGroups } from "@/server/automations/recurring";
import { matchReceiptsToTransactions } from "@/server/automations/matching";
import { findDuplicateInvoiceGroups } from "@/server/services/copilot/duplicates";
import { normalizeVendorName } from "@/server/services/vendor.service";
import { logger } from "@/lib/utils/logger";

/**
 * Automation passes. Each is idempotent and org-scoped; the worker runs
 * the full sweep after extraction and on demand. Automations only stage
 * data (categories, matches, flags, notifications) — posting stays human.
 */
export const automationService = {
  /** Everything that should run when a document finishes extraction. */
  async runPostExtraction(organizationId: string, documentId: string) {
    const results = {
      duplicates: await this.detectInvoiceDuplicates(organizationId, documentId),
      categorized: await this.autoCategorize(organizationId),
      matched: await this.matchReceipts(organizationId),
      recurring: await this.detectRecurring(organizationId),
    };
    logger.info({ organizationId, documentId, ...results }, "Post-extraction automations complete");
    return results;
  },

  /**
   * Categorize UNCATEGORIZED transactions via, in order:
   *   1. the org's rules (priority order, first match wins)
   *   2. vendor name appearing in the description → vendor's default account
   */
  async autoCategorize(organizationId: string): Promise<number> {
    const [transactions, rules, vendors] = await Promise.all([
      prisma.transaction.findMany({
        where: { organizationId, status: "UNCATEGORIZED" },
        take: 500,
      }),
      prisma.automationRule.findMany({
        where: { organizationId, type: "CATEGORIZATION", isActive: true },
      }),
      prisma.vendor.findMany({
        where: { organizationId, defaultAccountId: { not: null } },
        select: { normalizedName: true, defaultAccountId: true },
      }),
    ]);
    if (transactions.length === 0) return 0;

    const accountByCode = new Map(
      (
        await prisma.account.findMany({
          where: { organizationId, isActive: true },
          select: { id: true, code: true },
        })
      ).map((a) => [a.code, a.id])
    );

    let categorized = 0;
    for (const tx of transactions) {
      let categoryAccountId: string | null = null;

      const ruleHit = evaluateRules(rules, {
        description: tx.description,
        amount: tx.amount.toString(),
        direction: tx.direction,
      });
      if (ruleHit) categoryAccountId = accountByCode.get(ruleHit.categoryCode) ?? null;

      if (!categoryAccountId) {
        const description = normalizeVendorName(tx.description);
        const vendor = vendors.find((v) => description.includes(v.normalizedName));
        categoryAccountId = vendor?.defaultAccountId ?? null;
      }

      if (categoryAccountId) {
        await prisma.transaction.update({
          where: { id: tx.id },
          data: { categoryAccountId, status: "CATEGORIZED" },
        });
        categorized++;
      }
    }
    return categorized;
  },

  /** Link unmatched receipts to bank debits (exact amount, ≤5 days apart). */
  async matchReceipts(organizationId: string): Promise<number> {
    const [receipts, transactions] = await Promise.all([
      prisma.receipt.findMany({
        where: { organizationId, matchedTransactionId: null },
        select: { id: true, amount: true, date: true, merchantName: true },
      }),
      prisma.transaction.findMany({
        where: { organizationId, direction: "DEBIT", status: { in: ["UNCATEGORIZED", "CATEGORIZED"] } },
        select: { id: true, amount: true, date: true, description: true },
      }),
    ]);
    if (receipts.length === 0 || transactions.length === 0) return 0;

    const pairs = matchReceiptsToTransactions(
      receipts.map((r) => ({
        id: r.id,
        amount: r.amount.toFixed(2),
        date: r.date?.toISOString().slice(0, 10) ?? null,
        merchantName: r.merchantName,
      })),
      transactions.map((t) => ({
        id: t.id,
        amount: t.amount.toFixed(2),
        date: t.date.toISOString().slice(0, 10),
        description: t.description,
      }))
    );

    for (const pair of pairs) {
      await prisma.$transaction([
        prisma.receipt.update({
          where: { id: pair.receiptId },
          data: { matchedTransactionId: pair.transactionId },
        }),
        prisma.transaction.update({
          where: { id: pair.transactionId },
          data: { status: "MATCHED" },
        }),
      ]);
    }
    return pairs.length;
  },

  /** Tag recurring charge groups with a stable recurrenceKey. */
  async detectRecurring(organizationId: string): Promise<number> {
    const transactions = await prisma.transaction.findMany({
      where: { organizationId, direction: "DEBIT" },
      orderBy: { date: "asc" },
      take: 2000,
      select: { id: true, description: true, amount: true, date: true },
    });
    const groups = detectRecurringGroups(
      transactions.map((t) => ({
        id: t.id,
        description: t.description,
        amount: t.amount.toFixed(2),
        date: t.date.toISOString().slice(0, 10),
      }))
    );
    for (const group of groups) {
      await prisma.transaction.updateMany({
        where: { id: { in: group.transactionIds } },
        data: { recurrenceKey: group.recurrenceKey },
      });
    }
    return groups.length;
  },

  /** Flag a just-extracted invoice document that duplicates an existing one. */
  async detectInvoiceDuplicates(organizationId: string, documentId: string): Promise<boolean> {
    const document = await prisma.document.findFirst({
      where: { id: documentId, organizationId },
      include: { invoice: true },
    });
    if (!document?.invoice) return false;

    const invoices = await prisma.invoice.findMany({
      where: { organizationId, status: { not: "VOID" } },
      include: { vendor: { select: { name: true } }, document: { select: { id: true, filename: true } } },
    });
    const groups = findDuplicateInvoiceGroups(
      invoices.map((i) => ({
        id: i.id,
        vendorName: i.vendor?.name ?? null,
        invoiceNumber: i.invoiceNumber,
        totalAmount: i.totalAmount.toFixed(2),
        issueDate: i.issueDate?.toISOString().slice(0, 10) ?? null,
        filename: i.document?.filename ?? null,
      }))
    );

    const group = groups.find((g) => g.invoices.some((i) => i.id === document.invoice!.id));
    if (!group) return false;

    const other = group.invoices.find((i) => i.id !== document.invoice!.id);
    const otherInvoice = invoices.find((i) => i.id === other?.id);
    const originalDocumentId = otherInvoice?.document?.id ?? null;

    await prisma.document.update({
      where: { id: documentId },
      data: { duplicateOfId: originalDocumentId },
    });
    await prisma.notification.create({
      data: {
        organizationId,
        type: "DUPLICATE_DETECTED",
        title: "Possible duplicate invoice",
        body: `${document.filename} looks like a duplicate of ${otherInvoice?.document?.filename ?? "an existing invoice"} (${group.reason.replace(/_/g, " ")})`,
        href: `/documents/${documentId}`,
      },
    });
    return true;
  },

  /** Daily sweep: overdue payables + review queue going stale. Deduped per day. */
  async dailyReminders(): Promise<void> {
    const organizations = await prisma.organization.findMany({ select: { id: true } });
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const staleCutoff = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000);
    const today = new Date();

    for (const org of organizations) {
      const [overdue, stale, alreadyReminded] = await Promise.all([
        prisma.invoice.count({
          where: { organizationId: org.id, status: "OPEN", direction: "PAYABLE", dueDate: { lt: today } },
        }),
        prisma.document.count({
          where: { organizationId: org.id, status: "NEEDS_REVIEW", createdAt: { lt: staleCutoff } },
        }),
        prisma.notification.count({
          where: { organizationId: org.id, type: "REMINDER", createdAt: { gte: since } },
        }),
      ]);
      if (alreadyReminded > 0 || (overdue === 0 && stale === 0)) continue;

      const parts = [
        overdue > 0 ? `${overdue} overdue bill${overdue === 1 ? "" : "s"}` : null,
        stale > 0 ? `${stale} document${stale === 1 ? "" : "s"} waiting on review for 3+ days` : null,
      ].filter(Boolean);
      await prisma.notification.create({
        data: {
          organizationId: org.id,
          type: "REMINDER",
          title: "Bookkeeping reminders",
          body: parts.join(" · "),
          href: overdue > 0 ? "/documents?status=POSTED" : "/documents?status=NEEDS_REVIEW",
        },
      });
    }
  },

  /** First-of-month checklist with the org's actual open items. */
  async monthEndChecklist(): Promise<void> {
    const organizations = await prisma.organization.findMany({ select: { id: true } });
    for (const org of organizations) {
      const [unreviewed, uncategorized, failed] = await Promise.all([
        prisma.document.count({ where: { organizationId: org.id, status: "NEEDS_REVIEW" } }),
        prisma.transaction.count({ where: { organizationId: org.id, status: "UNCATEGORIZED" } }),
        prisma.document.count({ where: { organizationId: org.id, status: "FAILED" } }),
      ]);
      await prisma.notification.create({
        data: {
          organizationId: org.id,
          type: "MONTH_END",
          title: "Month-end checklist",
          body:
            `Review queue: ${unreviewed} · Uncategorized transactions: ${uncategorized} · Failed documents: ${failed}. ` +
            "Then reconcile bank accounts and close the period.",
          href: "/reports",
        },
      });
    }
  },
};
