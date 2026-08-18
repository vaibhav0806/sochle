import { extensionDecisionCardSchema } from "@sochle/contracts";
import {
  evaluatePurchase,
  REQUIRED_DECISION_SOURCES,
  type DecisionResult,
  type EvaluatePurchaseInput,
} from "@sochle/domain";
import { describe, expect, it } from "vitest";

import { projectExtensionDecision } from "./extension-decision-service";

const decisionId = "00000000-0000-4000-8000-000000000001";
const intentId = "00000000-0000-4000-8000-000000000002";
const evaluatedAt = "2026-08-17T12:00:00.000Z";
const input: EvaluatePurchaseInput = {
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
      refreshedAt: "2026-08-17T06:00:00.000Z",
      source,
      status: "fresh",
    })),
    transactions: [],
    upcomingObligations: [
      {
        amount: { currency: "INR", minor: 20_000_00 },
        budgetTreatment: "inside_essential_budget",
        certainty: "confirmed",
        dueOn: "2026-08-20",
        id: "rent",
        name: "Synthetic rent",
        source: "recurring_expense",
      },
      {
        amount: { currency: "INR", minor: 10_000_00 },
        budgetTreatment: "additional",
        certainty: "confirmed",
        dueOn: "2026-08-22",
        id: "card:synthetic-parent",
        name: "Synthetic card",
        source: "credit_card",
      },
    ],
  },
  plannedPurchases: [
    { amount: { currency: "INR", minor: 5_000_00 }, dueOn: "2026-08-25", id: "shoes" },
  ],
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
    salary: {
      amount: { currency: "INR", minor: 0 },
      confirmed: true,
      dayOfMonth: 31,
    },
    version: 1,
  },
  snapshotId: "synthetic-reference-snapshot",
};

function result(): DecisionResult {
  return evaluatePurchase(structuredClone(input));
}

function saved(decisionResult = result()) {
  return {
    decision: { id: decisionId },
    intent: { id: intentId, priceMinor: 45_000_00 },
    result: decisionResult,
  };
}

describe("projectExtensionDecision", () => {
  it("projects only minimized card-safe values and preserves server copy", () => {
    const decisionResult = result();
    const card = projectExtensionDecision(saved(decisionResult), "http://localhost:3000");

    expect(card).toEqual({
      decisionUrl: `http://localhost:3000/decisions/${decisionId}`,
      evaluatedAt: "2026-08-17T12:00:00.000Z",
      firstComfortablyAffordableDate: "2026-08-17",
      intentId,
      presentation: {
        consequence: "Your buffer and upcoming commitments stay protected.",
        mathsRows: expect.any(Array),
        recencyLabel: "Updated recently",
        suggestedAction: "You can buy this without moving another plan.",
        title: "Yes, this fits comfortably.",
        tone: "comfortable",
      },
      priceMinor: 45_000_00,
      verdict: "comfortably_affordable",
    });
    expect(extensionDecisionCardSchema.parse(card)).toEqual(card);
    expect(Object.keys(card).sort()).toEqual([
      "decisionUrl",
      "evaluatedAt",
      "firstComfortablyAffordableDate",
      "intentId",
      "presentation",
      "priceMinor",
      "verdict",
    ]);
  });
});
