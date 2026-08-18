import { describe, expect, it } from "vitest";

import { evaluatePurchase } from "./evaluate-purchase";
import { REQUIRED_DECISION_SOURCES } from "./confidence";
import type { EvaluatePurchaseInput } from "./evaluate-purchase";

function input(): EvaluatePurchaseInput {
  const evaluatedAt = "2026-08-17T12:00:00.000Z";
  return {
    dataIssues: [],
    evaluatedAt,
    financialState: {
      accounts: [],
      asOf: evaluatedAt,
      cardObligations: { currency: "INR", minor: 0 },
      exclusions: [],
      expectedIncome: [],
      investmentContext: { mutualFunds: null, netWorth: null, stocks: null },
      liquidCash: { currency: "INR", minor: 100_000_00 },
      observedMonthlySpending: { currency: "INR", minor: 20_000_00 },
      reconciliation: [],
      sourceFreshness: REQUIRED_DECISION_SOURCES.map((source) => ({
        refreshedAt: "2026-08-17T06:00:00.000Z",
        source,
        status: "fresh",
      })),
      transactions: [],
      upcomingObligations: [],
    },
    plannedPurchases: [],
    price: { currency: "INR", minor: 10_000_00 },
    rules: {
      essentialMonthlySpending: { currency: "INR", minor: 20_000_00 },
      forecastHorizon: { days: 30, kind: "rolling_days" },
      largePurchaseThreshold: { currency: "INR", minor: 10_000_00 },
      materiality: {
        absoluteCap: { currency: "INR", minor: 5_000_00 },
        purchaseRatioBps: 1_000,
      },
      minimumBuffer: { currency: "INR", minor: 20_000_00 },
      monthlyInvestmentTarget: { currency: "INR", minor: 10_000_00 },
      salary: { amount: { currency: "INR", minor: 0 }, confirmed: true, dayOfMonth: 31 },
      version: 1,
    },
    snapshotId: "synthetic-snapshot",
  };
}

describe("evaluatePurchase", () => {
  it("does not mutate its input", () => {
    const purchase = input();
    const before = structuredClone(purchase);

    evaluatePurchase(purchase);

    expect(purchase).toEqual(before);
  });

  it("gates a stale source to insufficient confidence", () => {
    const purchase = input();
    purchase.financialState.sourceFreshness = purchase.financialState.sourceFreshness.map(
      (source) => ({ ...source, refreshedAt: "2026-08-16T11:59:00.000Z", status: "stale" })
    );

    const result = evaluatePurchase(purchase);

    expect(result.financialVerdict).toBe("comfortably_affordable");
    expect(result.confidence.level).toBe("low");
    expect(result.verdict).toBe("insufficient_confidence");
  });

  it("reserves an undated card remainder immediately without blocking confidence", () => {
    const purchase = input();
    purchase.financialState.cardObligations = { currency: "INR", minor: 20_000_00 };

    const result = evaluatePurchase(purchase);

    expect(result.inputs.immediateObligationsMinor).toBe(20_000_00);
    expect(result.headrooms.technicalMinor).toBe(70_000_00);
    expect(result.confidence.blockingIssueIds).not.toContain("derived:undated-card-obligation");
    expect(result.confidence.level).toBe("high");
    expect(result.verdict).not.toBe("insufficient_confidence");
  });

  it("excludes estimated obligations and marks the assumption unconfirmed", () => {
    const purchase = input();
    purchase.financialState.upcomingObligations = [
      {
        amount: { currency: "INR", minor: 5_000_00 },
        budgetTreatment: "additional",
        certainty: "estimated",
        dueOn: "2026-08-20",
        id: "estimated-bill",
        name: "Estimated bill",
        source: "recurring_expense",
      },
    ];

    const result = evaluatePurchase(purchase);

    expect(result.inputs.confirmedObligationsMinor).toBe(0);
    expect(result.confidence.level).toBe("low");
  });

  it("rejects invalid price and an expired custom horizon", () => {
    expect(() => evaluatePurchase({ ...input(), price: { currency: "INR", minor: 0 } })).toThrow(
      "Purchase price must be a positive safe integer"
    );
    expect(() =>
      evaluatePurchase({
        ...input(),
        rules: {
          ...input().rules,
          forecastHorizon: { endDate: "2026-08-16", kind: "custom" },
        },
      })
    ).toThrow("Custom horizon cannot be before the reference date");
  });

  it("evaluates signed liquid cash instead of rejecting an overdrawn state", () => {
    const purchase = input();
    purchase.financialState.liquidCash = { currency: "INR", minor: -1_000_00 };

    expect(evaluatePurchase(purchase).headrooms.technicalMinor).toBe(-11_000_00);
  });

  it("deduplicates an exact normalized salary from the configured recurrence", () => {
    const purchase = input();
    purchase.rules.salary.amount = { currency: "INR", minor: 10_000_00 };
    purchase.financialState.expectedIncome = [
      {
        amount: { currency: "INR", minor: 10_000_00 },
        certainty: "confirmed",
        dueOn: "2026-08-31",
        id: "fold-salary",
        name: "Synthetic salary",
        source: "salary",
      },
    ];

    expect(evaluatePurchase(purchase).inputs.expectedIncomeMinor).toBe(10_000_00);
  });

  it("gates a possible duplicate salary with a conflicting amount", () => {
    const purchase = input();
    purchase.rules.salary.amount = { currency: "INR", minor: 10_000_00 };
    purchase.financialState.expectedIncome = [
      {
        amount: { currency: "INR", minor: 9_000_00 },
        certainty: "confirmed",
        dueOn: "2026-08-31",
        id: "fold-salary",
        name: "Synthetic salary",
        source: "salary",
      },
    ];

    const result = evaluatePurchase(purchase);
    expect(result.inputs.expectedIncomeMinor).toBe(9_000_00);
    expect(result.confidence.blockingIssueIds).toContain("derived:possible-duplicate-salary");
  });

  it("gates legacy obligations without budget treatment and conflicting card totals", () => {
    const purchase = input();
    const obligation = {
      amount: { currency: "INR", minor: 5_000_00 },
      certainty: "confirmed" as const,
      dueOn: "2026-08-20",
      id: "legacy-card",
      name: "Legacy card",
      source: "credit_card" as const,
    };
    purchase.financialState.upcomingObligations = [
      obligation as (typeof purchase.financialState.upcomingObligations)[number],
    ];

    const result = evaluatePurchase(purchase);
    expect(result.inputs.additionalObligationsMinor).toBe(5_000_00);
    expect(result.confidence.blockingIssueIds).toEqual(
      expect.arrayContaining([
        "derived:obligation-budget:legacy-card",
        "derived:card-obligation-conflict",
      ])
    );
  });

  it("excludes estimated and out-of-horizon income", () => {
    const purchase = input();
    purchase.financialState.expectedIncome = [
      {
        amount: { currency: "INR", minor: 5_000_00 },
        certainty: "estimated",
        dueOn: "2026-08-20",
        id: "estimated-income",
        name: "Estimated income",
        source: "other",
      },
      {
        amount: { currency: "INR", minor: 5_000_00 },
        certainty: "confirmed",
        dueOn: "2026-09-20",
        id: "late-income",
        name: "Late income",
        source: "other",
      },
    ];

    const result = evaluatePurchase(purchase);
    expect(result.inputs.expectedIncomeMinor).toBe(0);
    expect(result.confidence.level).toBe("low");
  });

  it("rejects malformed financial money, timestamps, and overflowing totals", () => {
    expect(() => evaluatePurchase({ ...input(), evaluatedAt: "not-a-timestamp" })).toThrow(
      "Evaluation timestamp must be ISO 8601"
    );
    expect(() =>
      evaluatePurchase({
        ...input(),
        financialState: {
          ...input().financialState,
          liquidCash: { currency: "INR", minor: 1.5 },
        },
      })
    ).toThrow("Liquid cash must use safe integer INR paise");
    expect(() =>
      evaluatePurchase({
        ...input(),
        financialState: {
          ...input().financialState,
          cardObligations: { currency: "INR", minor: -1 },
        },
      })
    ).toThrow("Card obligations must be a non-negative safe integer");
    expect(() =>
      evaluatePurchase({
        ...input(),
        plannedPurchases: [
          {
            amount: { currency: "INR", minor: Number.MAX_SAFE_INTEGER },
            dueOn: "2026-08-20",
            id: "one",
          },
          {
            amount: { currency: "INR", minor: Number.MAX_SAFE_INTEGER },
            dueOn: "2026-08-21",
            id: "two",
          },
        ],
      })
    ).toThrow("Money calculation exceeded safe range");
  });
});
