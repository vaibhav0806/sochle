import { foldCoreResponses } from "@sochle/fixtures";
import { describe, expect, it } from "vitest";

import { FoldGateway } from "./client";

describe("FoldGateway", () => {
  it("fetches and assembles every normalized snapshot source", async () => {
    const toolNames: string[] = [];
    const responses: Record<string, unknown> = {
      get_mf_portfolio_summary: foldCoreResponses.mutualFunds,
      get_net_worth: foldCoreResponses.netWorth,
      get_net_worth_history: foldCoreResponses.netWorthHistory,
      get_spending_summary: foldCoreResponses.spendingSummary,
      get_stocks_portfolio_summary: foldCoreResponses.stocks,
      get_total_balance: foldCoreResponses.totalBalance,
      list_bank_accounts: foldCoreResponses.bankAccounts,
      list_credit_cards: foldCoreResponses.creditCards,
      list_recurring_expenses: foldCoreResponses.recurringExpenses,
      list_transactions: foldCoreResponses.transactions,
      list_upcoming_recurring_cycles: foldCoreResponses.upcomingCycles,
    };
    const gateway = new FoldGateway({
      async callTool(request) {
        toolNames.push(request.name);
        return { structuredContent: responses[request.name] };
      },
    });

    const payload = await gateway.fetchSyncPayload(new Date("2026-08-17T06:30:00.000Z"));

    expect(payload.snapshot.totalBalance.total).toBe(250000.25);
    expect(payload.netWorthHistory).toEqual(foldCoreResponses.netWorthHistory);
    expect(toolNames).toEqual(
      expect.arrayContaining([
        "get_total_balance",
        "list_bank_accounts",
        "list_credit_cards",
        "list_transactions",
        "get_spending_summary",
        "list_recurring_expenses",
        "list_upcoming_recurring_cycles",
        "get_net_worth",
        "get_net_worth_history",
        "get_mf_portfolio_summary",
        "get_stocks_portfolio_summary",
      ])
    );
  });

  it("walks transaction cursors while preserving filters", async () => {
    const calls: Array<{ arguments?: Record<string, unknown> | undefined; name: string }> = [];
    const firstTransaction = foldCoreResponses.transactions.transactions[0]!;
    const secondTransaction = { ...firstTransaction, id: "demo_transaction_2" };
    const responses = [
      {
        structuredContent: {
          count: 1,
          next_cursor: "cursor_2",
          total_matched: 2,
          transactions: [firstTransaction],
        },
      },
      {
        structuredContent: {
          count: 1,
          next_cursor: null,
          total_matched: 0,
          transactions: [secondTransaction],
        },
      },
    ];
    const gateway = new FoldGateway({
      async callTool(request) {
        calls.push(request);
        return responses.shift()!;
      },
    });

    const transactions = await gateway.listAllTransactions({
      end_date: "2026-08-18",
      exclude_non_cashflow: false,
      sort_by: "date",
      sort_order: "desc",
      start_date: "2026-07-18",
    });

    expect(transactions.transactions?.map((transaction) => transaction.id)).toEqual([
      "demo_transaction_untagged",
      "demo_transaction_2",
    ]);
    expect(calls).toEqual([
      {
        arguments: {
          end_date: "2026-08-18",
          exclude_non_cashflow: false,
          limit: 100,
          sort_by: "date",
          sort_order: "desc",
          start_date: "2026-07-18",
        },
        name: "list_transactions",
      },
      {
        arguments: {
          cursor: "cursor_2",
          end_date: "2026-08-18",
          exclude_non_cashflow: false,
          limit: 100,
          sort_by: "date",
          sort_order: "desc",
          start_date: "2026-07-18",
        },
        name: "list_transactions",
      },
    ]);
  });

  it("rejects malformed structured tool output", async () => {
    const gateway = new FoldGateway({
      async callTool() {
        return { structuredContent: { currency: "INR" } };
      },
    });

    await expect(gateway.getTotalBalance()).rejects.toThrow();
  });

  it("walks recurring-expense cursors and retrieves one transaction on demand", async () => {
    const calls: string[] = [];
    const expense = foldCoreResponses.recurringExpenses.expenses[0]!;
    const responses = [
      {
        structuredContent: {
          expenses: [expense],
          next_cursor: "recurring_cursor_2",
        },
      },
      {
        structuredContent: {
          expenses: [{ ...expense, id: "demo_recurring_2" }],
          next_cursor: null,
        },
      },
      {
        structuredContent: {
          found: true,
          transaction: foldCoreResponses.transactions.transactions[0],
        },
      },
    ];
    const gateway = new FoldGateway({
      async callTool(request) {
        calls.push(request.name);
        return responses.shift()!;
      },
    });

    const recurring = await gateway.listAllRecurringExpenses();
    const transaction = await gateway.getTransaction("demo_transaction_untagged");

    expect(recurring.expenses.map((item) => item.id)).toEqual([expense.id, "demo_recurring_2"]);
    expect(transaction).toMatchObject({
      found: true,
      transaction: { id: "demo_transaction_untagged" },
    });
    expect(calls).toEqual([
      "list_recurring_expenses",
      "list_recurring_expenses",
      "get_transaction",
    ]);
  });

  it("surfaces an MCP tool error without parsing it as data", async () => {
    const gateway = new FoldGateway({
      async callTool() {
        return { isError: true, structuredContent: { message: "rate limited" } };
      },
    });

    await expect(gateway.getTotalBalance()).rejects.toThrow("Fold tool get_total_balance failed");
  });
});
