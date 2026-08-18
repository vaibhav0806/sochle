export type Money = {
  currency: "INR";
  minor: number;
};

export type DataConfidence = "high" | "medium" | "low";

export type FinancialSource =
  | "total_balance"
  | "bank_accounts"
  | "credit_cards"
  | "transactions"
  | "spending_summary"
  | "recurring_expenses"
  | "upcoming_recurring_cycles"
  | "net_worth"
  | "net_worth_history"
  | "mutual_funds"
  | "stocks";

export type SourceFreshness = {
  source: FinancialSource;
  refreshedAt: string | null;
  status: "fresh" | "aging" | "stale" | "missing";
  uncertaintyEffect?: { maxMinor: number; minMinor: number };
};

export type ExpectedIncome = {
  amount: Money;
  certainty: "confirmed" | "estimated";
  dueOn: string;
  id: string;
  name: string;
  source: "salary" | "other";
};

export type AccountExclusion = {
  sourceAccountId: string;
  reason: "user_excluded" | "passively_tracked" | "pending_connection" | string;
};

export type UpcomingObligation = {
  amount: Money;
  budgetTreatment: "inside_essential_budget" | "additional";
  certainty: "confirmed" | "estimated";
  dueOn: string;
  id: string;
  name: string;
  source: "credit_card" | "recurring_expense";
};

export type NormalizedAccount = {
  balance: Money | null;
  institution: string;
  lastRefreshedAt: string | null;
  maskedDisplayName: string;
  sourceAccountId: string;
  status: "active" | "pending" | "excluded";
  type: "bank" | "credit_card";
};

export type NormalizedTransaction = {
  accountSourceId: string;
  amount: Money;
  canonicalMerchant: string | null;
  cashFlowInclusion: "included" | "excluded";
  confidence: DataConfidence;
  date: string;
  direction: "credit" | "debit";
  rawMerchant: string | null;
  sochleClassification:
    | "consumption"
    | "investment"
    | "transfer"
    | "credit_card_payment"
    | "refund"
    | "lending"
    | "income"
    | "unclassified";
  sourceCategory: string | null;
  sourceTransactionId: string;
};

export type NormalizedFinancialState = {
  accounts: NormalizedAccount[];
  asOf: string;
  cardObligations: Money;
  exclusions: AccountExclusion[];
  expectedIncome: ExpectedIncome[];
  investmentContext: {
    mutualFunds: Money | null;
    netWorth: Money | null;
    stocks: Money | null;
  };
  liquidCash: Money;
  observedMonthlySpending: Money;
  reconciliation: Array<{
    differenceMinor: number;
    headline: "card_obligations" | "liquid_cash";
    headlineMinor: number;
    projectedMinor: number;
    status: "matched" | "mismatch";
  }>;
  sourceFreshness: SourceFreshness[];
  transactions: NormalizedTransaction[];
  upcomingObligations: UpcomingObligation[];
};

export interface FinancialDataProvider {
  sync(signal?: AbortSignal): Promise<NormalizedFinancialState>;
}
