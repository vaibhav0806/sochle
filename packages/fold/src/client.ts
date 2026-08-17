import type { z } from "zod";

import { foldSchemas } from "./schemas";
import type { FoldSnapshotResponses } from "./schemas";

export type FoldMcpToolClient = {
  callTool(request: {
    arguments?: Record<string, unknown> | undefined;
    name: string;
  }): Promise<{ isError?: boolean | undefined; structuredContent?: unknown }>;
};

type TransactionFilters = {
  end_date: string;
  exclude_non_cashflow: boolean;
  sort_by: "amount" | "date";
  sort_order: "asc" | "desc";
  start_date: string;
};

type TransactionsPage = z.infer<typeof foldSchemas.transactions>;
type RecurringExpensesPage = z.infer<typeof foldSchemas.recurringExpenses>;

export type FoldSyncPayload = {
  netWorthHistory: z.infer<typeof foldSchemas.netWorthHistory>;
  snapshot: FoldSnapshotResponses;
};

function dateOnly(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export class FoldGateway {
  constructor(private readonly client: FoldMcpToolClient) {}

  private async call<T>(
    name: string,
    schema: z.ZodType<T>,
    args?: Record<string, unknown>
  ): Promise<T> {
    const result = await this.client.callTool({
      ...(args === undefined ? {} : { arguments: args }),
      name,
    });
    if (result.isError === true) {
      throw new Error(`Fold tool ${name} failed`);
    }
    return schema.parse(result.structuredContent);
  }

  getTotalBalance() {
    return this.call("get_total_balance", foldSchemas.totalBalance);
  }

  getTransaction(transactionId: string) {
    return this.call("get_transaction", foldSchemas.transactionDetail, {
      transaction_id: transactionId,
    });
  }

  async listAllTransactions(filters: TransactionFilters) {
    const collected: NonNullable<z.infer<typeof foldSchemas.transactions>["transactions"]> = [];
    let cursor: string | null = null;
    let totalMatched = 0;

    do {
      const page: TransactionsPage = await this.call(
        "list_transactions",
        foldSchemas.transactions,
        {
          ...filters,
          ...(cursor === null ? {} : { cursor }),
          limit: 100,
        }
      );
      collected.push(...(page.transactions ?? []));
      totalMatched = Math.max(totalMatched, page.total_matched);
      cursor = page.next_cursor;
    } while (cursor !== null);

    return {
      count: collected.length,
      next_cursor: null,
      total_matched: totalMatched,
      transactions: collected,
    };
  }

  async listAllRecurringExpenses() {
    const collected: NonNullable<z.infer<typeof foldSchemas.recurringExpenses>["expenses"]> = [];
    let cursor: string | null = null;

    do {
      const page: RecurringExpensesPage = await this.call(
        "list_recurring_expenses",
        foldSchemas.recurringExpenses,
        {
          ...(cursor === null ? {} : { cursor }),
          limit: 100,
          status: "ACTIVE",
        }
      );
      collected.push(...(page.expenses ?? []));
      cursor = page.next_cursor;
    } while (cursor !== null);

    return { expenses: collected, next_cursor: null };
  }

  async fetchSyncPayload(syncedAt: Date): Promise<FoldSyncPayload> {
    const historyStart = new Date(syncedAt);
    historyStart.setUTCDate(historyStart.getUTCDate() - 90);
    const transactionEnd = new Date(syncedAt);
    transactionEnd.setUTCDate(transactionEnd.getUTCDate() + 1);
    const cycleEnd = new Date(syncedAt);
    cycleEnd.setUTCDate(cycleEnd.getUTCDate() + 30);

    const [
      totalBalance,
      bankAccounts,
      creditCards,
      transactions,
      spendingSummary,
      recurringExpenses,
      upcomingCycles,
      netWorth,
      netWorthHistory,
      mutualFunds,
      stocks,
    ] = await Promise.all([
      this.getTotalBalance(),
      this.call("list_bank_accounts", foldSchemas.bankAccounts),
      this.call("list_credit_cards", foldSchemas.creditCards),
      this.listAllTransactions({
        end_date: dateOnly(transactionEnd),
        exclude_non_cashflow: false,
        sort_by: "date",
        sort_order: "desc",
        start_date: dateOnly(historyStart),
      }),
      this.call("get_spending_summary", foldSchemas.spendingSummary, {
        include_icon_breakdown: false,
        month: syncedAt.getUTCMonth() + 1,
        year: syncedAt.getUTCFullYear(),
      }),
      this.listAllRecurringExpenses(),
      this.call("list_upcoming_recurring_cycles", foldSchemas.upcomingCycles, {
        from: dateOnly(syncedAt),
        to: dateOnly(cycleEnd),
      }),
      this.call("get_net_worth", foldSchemas.netWorth),
      this.call("get_net_worth_history", foldSchemas.netWorthHistory, { range: "3m" }),
      this.call("get_mf_portfolio_summary", foldSchemas.mutualFunds),
      this.call("get_stocks_portfolio_summary", foldSchemas.stocks),
    ]);

    return {
      netWorthHistory,
      snapshot: {
        bankAccounts,
        creditCards,
        mutualFunds,
        netWorth,
        recurringExpenses,
        spendingSummary,
        stocks,
        totalBalance,
        transactions,
        upcomingCycles,
      },
    };
  }
}
