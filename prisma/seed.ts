/**
 * Local development seed: a demo organization with the default chart,
 * a bank account, vendors, sample posted journal entries, transactions,
 * and an open accounting period — enough data to exercise every screen.
 *
 * Run: npm run db:seed   (never runs in production; guarded below)
 */
import { PrismaClient, Prisma } from "@prisma/client";
import { provisionDefaultChart } from "../src/server/services/chart-provisioning.service";

const prisma = new PrismaClient();
const D = (v: string | number) => new Prisma.Decimal(v);

async function main() {
  if (process.env.NODE_ENV === "production") {
    throw new Error("Refusing to seed a production database");
  }

  // ── Demo identity ───────────────────────────────────────────────
  const user = await prisma.user.upsert({
    where: { clerkId: "user_demo_seed" },
    update: {},
    create: {
      clerkId: "user_demo_seed",
      email: "demo@ledgerflow.test",
      firstName: "Demo",
      lastName: "Accountant",
    },
  });

  const org = await prisma.organization.upsert({
    where: { clerkOrgId: "org_demo_seed" },
    update: {},
    create: {
      clerkOrgId: "org_demo_seed",
      name: "Maple Freight Co.",
      slug: "maple-freight",
      baseCurrency: "CAD",
    },
  });

  await prisma.organizationMember.upsert({
    where: { organizationId_userId: { organizationId: org.id, userId: user.id } },
    update: { role: "OWNER" },
    create: { organizationId: org.id, userId: user.id, role: "OWNER" },
  });

  await provisionDefaultChart(org.id);
  const account = async (code: string) => {
    const a = await prisma.account.findUnique({
      where: { organizationId_code: { organizationId: org.id, code } },
    });
    if (!a) throw new Error(`Seed expects account ${code}`);
    return a;
  };

  // ── Bank account + open period ──────────────────────────────────
  const chequing = await account("1010");
  const bank = await prisma.bankAccount.upsert({
    where: { id: "seed-bank" },
    update: {},
    create: {
      id: "seed-bank",
      organizationId: org.id,
      accountId: chequing.id,
      name: "Business Chequing",
      institution: "Demo Bank",
      currency: "CAD",
      currentBalance: D("42750.00"),
    },
  });

  const now = new Date();
  const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const monthEnd = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 0));
  await prisma.accountingPeriod.upsert({
    where: { organizationId_startDate: { organizationId: org.id, startDate: monthStart } },
    update: {},
    create: { organizationId: org.id, startDate: monthStart, endDate: monthEnd },
  });

  // ── Vendors ─────────────────────────────────────────────────────
  const vendorData = [
    { name: "Shell Canada", code: "6700" },
    { name: "Staples", code: "6250" },
    { name: "Telus", code: "6550" },
  ];
  const vendors = [];
  for (const v of vendorData) {
    const defaultAccount = await account(v.code);
    vendors.push(
      await prisma.vendor.upsert({
        where: {
          organizationId_normalizedName: {
            organizationId: org.id,
            normalizedName: v.name.toLowerCase(),
          },
        },
        update: {},
        create: {
          organizationId: org.id,
          name: v.name,
          normalizedName: v.name.toLowerCase(),
          defaultAccountId: defaultAccount.id,
        },
      })
    );
  }

  // ── Posted journal entries (balanced) ───────────────────────────
  const existingEntries = await prisma.journalEntry.count({ where: { organizationId: org.id } });
  if (existingEntries === 0) {
    const revenue = await account("4000");
    const fuel = await account("6700");
    const gstItc = await account("2210");
    const day = (d: number) => new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), d));

    // Entry 1: customer payment received — Dr Cash 5,250 / Cr Revenue 5,000, Cr GST 250
    const gstPayable = await account("2200");
    await prisma.journalEntry.create({
      data: {
        organizationId: org.id,
        entryNumber: 1,
        date: day(3),
        memo: "Freight invoice #1042 — Acme Logistics",
        status: "POSTED",
        sourceType: "MANUAL",
        createdById: user.id,
        postedById: user.id,
        postedAt: day(3),
        lines: {
          create: [
            { accountId: chequing.id, debit: D("5250.00"), credit: D(0) },
            { accountId: revenue.id, debit: D(0), credit: D("5000.00") },
            { accountId: gstPayable.id, debit: D(0), credit: D("250.00") },
          ],
        },
      },
    });

    // Entry 2: fuel purchase — Dr Fuel 180 / Dr GST ITC 9 / Cr Cash 189
    await prisma.journalEntry.create({
      data: {
        organizationId: org.id,
        entryNumber: 2,
        date: day(5),
        memo: "Shell Canada — fuel",
        status: "POSTED",
        sourceType: "DOCUMENT",
        createdById: user.id,
        postedById: user.id,
        postedAt: day(5),
        lines: {
          create: [
            { accountId: fuel.id, debit: D("180.00"), credit: D(0), vendorId: vendors[0]!.id },
            { accountId: gstItc.id, debit: D("9.00"), credit: D(0) },
            { accountId: chequing.id, debit: D(0), credit: D("189.00") },
          ],
        },
      },
    });
  }

  // ── Bank transactions awaiting categorization ────────────────────
  const txSeed = [
    { d: 3, desc: "E-TRANSFER ACME LOGISTICS", amt: "5250.00", dir: "CREDIT" as const },
    { d: 5, desc: "SHELL CANADA #4821 DELTA BC", amt: "189.00", dir: "DEBIT" as const },
    { d: 8, desc: "TELUS MOBILITY MONTHLY", amt: "94.08", dir: "DEBIT" as const },
    { d: 12, desc: "STAPLES #112 SURREY BC", amt: "63.27", dir: "DEBIT" as const },
  ];
  for (const t of txSeed) {
    const date = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), t.d));
    const dedupeHash = `${bank.id}|${date.toISOString().slice(0, 10)}|${t.amt}|${t.desc}`;
    await prisma.transaction.upsert({
      where: { bankAccountId_dedupeHash: { bankAccountId: bank.id, dedupeHash } },
      update: {},
      create: {
        organizationId: org.id,
        bankAccountId: bank.id,
        date,
        description: t.desc,
        amount: D(t.amt),
        direction: t.dir,
        dedupeHash,
      },
    });
  }

  console.log(`Seeded: org "${org.name}" · ${vendorData.length} vendors · ${txSeed.length} bank transactions`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
