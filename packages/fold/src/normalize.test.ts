import { foldCoreResponses } from "@sochle/fixtures";
import { describe, expect, it } from "vitest";

import { normalizeFoldSnapshot } from "./normalize";

describe("normalizeFoldSnapshot", () => {
  it("normalizes rupees to integer paise and preserves account exclusions", () => {
    const state = normalizeFoldSnapshot(foldCoreResponses, "2026-08-17T06:30:00.000Z");

    expect(state.liquidCash.minor).toBe(25_000_025);
    expect(state.observedMonthlySpending.minor).toBe(3_500_050);
    expect(
      state.accounts.find((account) => account.sourceAccountId === "demo_bank_excluded")?.status
    ).toBe("excluded");
    expect(state.exclusions).toContainEqual({
      reason: "passively_tracked",
      sourceAccountId: "demo_bank_excluded",
    });
    expect(
      state.accounts.find((account) => account.sourceAccountId === "demo_bank_pending")?.status
    ).toBe("pending");
    expect(state.reconciliation).toEqual([
      expect.objectContaining({ headline: "liquid_cash", status: "matched" }),
      expect.objectContaining({ headline: "card_obligations", status: "matched" }),
    ]);
  });

  it("records a specific difference when a headline does not reconcile", () => {
    const state = normalizeFoldSnapshot(
      {
        ...foldCoreResponses,
        totalBalance: { ...foldCoreResponses.totalBalance, total: 250100.25 },
      },
      "2026-08-17T06:30:00.000Z"
    );

    expect(state.reconciliation).toContainEqual({
      differenceMinor: 10_000,
      headline: "liquid_cash",
      headlineMinor: 25_010_025,
      projectedMinor: 25_000_025,
      status: "mismatch",
    });
  });

  it("counts a shared add-on card obligation only on the parent", () => {
    const state = normalizeFoldSnapshot(foldCoreResponses, "2026-08-17T06:30:00.000Z");

    expect(state.cardObligations.minor).toBe(2_000_000);
    expect(state.upcomingObligations.filter((item) => item.source === "credit_card")).toHaveLength(
      1
    );
  });

  it("projects unpaid recurring cycles and data freshness", () => {
    const state = normalizeFoldSnapshot(foldCoreResponses, "2026-08-17T06:30:00.000Z");

    expect(state.upcomingObligations).toContainEqual({
      amount: { currency: "INR", minor: 250_000 },
      budgetTreatment: "additional",
      certainty: "confirmed",
      dueOn: "2026-08-25",
      id: "demo_cycle_1",
      name: "Demo Subscription",
      source: "recurring_expense",
    });
    expect(state.expectedIncome).toEqual([]);
    expect(state.sourceFreshness).toContainEqual({
      refreshedAt: "2026-08-17T06:00:00.000Z",
      source: "total_balance",
      status: "fresh",
    });
    expect(state.sourceFreshness).toContainEqual({
      refreshedAt: "2026-08-17T06:30:00.000Z",
      source: "spending_summary",
      status: "fresh",
    });
  });
});
