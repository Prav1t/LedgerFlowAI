import { Prisma, type JournalSourceType } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import {
  validateEntry,
  reversalLines,
  PostingError,
  type EntryLineInput,
} from "@/server/accounting-engine/posting";
import { auditLogRepository } from "@/server/repositories/audit-log.repository";
import { logger } from "@/lib/utils/logger";

const D = (v: string | number) => new Prisma.Decimal(v);

export interface CreateEntryInput {
  date: string; // YYYY-MM-DD
  memo?: string;
  lines: EntryLineInput[];
  sourceType?: JournalSourceType;
  post?: boolean; // create as POSTED (default true for approvals, false for manual drafts)
}

/**
 * Journal entry lifecycle. The invariants Prisma can't express live here:
 *   • debits ≡ credits, validated pre-commit (engine)
 *   • sequential per-org entry numbers, race-safe via unique constraint retry
 *   • entries in CLOSED periods are rejected; missing periods auto-open
 *   • POSTED entries are immutable — corrections are reversing entries
 */
export const journalService = {
  async createEntry(
    organizationId: string,
    userId: string | null,
    input: CreateEntryInput,
    tx?: Prisma.TransactionClient
  ) {
    const run = async (client: Prisma.TransactionClient) => {
      const accountIds = [...new Set(input.lines.map((l) => l.accountId))];
      const accounts = await client.account.findMany({
        where: { id: { in: accountIds }, organizationId },
        select: { id: true, isActive: true },
      });
      validateEntry(input.lines, {
        accounts: new Map(accounts.map((a) => [a.id, { isActive: a.isActive }])),
      });

      const date = new Date(`${input.date}T00:00:00Z`);
      const period = await ensureOpenPeriod(client, organizationId, date);

      const post = input.post ?? true;
      // Race-safe sequential numbering: unique(organizationId, entryNumber)
      // turns a concurrent collision into a retry, not a duplicate.
      for (let attempt = 0; attempt < 3; attempt++) {
        const last = await client.journalEntry.findFirst({
          where: { organizationId },
          orderBy: { entryNumber: "desc" },
          select: { entryNumber: true },
        });
        try {
          return await client.journalEntry.create({
            data: {
              organizationId,
              entryNumber: (last?.entryNumber ?? 0) + 1,
              date,
              memo: input.memo,
              status: post ? "POSTED" : "DRAFT",
              sourceType: input.sourceType ?? "MANUAL",
              periodId: period?.id,
              createdById: userId,
              ...(post && { postedById: userId, postedAt: new Date() }),
              lines: {
                create: input.lines.map((l) => ({
                  accountId: l.accountId,
                  debit: D(l.debit),
                  credit: D(l.credit),
                  memo: l.memo,
                  vendorId: l.vendorId ?? null,
                })),
              },
            },
            include: { lines: true },
          });
        } catch (err) {
          if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002" && attempt < 2) {
            continue; // another writer took the number — re-read and retry
          }
          throw err;
        }
      }
      throw new Error("Could not allocate a journal entry number");
    };

    const entry = tx ? await run(tx) : await prisma.$transaction(run);
    logger.info({ organizationId, entryNumber: entry.entryNumber, status: entry.status }, "Journal entry created");
    return entry;
  },

  /** DRAFT → POSTED. Re-validates; posting is the immutability boundary. */
  async postEntry(organizationId: string, userId: string, entryId: string) {
    return prisma.$transaction(async (tx) => {
      const entry = await tx.journalEntry.findFirst({
        where: { id: entryId, organizationId },
        include: { lines: true },
      });
      if (!entry) throw new PostingError("Entry not found", "NOT_POSTABLE");
      if (entry.status !== "DRAFT") {
        throw new PostingError(`Only draft entries can be posted (status: ${entry.status})`, "NOT_POSTABLE");
      }

      const accounts = await tx.account.findMany({
        where: { id: { in: entry.lines.map((l) => l.accountId) }, organizationId },
        select: { id: true, isActive: true },
      });
      validateEntry(
        entry.lines.map((l) => ({
          accountId: l.accountId,
          debit: l.debit.toString(),
          credit: l.credit.toString(),
        })),
        { accounts: new Map(accounts.map((a) => [a.id, { isActive: a.isActive }])) }
      );
      await ensureOpenPeriod(tx, organizationId, entry.date);

      const posted = await tx.journalEntry.update({
        where: { id: entryId },
        data: { status: "POSTED", postedById: userId, postedAt: new Date() },
        include: { lines: true },
      });
      await auditLogRepository.record({
        organizationId,
        actorUserId: userId,
        action: "journal.entry.posted",
        entityType: "JournalEntry",
        entityId: entryId,
        metadata: { entryNumber: posted.entryNumber },
      });
      return posted;
    });
  },

  /**
   * The only way to undo a posted entry: create its mirror image and link
   * both sides. The original ledger history is never rewritten.
   */
  async reverseEntry(organizationId: string, userId: string, entryId: string, memo?: string) {
    return prisma.$transaction(async (tx) => {
      const original = await tx.journalEntry.findFirst({
        where: { id: entryId, organizationId },
        include: { lines: true, reversedBy: { select: { id: true } } },
      });
      if (!original) throw new PostingError("Entry not found", "NOT_POSTABLE");
      if (original.status !== "POSTED") {
        throw new PostingError("Only posted entries can be reversed", "NOT_POSTABLE");
      }
      if (original.reversedBy) {
        throw new PostingError("Entry has already been reversed", "ALREADY_REVERSED");
      }

      const reversal = await journalService.createEntry(
        organizationId,
        userId,
        {
          date: new Date().toISOString().slice(0, 10),
          memo: memo ?? `Reversal of entry #${original.entryNumber}`,
          sourceType: "REVERSAL",
          lines: reversalLines(original.lines),
          post: true,
        },
        tx
      );

      await tx.journalEntry.update({ where: { id: reversal.id }, data: { reversesId: original.id } });
      await tx.journalEntry.update({ where: { id: original.id }, data: { status: "REVERSED" } });

      await auditLogRepository.record({
        organizationId,
        actorUserId: userId,
        action: "journal.entry.reversed",
        entityType: "JournalEntry",
        entityId: original.id,
        metadata: { entryNumber: original.entryNumber, reversalEntryNumber: reversal.entryNumber },
      });
      return reversal;
    });
  },

  async list(organizationId: string, opts: { page: number; pageSize: number; status?: string }) {
    const where: Prisma.JournalEntryWhereInput = {
      organizationId,
      ...(opts.status && { status: opts.status as never }),
    };
    const [items, total] = await Promise.all([
      prisma.journalEntry.findMany({
        where,
        orderBy: { entryNumber: "desc" },
        skip: (opts.page - 1) * opts.pageSize,
        take: opts.pageSize,
        include: {
          lines: { include: { account: { select: { code: true, name: true } } } },
          createdBy: { select: { firstName: true, lastName: true } },
        },
      }),
      prisma.journalEntry.count({ where }),
    ]);
    return { items, total, page: opts.page, pageSize: opts.pageSize, hasMore: opts.page * opts.pageSize < total };
  },
};

/** Find the period containing `date`; reject CLOSED, auto-open a monthly one when missing. */
async function ensureOpenPeriod(tx: Prisma.TransactionClient, organizationId: string, date: Date) {
  const existing = await tx.accountingPeriod.findFirst({
    where: { organizationId, startDate: { lte: date }, endDate: { gte: date } },
  });
  if (existing?.status === "CLOSED") {
    throw new PostingError(
      `The accounting period containing ${date.toISOString().slice(0, 10)} is closed — use an adjusting entry in an open period`,
      "PERIOD_CLOSED"
    );
  }
  if (existing) return existing;

  const startDate = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1));
  const endDate = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0));
  return tx.accountingPeriod
    .create({ data: { organizationId, startDate, endDate } })
    .catch(async (err) => {
      // Concurrent auto-open: fall back to the row the other writer created.
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
        const raced = await tx.accountingPeriod.findFirst({
          where: { organizationId, startDate: { lte: date }, endDate: { gte: date } },
        });
        if (raced) return raced;
      }
      throw err;
    });
}
