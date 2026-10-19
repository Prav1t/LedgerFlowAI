"use client";

import { Check, CreditCard, ExternalLink } from "lucide-react";
import { format } from "date-fns";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Progress } from "@/components/ui/progress";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { useBillingPortal, useBillingSummary, useCheckout } from "@/hooks/use-billing";
import { cn } from "@/lib/utils/cn";

const PLANS = [
  {
    tier: "STARTER" as const,
    name: "Starter",
    price: "$29",
    features: ["50 documents/month", "3 team members", "AI extraction & review", "Reports"],
  },
  {
    tier: "PROFESSIONAL" as const,
    name: "Professional",
    price: "$99",
    features: ["500 documents/month", "10 team members", "AI copilot", "Automations", "Priority processing"],
    highlight: true,
  },
  {
    tier: "FIRM" as const,
    name: "Firm",
    price: "$299",
    features: ["5,000 documents/month", "Unlimited team members", "All Professional features", "API access"],
  },
];

const STATUS_VARIANTS: Record<string, "success" | "primary" | "warning" | "destructive"> = {
  ACTIVE: "success",
  TRIALING: "primary",
  PAST_DUE: "warning",
  CANCELED: "destructive",
  INCOMPLETE: "warning",
};

export default function BillingPage() {
  const { data: summary, isPending } = useBillingSummary();
  const checkout = useCheckout();
  const portal = useBillingPortal();

  if (isPending || !summary) {
    return (
      <div className="mx-auto max-w-4xl space-y-4">
        <Skeleton className="h-8 w-40" />
        <Skeleton className="h-40" />
        <Skeleton className="h-72" />
      </div>
    );
  }

  const usagePct = Math.min(100, Math.round((summary.documentsUsedThisMonth / summary.documentsPerMonth) * 100));

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Billing</h1>
        <p className="text-sm text-muted-foreground">Subscription, usage, and invoices</p>
      </div>

      <Card>
        <CardHeader className="flex-row items-start justify-between space-y-0">
          <div className="space-y-1">
            <CardTitle className="flex items-center gap-2 text-base">
              {PLANS.find((p) => p.tier === summary.plan)?.name ?? summary.plan}
              <Badge variant={STATUS_VARIANTS[summary.status] ?? "default"}>{summary.status.toLowerCase()}</Badge>
              {summary.cancelAtPeriodEnd && <Badge variant="warning">cancels at period end</Badge>}
            </CardTitle>
            <CardDescription>
              {summary.status === "TRIALING" && summary.trialEndsAt
                ? `Trial ends ${format(new Date(summary.trialEndsAt), "MMM d, yyyy")}`
                : summary.currentPeriodEnd
                  ? `Renews ${format(new Date(summary.currentPeriodEnd), "MMM d, yyyy")}`
                  : "In-app trial — pick a plan below to subscribe"}
            </CardDescription>
          </div>
          <Button variant="outline" size="sm" className="gap-1.5" disabled={portal.isPending} onClick={() => portal.mutate()}>
            <CreditCard className="h-4 w-4" /> Manage billing <ExternalLink className="h-3 w-3" />
          </Button>
        </CardHeader>
        <CardContent className="space-y-2">
          <div className="flex items-baseline justify-between text-sm">
            <span className="text-muted-foreground">Documents this month</span>
            <span className="amount">
              {summary.documentsUsedThisMonth} / {summary.documentsPerMonth}
            </span>
          </div>
          <Progress value={usagePct} className={cn(usagePct >= 90 && "[&>div]:bg-warning")} />
          {!summary.canProcess && (
            <p className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
              Uploads are paused — reactivate your subscription to continue processing documents.
            </p>
          )}
        </CardContent>
      </Card>

      <div className="grid gap-4 md:grid-cols-3">
        {PLANS.map((plan) => {
          const isCurrent = plan.tier === summary.plan && summary.status !== "CANCELED";
          return (
            <Card key={plan.tier} className={cn(plan.highlight && "border-primary/50")}>
              <CardHeader>
                <CardTitle className="flex items-center justify-between text-base">
                  {plan.name}
                  {plan.highlight && <Badge variant="primary">popular</Badge>}
                </CardTitle>
                <CardDescription>
                  <span className="text-xl font-semibold text-foreground">{plan.price}</span>/month
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <ul className="space-y-1.5 text-sm">
                  {plan.features.map((f) => (
                    <li key={f} className="flex items-start gap-2">
                      <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-success" />
                      {f}
                    </li>
                  ))}
                </ul>
                <Button
                  className="w-full"
                  variant={isCurrent ? "secondary" : plan.highlight ? "default" : "outline"}
                  disabled={isCurrent || checkout.isPending}
                  onClick={() => checkout.mutate(plan.tier)}
                >
                  {isCurrent ? "Current plan" : "Choose " + plan.name}
                </Button>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <p className="text-xs text-muted-foreground">
        Payment methods, invoices, and cancellation are handled in the Stripe billing portal via
        &ldquo;Manage billing&rdquo;. Plan changes prorate automatically.
      </p>
    </div>
  );
}
