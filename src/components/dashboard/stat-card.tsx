"use client";

import { TrendingDown, TrendingUp } from "lucide-react";
import { motion } from "framer-motion";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatMoney } from "@/lib/utils/money";
import { cn } from "@/lib/utils/cn";

interface StatCardProps {
  title: string;
  amount: string;
  currency: string;
  deltaPct?: number | null;
  /** Whether an increase is good news (revenue: yes, expenses: no). */
  increaseIsPositive?: boolean;
  index?: number;
}

export function StatCard({ title, amount, currency, deltaPct, increaseIsPositive = true, index = 0 }: StatCardProps) {
  const isUp = (deltaPct ?? 0) >= 0;
  const good = isUp === increaseIsPositive;

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25, delay: index * 0.05 }}
    >
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            {title}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="amount text-2xl font-semibold tracking-tight">
            {formatMoney(amount, currency, "en-CA")}
          </div>
          {deltaPct !== undefined && deltaPct !== null && (
            <p className={cn("mt-1 flex items-center gap-1 text-xs", good ? "text-success" : "text-destructive")}>
              {isUp ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
              {Math.abs(deltaPct).toFixed(1)}% vs last month
            </p>
          )}
        </CardContent>
      </Card>
    </motion.div>
  );
}
