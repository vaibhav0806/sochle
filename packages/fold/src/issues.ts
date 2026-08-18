import type { FinancialSource, NormalizedFinancialState } from "@sochle/domain";

export type DetectedDataIssue = {
  details: Record<string, unknown>;
  materialityMinor: number;
  relatedEntityId: string;
  relatedEntityType: "source" | "transaction";
  severity: "info" | "warning" | "blocking";
  type: "large_untagged_transaction" | "missing_source" | "stale_source";
};

const decisionSources = new Set<FinancialSource>([
  "total_balance",
  "bank_accounts",
  "credit_cards",
  "transactions",
  "spending_summary",
  "recurring_expenses",
  "upcoming_recurring_cycles",
]);

export function detectDataIssues(
  state: NormalizedFinancialState,
  options: { largeTransactionMinor: number }
): DetectedDataIssue[] {
  const transactionIssues: DetectedDataIssue[] = state.transactions
    .filter(
      (transaction) =>
        transaction.direction === "debit" &&
        transaction.cashFlowInclusion === "included" &&
        transaction.sochleClassification === "unclassified" &&
        transaction.amount.minor >= options.largeTransactionMinor
    )
    .map((transaction) => ({
      details: {
        liquidityEffectMaxMinor: 0,
        liquidityEffectMinMinor: 0,
        merchant: transaction.rawMerchant,
      },
      materialityMinor: transaction.amount.minor,
      relatedEntityId: transaction.sourceTransactionId,
      relatedEntityType: "transaction",
      severity: "warning",
      type: "large_untagged_transaction",
    }));

  const freshnessIssues: DetectedDataIssue[] = state.sourceFreshness.flatMap((source) => {
    if (
      !decisionSources.has(source.source) ||
      (source.status !== "stale" && source.status !== "missing")
    ) {
      return [];
    }

    const effect = source.uncertaintyEffect;
    const boundedCardExposure =
      source.source === "credit_cards" &&
      effect !== undefined &&
      Number.isSafeInteger(effect.minMinor) &&
      Number.isSafeInteger(effect.maxMinor) &&
      effect.minMinor <= effect.maxMinor;

    return [
      {
        details: {
          refreshedAt: source.refreshedAt,
          ...(boundedCardExposure
            ? {
                liquidityEffectMaxMinor: effect.maxMinor,
                liquidityEffectMinMinor: effect.minMinor,
              }
            : {}),
        },
        materialityMinor: 0,
        relatedEntityId: source.source,
        relatedEntityType: "source",
        severity: boundedCardExposure ? "warning" : "blocking",
        type: source.status === "stale" ? "stale_source" : "missing_source",
      },
    ];
  });

  return [...transactionIssues, ...freshnessIssues];
}
