"use client";

import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { formatMoney } from "@/lib/utils/money";
import type { MonthPoint } from "@/server/services/dashboard.service";

export function CashflowChart({ series, currency }: { series: MonthPoint[]; currency: string }) {
  const data = series.map((p) => ({
    label: p.label,
    Revenue: Number(p.revenue),
    Expenses: Number(p.expenses),
  }));

  return (
    <Card className="col-span-full lg:col-span-2">
      <CardHeader>
        <CardTitle>Revenue vs expenses</CardTitle>
        <CardDescription>Posted journal activity, last 6 months</CardDescription>
      </CardHeader>
      <CardContent className="h-72">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} barGap={4}>
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
            <XAxis
              dataKey="label"
              tickLine={false}
              axisLine={false}
              tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 12 }}
            />
            <YAxis
              tickLine={false}
              axisLine={false}
              width={64}
              tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 11 }}
              tickFormatter={(v: number) => (v >= 1000 ? `$${(v / 1000).toFixed(0)}k` : `$${v}`)}
            />
            <Tooltip
              cursor={{ fill: "hsl(var(--accent))", opacity: 0.5 }}
              contentStyle={{
                background: "hsl(var(--popover))",
                border: "1px solid hsl(var(--border))",
                borderRadius: 8,
                fontSize: 12,
              }}
              formatter={(value: number | string, name: string) => [formatMoney(value, currency, "en-CA"), name]}
            />
            <Bar dataKey="Revenue" fill="hsl(var(--ledger-credit))" radius={[3, 3, 0, 0]} maxBarSize={28} />
            <Bar dataKey="Expenses" fill="hsl(var(--ledger-debit))" radius={[3, 3, 0, 0]} maxBarSize={28} />
          </BarChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}
