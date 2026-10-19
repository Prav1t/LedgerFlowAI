"use client";

import { Landmark } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { formatMoney } from "@/lib/utils/money";
import type { DashboardData } from "@/server/services/dashboard.service";

export function BankAccountsCard({ accounts }: { accounts: DashboardData["bankAccounts"] }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Bank accounts</CardTitle>
        <CardDescription>Balances from latest statements</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {accounts.length === 0 ? (
          <p className="py-4 text-sm text-muted-foreground">
            No bank accounts yet — upload a bank statement to get started.
          </p>
        ) : (
          accounts.map((a) => (
            <div key={a.id} className="flex items-center justify-between gap-3">
              <div className="flex min-w-0 items-center gap-2.5">
                <span className="grid h-8 w-8 shrink-0 place-items-center rounded-md bg-secondary">
                  <Landmark className="h-4 w-4 text-muted-foreground" />
                </span>
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{a.name}</p>
                  {a.institution && (
                    <p className="truncate text-xs text-muted-foreground">{a.institution}</p>
                  )}
                </div>
              </div>
              <span className="amount text-sm font-medium">
                {formatMoney(a.currentBalance, a.currency, "en-CA")}
              </span>
            </div>
          ))
        )}
      </CardContent>
    </Card>
  );
}
