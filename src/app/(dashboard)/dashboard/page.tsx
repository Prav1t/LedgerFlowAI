"use client";

import { Skeleton } from "@/components/ui/skeleton";
import { StatCard } from "@/components/dashboard/stat-card";
import { CashflowChart } from "@/components/dashboard/cashflow-chart";
import { BankAccountsCard } from "@/components/dashboard/bank-accounts-card";
import { PendingDocumentsCard } from "@/components/dashboard/pending-documents-card";
import { JobsCard } from "@/components/dashboard/jobs-card";
import { useDashboard } from "@/hooks/use-dashboard";

export default function DashboardPage() {
  const { data, isPending, isError, error } = useDashboard();

  if (isPending) return <DashboardSkeleton />;

  if (isError) {
    return (
      <div className="mx-auto max-w-md py-20 text-center">
        <h2 className="text-lg font-medium">Couldn&apos;t load the dashboard</h2>
        <p className="mt-1 text-sm text-muted-foreground">{error.message}</p>
      </div>
    );
  }

  const { summary, series, pendingDocuments, jobs, bankAccounts } = data;

  return (
    <div className="mx-auto max-w-6xl space-y-4">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Overview</h1>
        <p className="text-sm text-muted-foreground">This month at a glance</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard title="Revenue" amount={summary.revenueMtd} currency={summary.currency} deltaPct={summary.revenueDeltaPct} index={0} />
        <StatCard title="Expenses" amount={summary.expensesMtd} currency={summary.currency} deltaPct={summary.expensesDeltaPct} increaseIsPositive={false} index={1} />
        <StatCard title="Net income" amount={summary.netIncomeMtd} currency={summary.currency} index={2} />
        <StatCard title="Cash on hand" amount={summary.cashOnHand} currency={summary.currency} index={3} />
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <CashflowChart series={series} currency={summary.currency} />
        <BankAccountsCard accounts={bankAccounts} />
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <PendingDocumentsCard pending={pendingDocuments} currency={summary.currency} />
        <JobsCard jobs={jobs} />
      </div>
    </div>
  );
}

function DashboardSkeleton() {
  return (
    <div className="mx-auto max-w-6xl space-y-4">
      <div className="space-y-2">
        <Skeleton className="h-6 w-32" />
        <Skeleton className="h-4 w-48" />
      </div>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-28" />
        ))}
      </div>
      <div className="grid gap-4 lg:grid-cols-3">
        <Skeleton className="h-80 lg:col-span-2" />
        <Skeleton className="h-80" />
      </div>
    </div>
  );
}
