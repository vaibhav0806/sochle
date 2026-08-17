import type {
  DataConfidence,
  FinancialSource,
  Money,
  NormalizedAccount,
  NormalizedFinancialState,
  NormalizedTransaction,
  SourceFreshness,
  UpcomingObligation,
} from "@sochle/domain";

import { foldSchemas } from "./schemas";
import type { FoldTransaction } from "./schemas";

type FoldSnapshotInput = Record<
  | "bankAccounts"
  | "creditCards"
  | "mutualFunds"
  | "netWorth"
  | "recurringExpenses"
  | "spendingSummary"
  | "stocks"
  | "totalBalance"
  | "transactions"
  | "upcomingCycles",
  unknown
>;

const SIX_HOURS_MS = 6 * 60 * 60 * 1000;
const TWENTY_FOUR_HOURS_MS = 24 * 60 * 60 * 1000;

function toMoney(rupees: number): Money {
  const minor = Math.round(rupees * 100);
  if (!Number.isSafeInteger(minor)) {
    throw new Error("Fold money value is outside the safe integer range");
  }

  return { currency: "INR", minor };
}

function latestTimestamp(values: Array<string | null>): string | null {
  const timestamps = values.filter((value): value is string => value !== null);
  if (timestamps.length === 0) {
    return null;
  }

  return timestamps.reduce((latest, value) =>
    new Date(value).getTime() > new Date(latest).getTime() ? value : latest
  );
}

function freshness(
  source: FinancialSource,
  refreshedAt: string | null,
  syncedAt: string
): SourceFreshness {
  if (refreshedAt === null) {
    return { refreshedAt, source, status: "missing" };
  }

  const age = new Date(syncedAt).getTime() - new Date(refreshedAt).getTime();
  const status = age <= SIX_HOURS_MS ? "fresh" : age <= TWENTY_FOUR_HOURS_MS ? "aging" : "stale";

  return { refreshedAt, source, status };
}

function transactionClassification(
  transaction: FoldTransaction
): NormalizedTransaction["sochleClassification"] {
  const category = transaction.category?.name.toLowerCase() ?? "";
  if (category.includes("credit card")) return "credit_card_payment";
  if (category.includes("investment")) return "investment";
  if (category.includes("refund")) return "refund";
  if (transaction.excluded_from_cash_flow) return "transfer";
  if (transaction.type.toLowerCase() === "credit") return "income";
  return "unclassified";
}

function confidenceForTransaction(
  classification: NormalizedTransaction["sochleClassification"]
): DataConfidence {
  return classification === "unclassified" ? "medium" : "high";
}

export function normalizeFoldSnapshot(
  input: FoldSnapshotInput,
  syncedAt: string
): NormalizedFinancialState {
  const totalBalance = foldSchemas.totalBalance.parse(input.totalBalance);
  const bankAccounts = foldSchemas.bankAccounts.parse(input.bankAccounts);
  const creditCards = foldSchemas.creditCards.parse(input.creditCards);
  const transactions = foldSchemas.transactions.parse(input.transactions);
  const spendingSummary = foldSchemas.spendingSummary.parse(input.spendingSummary);
  const recurringExpenses = foldSchemas.recurringExpenses.parse(input.recurringExpenses);
  const upcomingCycles = foldSchemas.upcomingCycles.parse(input.upcomingCycles);
  const netWorth = foldSchemas.netWorth.parse(input.netWorth);
  const mutualFunds = foldSchemas.mutualFunds.parse(input.mutualFunds);
  const stocks = foldSchemas.stocks.parse(input.stocks);

  const exclusions = (totalBalance.excluded_accounts ?? []).map((account) => ({
    reason: account.reason,
    sourceAccountId: account.id,
  }));
  const exclusionByAccount = new Map(exclusions.map((item) => [item.sourceAccountId, item.reason]));

  const normalizedBankAccounts: NormalizedAccount[] = (bankAccounts.accounts ?? []).map(
    (account) => ({
      balance: account.balance === null ? null : toMoney(account.balance),
      institution: account.bank_name,
      lastRefreshedAt: account.last_refreshed_at,
      maskedDisplayName: `${account.nickname ?? account.bank_name} ${account.masked_number}`,
      sourceAccountId: account.id,
      status: account.is_pending_connection
        ? "pending"
        : exclusionByAccount.has(account.id) || account.tracking !== "ACTIVELY"
          ? "excluded"
          : "active",
      type: "bank",
    })
  );

  const normalizedCardAccounts: NormalizedAccount[] = (creditCards.credit_cards ?? []).map(
    (card) => ({
      balance: toMoney(card.relationship?.role === "CHILD" ? 0 : card.outstanding),
      institution: card.issuer_name,
      lastRefreshedAt: card.last_synced_at,
      maskedDisplayName: `${card.nickname ?? card.card_name} ••${card.card_last_four}`,
      sourceAccountId: card.id,
      status: "active",
      type: "credit_card",
    })
  );

  const payableCards = (creditCards.credit_cards ?? []).filter(
    (card) => card.relationship?.role !== "CHILD" && card.outstanding > 0
  );
  const cardObligations = toMoney(
    payableCards.reduce((total, card) => total + card.outstanding, 0)
  );
  const cardUpcoming: UpcomingObligation[] = payableCards.flatMap((card) => {
    const cycle = card.current_cycle?.payment_due_date
      ? card.current_cycle
      : card.previous_cycle?.payment_due_date
        ? card.previous_cycle
        : null;
    if (cycle?.payment_due_date === null || cycle === null) return [];

    return [
      {
        amount: toMoney(card.outstanding),
        certainty: "confirmed",
        dueOn: cycle.payment_due_date,
        id: `card:${card.id}`,
        name: card.nickname ?? card.card_name,
        source: "credit_card",
      },
    ];
  });

  const recurringUpcoming: UpcomingObligation[] = (upcomingCycles.cycles ?? []).flatMap((cycle) => {
    const rupees = cycle.expected_amount ?? cycle.amount;
    if (cycle.due_status === "PAID" || cycle.due_date === null || rupees === null) return [];

    return [
      {
        amount: toMoney(rupees),
        certainty: cycle.expected_amount === null ? "estimated" : "confirmed",
        dueOn: cycle.due_date,
        id: cycle.id,
        name: cycle.expense_name,
        source: "recurring_expense",
      },
    ];
  });
  const projectedExpenseIds = new Set(
    (upcomingCycles.cycles ?? []).map((cycle) => cycle.expense_id)
  );
  const recurringFallback: UpcomingObligation[] = (recurringExpenses.expenses ?? []).flatMap(
    (expense) => {
      const rupees = expense.amount ?? expense.average_amount_paid;
      if (
        projectedExpenseIds.has(expense.id) ||
        expense.is_current_cycle_paid === true ||
        expense.next_due_date === null ||
        rupees === null
      ) {
        return [];
      }

      return [
        {
          amount: toMoney(rupees),
          certainty: "estimated",
          dueOn: expense.next_due_date,
          id: `recurring:${expense.id}`,
          name: expense.name,
          source: "recurring_expense",
        },
      ];
    }
  );

  const normalizedTransactions: NormalizedTransaction[] = (transactions.transactions ?? []).map(
    (transaction) => {
      const classification = transactionClassification(transaction);
      return {
        accountSourceId: transaction.account_id,
        amount: toMoney(transaction.remaining_refund_amount ?? transaction.amount),
        canonicalMerchant: null,
        cashFlowInclusion: transaction.excluded_from_cash_flow ? "excluded" : "included",
        confidence: confidenceForTransaction(classification),
        date: transaction.date.slice(0, 10),
        direction: transaction.type.toLowerCase() === "credit" ? "credit" : "debit",
        rawMerchant: transaction.merchant_name,
        sochleClassification: classification,
        sourceCategory: transaction.category?.name ?? null,
        sourceTransactionId: transaction.id,
      };
    }
  );

  const bankRefreshedAt = latestTimestamp(
    (bankAccounts.accounts ?? []).map((account) => account.last_refreshed_at)
  );
  const cardsRefreshedAt = latestTimestamp(
    (creditCards.credit_cards ?? []).map((card) => card.last_synced_at)
  );

  return {
    accounts: [...normalizedBankAccounts, ...normalizedCardAccounts],
    asOf: syncedAt,
    cardObligations,
    exclusions,
    investmentContext: {
      mutualFunds: toMoney(mutualFunds.total_current_value),
      netWorth: toMoney(netWorth.total),
      stocks: toMoney(stocks.total_current_value),
    },
    liquidCash: toMoney(totalBalance.total),
    observedMonthlySpending: toMoney(spendingSummary.total_amount),
    sourceFreshness: [
      freshness("total_balance", totalBalance.as_of, syncedAt),
      freshness("bank_accounts", bankRefreshedAt, syncedAt),
      freshness("credit_cards", cardsRefreshedAt, syncedAt),
      freshness("transactions", syncedAt, syncedAt),
      freshness("spending_summary", syncedAt, syncedAt),
      freshness("recurring_expenses", syncedAt, syncedAt),
      freshness("upcoming_recurring_cycles", syncedAt, syncedAt),
      freshness("net_worth", netWorth.as_of, syncedAt),
      freshness("mutual_funds", mutualFunds.last_refresh_date, syncedAt),
      freshness("stocks", stocks.last_refresh_date, syncedAt),
    ],
    transactions: normalizedTransactions,
    upcomingObligations: [...cardUpcoming, ...recurringUpcoming, ...recurringFallback],
  };
}
