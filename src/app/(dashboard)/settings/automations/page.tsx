"use client";

import { useState } from "react";
import { Plus, Trash2, Wand2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import {
  useAutomationRules,
  useCreateRule,
  useDeleteRule,
  useUpdateRule,
} from "@/hooks/use-automation-rules";
import { useRunAutomations } from "@/hooks/use-transactions";
import { useAccounts } from "@/hooks/use-accounts";

export default function AutomationsSettingsPage() {
  const { data: rules, isPending } = useAutomationRules();
  const updateRule = useUpdateRule();
  const deleteRule = useDeleteRule();
  const runAutomations = useRunAutomations();

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Automations</h1>
          <p className="text-sm text-muted-foreground">
            Rules run on every statement import — first match (lowest priority number) wins.
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            className="gap-1.5"
            disabled={runAutomations.isPending}
            onClick={() => runAutomations.mutate()}
          >
            <Wand2 className="h-4 w-4" /> Run now
          </Button>
          <CreateRuleDialog />
        </div>
      </div>

      <div className="rounded-lg border bg-surface p-4 text-sm text-muted-foreground">
        Always on: vendor-default categorization, receipt ↔ transaction matching, recurring-charge
        detection, duplicate-invoice flagging, daily reminders, and the month-end checklist.
        Rules below add your own categorization on top.
      </div>

      {isPending ? (
        <div className="space-y-2">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-14" />
          ))}
        </div>
      ) : rules?.length === 0 ? (
        <p className="rounded-lg border py-12 text-center text-sm text-muted-foreground">
          No custom rules yet — add one to auto-categorize recurring charges.
        </p>
      ) : (
        <ul className="space-y-2">
          {rules?.map((rule) => (
            <li key={rule.id} className="flex items-center justify-between gap-3 rounded-lg border px-3 py-2.5">
              <div className="min-w-0">
                <p className="flex items-center gap-2 text-sm font-medium">
                  {rule.name}
                  <Badge variant="outline">priority {rule.priority}</Badge>
                  {!rule.isActive && <Badge>paused</Badge>}
                </p>
                <p className="mt-0.5 truncate text-xs text-muted-foreground">
                  {"descriptionContains" in rule.conditions &&
                    `description contains "${String(rule.conditions.descriptionContains)}" `}
                  {"direction" in rule.conditions && `· ${String(rule.conditions.direction)} `}
                  → account {rule.actions.setCategoryCode}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-1">
                <button
                  className="text-xs text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
                  onClick={() => updateRule.mutate({ id: rule.id, isActive: !rule.isActive })}
                >
                  {rule.isActive ? "Pause" : "Resume"}
                </button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 text-muted-foreground hover:text-destructive"
                  onClick={() => {
                    if (window.confirm(`Delete rule "${rule.name}"?`)) deleteRule.mutate(rule.id);
                  }}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function CreateRuleDialog() {
  const createRule = useCreateRule();
  const { data: accounts } = useAccounts();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [contains, setContains] = useState("");
  const [direction, setDirection] = useState<"" | "DEBIT" | "CREDIT">("");
  const [categoryCode, setCategoryCode] = useState("");

  const categoryAccounts = (accounts ?? []).filter(
    (a) => (a.type === "EXPENSE" || a.type === "REVENUE") && a.isActive
  );

  const submit = () =>
    createRule.mutate(
      {
        type: "CATEGORIZATION",
        name,
        conditions: { descriptionContains: contains, ...(direction && { direction }) },
        actions: { setCategoryCode: categoryCode },
      },
      {
        onSuccess: () => {
          setOpen(false);
          setName("");
          setContains("");
          setDirection("");
          setCategoryCode("");
        },
      }
    );

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" className="gap-1.5">
          <Plus className="h-4 w-4" /> New rule
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-sm">
        <DialogTitle>Categorization rule</DialogTitle>
        <div className="space-y-3">
          <Input placeholder="Rule name (e.g. Telus → Phone)" value={name} onChange={(e) => setName(e.target.value)} />
          <Input
            placeholder='Description contains (e.g. "TELUS")'
            value={contains}
            onChange={(e) => setContains(e.target.value)}
          />
          <select
            value={direction}
            onChange={(e) => setDirection(e.target.value as typeof direction)}
            className="h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm"
          >
            <option value="">Any direction</option>
            <option value="DEBIT">Debits (money out)</option>
            <option value="CREDIT">Credits (money in)</option>
          </select>
          <select
            value={categoryCode}
            onChange={(e) => setCategoryCode(e.target.value)}
            className="h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm"
          >
            <option value="">Set category…</option>
            {categoryAccounts.map((a) => (
              <option key={a.id} value={a.code}>
                {a.code} · {a.name}
              </option>
            ))}
          </select>
          <Button
            className="w-full"
            disabled={name.length < 2 || !contains || !categoryCode || createRule.isPending}
            onClick={submit}
          >
            Create rule
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
