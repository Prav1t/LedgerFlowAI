"use client";

import { useState } from "react";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { useAccounts, useCreateAccount, useUpdateAccount, type AccountItem } from "@/hooks/use-accounts";
import { formatMoney } from "@/lib/utils/money";
import { cn } from "@/lib/utils/cn";

const TYPE_ORDER = ["ASSET", "LIABILITY", "EQUITY", "REVENUE", "EXPENSE"] as const;
const TYPE_LABELS: Record<string, string> = {
  ASSET: "Assets",
  LIABILITY: "Liabilities",
  EQUITY: "Equity",
  REVENUE: "Revenue",
  EXPENSE: "Expenses",
};

export default function ChartOfAccountsPage() {
  const { data: accounts, isPending } = useAccounts();
  const updateAccount = useUpdateAccount();

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Chart of accounts</h1>
          <p className="text-sm text-muted-foreground">Balances reflect posted journal entries</p>
        </div>
        <AddAccountDialog />
      </div>

      {isPending ? (
        <div className="space-y-2">
          {Array.from({ length: 8 }).map((_, i) => (
            <Skeleton key={i} className="h-10" />
          ))}
        </div>
      ) : (
        TYPE_ORDER.map((type) => {
          const group = (accounts ?? []).filter((a) => a.type === type);
          if (group.length === 0) return null;
          return (
            <section key={type}>
              <h2 className="mb-1.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                {TYPE_LABELS[type]}
              </h2>
              <div className="overflow-hidden rounded-lg border">
                <table className="w-full text-sm">
                  <tbody className="divide-y">
                    {group.map((account) => (
                      <AccountRow
                        key={account.id}
                        account={account}
                        onToggleActive={() =>
                          updateAccount.mutate({ id: account.id, isActive: !account.isActive })
                        }
                      />
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          );
        })
      )}
    </div>
  );
}

function AccountRow({ account, onToggleActive }: { account: AccountItem; onToggleActive: () => void }) {
  return (
    <tr className={cn("transition-colors hover:bg-accent/40", !account.isActive && "opacity-50")}>
      <td className="w-20 px-3 py-2 font-mono text-xs text-muted-foreground">{account.code}</td>
      <td className="px-3 py-2">
        <span className={cn(account.parentId && "pl-4")}>{account.name}</span>
        {account.isSystem && (
          <Badge variant="outline" className="ml-2">
            system
          </Badge>
        )}
      </td>
      <td className="amount px-3 py-2 text-right">{formatMoney(account.balance, "CAD", "en-CA")}</td>
      <td className="w-24 px-3 py-2 text-right">
        {!account.isSystem && (
          <button
            onClick={onToggleActive}
            className="text-xs text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
          >
            {account.isActive ? "Deactivate" : "Activate"}
          </button>
        )}
      </td>
    </tr>
  );
}

function AddAccountDialog() {
  const createAccount = useCreateAccount();
  const [open, setOpen] = useState(false);
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [type, setType] = useState<AccountItem["type"]>("EXPENSE");

  const submit = () => {
    createAccount.mutate(
      { code, name, type },
      {
        onSuccess: () => {
          setOpen(false);
          setCode("");
          setName("");
        },
      }
    );
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" className="gap-1.5">
          <Plus className="h-4 w-4" /> Add account
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-sm">
        <DialogTitle>New account</DialogTitle>
        <div className="space-y-3">
          <div className="grid grid-cols-3 gap-2">
            <Input placeholder="Code" value={code} onChange={(e) => setCode(e.target.value)} />
            <select
              value={type}
              onChange={(e) => setType(e.target.value as AccountItem["type"])}
              className="col-span-2 h-9 rounded-md border border-input bg-transparent px-3 text-sm"
            >
              {TYPE_ORDER.map((t) => (
                <option key={t} value={t}>
                  {TYPE_LABELS[t]}
                </option>
              ))}
            </select>
          </div>
          <Input placeholder="Account name" value={name} onChange={(e) => setName(e.target.value)} />
          <Button
            className="w-full"
            disabled={!code || name.length < 2 || createAccount.isPending}
            onClick={submit}
          >
            Create account
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
