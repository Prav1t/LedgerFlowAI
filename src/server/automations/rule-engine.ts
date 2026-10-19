import { z } from "zod";

/**
 * Categorization rule engine — pure. Rules are stored as JSON on
 * AutomationRule rows; these schemas are the contract for that JSON,
 * validated at the API boundary and re-validated at evaluation time
 * (a malformed stored rule is skipped, never crashes the worker).
 */

export const categorizationConditionsSchema = z
  .object({
    descriptionContains: z.string().min(1).max(120).optional(),
    direction: z.enum(["CREDIT", "DEBIT"]).optional(),
    amountMin: z.string().regex(/^\d+(\.\d{1,2})?$/).optional(),
    amountMax: z.string().regex(/^\d+(\.\d{1,2})?$/).optional(),
  })
  .refine((c) => Object.keys(c).length > 0, { message: "At least one condition is required" });

export const categorizationActionsSchema = z.object({
  setCategoryCode: z.string().regex(/^\d{3,6}$/),
});

export type CategorizationConditions = z.infer<typeof categorizationConditionsSchema>;
export type CategorizationActions = z.infer<typeof categorizationActionsSchema>;

export interface RuleForEvaluation {
  id: string;
  priority: number;
  conditions: unknown;
  actions: unknown;
}

export interface TransactionForRules {
  description: string;
  amount: string;
  direction: "CREDIT" | "DEBIT";
}

export function matchesConditions(conditions: CategorizationConditions, tx: TransactionForRules): boolean {
  if (
    conditions.descriptionContains &&
    !tx.description.toLowerCase().includes(conditions.descriptionContains.toLowerCase())
  ) {
    return false;
  }
  if (conditions.direction && conditions.direction !== tx.direction) return false;
  const amount = Number(tx.amount);
  if (conditions.amountMin !== undefined && amount < Number(conditions.amountMin)) return false;
  if (conditions.amountMax !== undefined && amount > Number(conditions.amountMax)) return false;
  return true;
}

/**
 * First matching rule wins, lowest priority number first.
 * Returns the category code to apply, or null.
 */
export function evaluateRules(
  rules: RuleForEvaluation[],
  tx: TransactionForRules
): { ruleId: string; categoryCode: string } | null {
  const sorted = [...rules].sort((a, b) => a.priority - b.priority);
  for (const rule of sorted) {
    const conditions = categorizationConditionsSchema.safeParse(rule.conditions);
    const actions = categorizationActionsSchema.safeParse(rule.actions);
    if (!conditions.success || !actions.success) continue; // malformed rule: skip
    if (matchesConditions(conditions.data, tx)) {
      return { ruleId: rule.id, categoryCode: actions.data.setCategoryCode };
    }
  }
  return null;
}
