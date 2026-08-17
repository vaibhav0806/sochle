import type { FinancialSource, NormalizedFinancialState } from "@sochle/domain";

export type DetectedDataIssue = {
  details: Record<string, unknown>;
  materialityMinor: number;
  relatedEntityId: string;
  relatedEntityType: "source" | "transaction";
  severity: "info" | "warning" | "blocking";
  type:
    | "large_untagged_transaction"
    | "missing_source"
    | "stale_source"
    | "suspected_card_repayment"
    | "suspected_transfer";
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
      details: { merchant: transaction.rawMerchant },
      materialityMinor: transaction.amount.minor,
      relatedEntityId: transaction.sourceTransactionId,
      relatedEntityType: "transaction",
      severity: "blocking",
      type: "large_untagged_transaction",
    }));

  const freshnessIssues: DetectedDataIssue[] = state.sourceFreshness.flatMap((source) => {
    if (source.status !== "stale" && source.status !== "missing") return [];

    return [
      {
        details: { refreshedAt: source.refreshedAt },
        materialityMinor: 0,
        relatedEntityId: source.source,
        relatedEntityType: "source",
        severity: decisionSources.has(source.source) ? "blocking" : "info",
        type: source.status === "stale" ? "stale_source" : "missing_source",
      },
    ];
  });

  const classificationIssues: DetectedDataIssue[] = state.transactions.flatMap((transaction) => {
    if (
      transaction.sochleClassification !== "transfer" &&
      transaction.sochleClassification !== "credit_card_payment"
    ) {
      return [];
    }
    return [
      {
        details: {
          detectedClassification: transaction.sochleClassification,
          merchant: transaction.rawMerchant,
        },
        materialityMinor: transaction.amount.minor,
        relatedEntityId: transaction.sourceTransactionId,
        relatedEntityType: "transaction",
        severity: "warning",
        type:
          transaction.sochleClassification === "transfer"
            ? "suspected_transfer"
            : "suspected_card_repayment",
      },
    ];
  });

  return [...transactionIssues, ...classificationIssues, ...freshnessIssues];
}
