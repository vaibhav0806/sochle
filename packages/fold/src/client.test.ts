import { foldCoreResponses } from "@sochle/fixtures";
import { describe, expect, it } from "vitest";

import { FoldGateway } from "./client";

describe("FoldGateway", () => {
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

  it("surfaces an MCP tool error without parsing it as data", async () => {
    const gateway = new FoldGateway({
      async callTool() {
        return { isError: true, structuredContent: { message: "rate limited" } };
      },
    });

    await expect(gateway.getTotalBalance()).rejects.toThrow("Fold tool get_total_balance failed");
  });
});
