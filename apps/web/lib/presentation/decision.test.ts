import { forbiddenPrimaryTerms } from "@sochle/contracts";
import {
  evaluatePurchase,
  REQUIRED_DECISION_SOURCES,
  type DecisionResult,
  type Verdict,
} from "@sochle/domain";
import { describe, expect, it } from "vitest";

import { presentDecision } from "./decision";

const evaluatedAt = "2026-08-19T06:00:00.000Z";
const base = evaluatePurchase({
  dataIssues: [],
  evaluatedAt,
  financialState: {
    accounts: [],
    asOf: evaluatedAt,
    cardObligations: { currency: "INR", minor: 10_000_00 },
    exclusions: [],
    expectedIncome: [],
    investmentContext: { mutualFunds: null, netWorth: null, stocks: null },
    liquidCash: { currency: "INR", minor: 150_000_00 },
    observedMonthlySpending: { currency: "INR", minor: 40_000_00 },
    reconciliation: [],
    sourceFreshness: REQUIRED_DECISION_SOURCES.map((source) => ({
      refreshedAt: evaluatedAt,
      source,
      status: "fresh" as const,
    })),
    transactions: [],
    upcomingObligations: [],
  },
  plannedPurchases: [],
  price: { currency: "INR", minor: 45_000_00 },
  rules: {
    essentialMonthlySpending: { currency: "INR", minor: 40_000_00 },
    forecastHorizon: { days: 30, kind: "rolling_days" },
    largePurchaseThreshold: { currency: "INR", minor: 10_000_00 },
    materiality: {
      absoluteCap: { currency: "INR", minor: 5_000_00 },
      purchaseRatioBps: 1_000,
    },
    minimumBuffer: { currency: "INR", minor: 25_000_00 },
    monthlyInvestmentTarget: { currency: "INR", minor: 20_000_00 },
    salary: { amount: { currency: "INR", minor: 0 }, confirmed: true, dayOfMonth: 31 },
    version: 1,
  },
  snapshotId: "synthetic-snapshot",
});

function result(verdict: Verdict): DecisionResult {
  return { ...base, verdict };
}

describe("decision presentation", () => {
  it.each([
    ["comfortably_affordable", "comfortable", "Yes, this fits comfortably."],
    ["affordable_with_tradeoffs", "tradeoff", "This fits, with one trade-off."],
    ["wait_until_payday", "wait", "Better to wait a little."],
    ["requires_reducing_investments", "tradeoff", "This fits, but it moves one goal."],
    ["technically_possible_financially_tight", "tight", "This would make things too tight."],
    ["not_affordable", "no", "This doesn't fit right now."],
    ["insufficient_confidence", "needs-input", "We need one detail first."],
  ] as const)("maps %s to a clear answer", (verdict, tone, title) => {
    expect(presentDecision(result(verdict))).toMatchObject({ title, tone });
  });

  it("keeps primary copy free of implementation vocabulary", () => {
    for (const verdict of [
      "comfortably_affordable",
      "affordable_with_tradeoffs",
      "wait_until_payday",
      "requires_reducing_investments",
      "technically_possible_financially_tight",
      "not_affordable",
      "insufficient_confidence",
    ] as const) {
      const presentation = presentDecision(result(verdict));
      const copy = [
        presentation.title,
        presentation.consequence,
        presentation.suggestedAction ?? "",
        presentation.recencyLabel,
        ...presentation.mathsRows.map((row) => row.label),
      ]
        .join(" ")
        .toLowerCase();
      for (const term of forbiddenPrimaryTerms) {
        expect(copy).not.toContain(term.toLowerCase());
      }
    }
  });

  it.each([
    ["aging", "comfortably_affordable", "Based on your latest available picture"],
    ["stale", "comfortably_affordable", "Based on your latest available picture"],
    ["missing", "insufficient_confidence", "Update needed"],
  ] as const)("translates %s data into a quiet recency note", (status, verdict, label) => {
    const presentation = presentDecision({
      ...result(verdict),
      inputs: {
        ...base.inputs,
        financialState: {
          ...base.inputs.financialState,
          sourceFreshness: base.inputs.financialState.sourceFreshness.map((source) => ({
            ...source,
            status,
          })),
        },
      },
    });

    expect(presentation.recencyLabel).toBe(label);
  });

  it("uses a plain fallback when no better date is available", () => {
    const presentation = presentDecision({
      ...base,
      firstComfortablyAffordableDate: null,
    });

    expect(presentation.mathsRows.at(-1)).toEqual({
      label: "Better buying date",
      value: "Not within the current window",
    });
  });
});
