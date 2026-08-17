import { foldCoreResponses } from "@sochle/fixtures";
import { describe, expect, it } from "vitest";

import { foldSchemas } from "./schemas";

describe("Fold response contracts", () => {
  it("accepts sanitized live-shape core responses", () => {
    expect(foldSchemas.totalBalance.parse(foldCoreResponses.totalBalance).total).toBe(250000.25);
    expect(foldSchemas.bankAccounts.parse(foldCoreResponses.bankAccounts).accounts).toHaveLength(2);
    expect(foldSchemas.creditCards.parse(foldCoreResponses.creditCards).credit_cards).toHaveLength(
      2
    );
    expect(
      foldSchemas.transactions.parse(foldCoreResponses.transactions).transactions
    ).toHaveLength(1);
    expect(foldSchemas.spendingSummary.parse(foldCoreResponses.spendingSummary).month).toBe(8);
    expect(
      foldSchemas.recurringExpenses.parse(foldCoreResponses.recurringExpenses).expenses
    ).toHaveLength(1);
    expect(foldSchemas.upcomingCycles.parse(foldCoreResponses.upcomingCycles).cycles).toHaveLength(
      1
    );
  });

  it("rejects a balance response without the aggregate total", () => {
    expect(() => foldSchemas.totalBalance.parse({ currency: "INR" })).toThrow();
  });

  it("accepts nullable collection fields returned by disconnected sources", () => {
    expect(foldSchemas.bankAccounts.parse({ accounts: null })).toEqual({ accounts: null });
    expect(
      foldSchemas.transactions.parse({
        count: 0,
        next_cursor: null,
        total_matched: 0,
        transactions: null,
      })
    ).toMatchObject({ transactions: null });
  });
});
