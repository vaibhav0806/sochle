import type {
  EvaluatePurchaseInput,
  FinancialVerdict,
  Headrooms,
  NormalizedFinancialState,
  RuleSet,
  Verdict,
} from "@sochle/domain";
import { REQUIRED_DECISION_SOURCES } from "@sochle/domain";

const evaluatedAt = "2026-08-17T12:00:00.000Z";

const referenceState: NormalizedFinancialState = {
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
};

const referenceRules: RuleSet = {
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
};

export type DecisionScenario = {
  expected: {
    confidence: "high" | "medium" | "low";
    financialVerdict: FinancialVerdict;
    firstComfortablyAffordableDate: string | null;
    headrooms: Headrooms;
    verdict: Verdict;
  };
  id: string;
  input: EvaluatePurchaseInput;
};

export const referencePurchase: DecisionScenario = {
  expected: {
    confidence: "high",
    financialVerdict: "comfortably_affordable",
    firstComfortablyAffordableDate: "2026-08-17",
    headrooms: {
      comfortableMinor: 50_000_00,
      goalMinor: 5_000_00,
      technicalMinor: 75_000_00,
    },
    verdict: "comfortably_affordable",
  },
  id: "reference-purchase-45000",
  input: {
    dataIssues: [],
    evaluatedAt,
    financialState: referenceState,
    plannedPurchases: [
      { amount: { currency: "INR", minor: 5_000_00 }, dueOn: "2026-08-25", id: "shoes" },
    ],
    price: { currency: "INR", minor: 45_000_00 },
    rules: referenceRules,
    snapshotId: "synthetic-reference-snapshot",
  },
};

function variant(
  id: string,
  mutate: (input: EvaluatePurchaseInput) => void,
  expected: DecisionScenario["expected"] = referencePurchase.expected
): DecisionScenario {
  const input = structuredClone(referencePurchase.input);
  mutate(input);
  return { expected, id, input };
}

const selfTransfer = variant("self-transfer-excluded", (input) => {
  input.financialState.transactions.push({
    accountSourceId: "synthetic-bank",
    amount: { currency: "INR", minor: 75_000_00 },
    canonicalMerchant: null,
    cashFlowInclusion: "excluded",
    confidence: "high",
    date: "2026-08-16",
    direction: "debit",
    rawMerchant: "Synthetic self transfer",
    sochleClassification: "transfer",
    sourceCategory: null,
    sourceTransactionId: "self-transfer",
  });
});

const parentAndAddonCard = variant("parent-card-with-addon", (input) => {
  input.financialState.accounts.push(
    {
      balance: { currency: "INR", minor: 10_000_00 },
      institution: "Synthetic Card",
      lastRefreshedAt: "2026-08-17T06:00:00.000Z",
      maskedDisplayName: "Parent ••1111",
      sourceAccountId: "parent-card",
      status: "active",
      type: "credit_card",
    },
    {
      balance: { currency: "INR", minor: 0 },
      institution: "Synthetic Card",
      lastRefreshedAt: "2026-08-17T06:00:00.000Z",
      maskedDisplayName: "Add-on ••2222",
      sourceAccountId: "addon-card",
      status: "active",
      type: "credit_card",
    }
  );
});

const salaryOnHorizon = variant(
  "salary-timing-payday",
  (input) => {
    input.financialState.liquidCash = { currency: "INR", minor: 40_000_00 };
    input.financialState.cardObligations = { currency: "INR", minor: 0 };
    input.financialState.upcomingObligations = [];
    input.plannedPurchases = [];
    input.rules.essentialMonthlySpending = { currency: "INR", minor: 0 };
    input.rules.monthlyInvestmentTarget = { currency: "INR", minor: 0 };
    input.rules.forecastHorizon = { kind: "next_salary" };
    input.rules.salary = {
      amount: { currency: "INR", minor: 100_000_00 },
      confirmed: true,
      dayOfMonth: 31,
    };
  },
  {
    confidence: "high",
    financialVerdict: "wait_until_payday",
    firstComfortablyAffordableDate: "2026-08-31",
    headrooms: {
      comfortableMinor: 70_000_00,
      goalMinor: 70_000_00,
      technicalMinor: -5_000_00,
    },
    verdict: "wait_until_payday",
  }
);

const shortMonthSalary = variant(
  "salary-day-clamped-in-february",
  (input) => {
    input.evaluatedAt = "2027-02-01T12:00:00.000Z";
    input.financialState.asOf = input.evaluatedAt;
    input.financialState.sourceFreshness = REQUIRED_DECISION_SOURCES.map((source) => ({
      refreshedAt: "2027-02-01T06:00:00.000Z",
      source,
      status: "fresh",
    }));
    input.financialState.liquidCash = { currency: "INR", minor: 40_000_00 };
    input.financialState.cardObligations = { currency: "INR", minor: 0 };
    input.financialState.upcomingObligations = [];
    input.plannedPurchases = [];
    input.rules.essentialMonthlySpending = { currency: "INR", minor: 0 };
    input.rules.monthlyInvestmentTarget = { currency: "INR", minor: 0 };
    input.rules.forecastHorizon = { kind: "next_salary" };
    input.rules.salary = {
      amount: { currency: "INR", minor: 100_000_00 },
      confirmed: true,
      dayOfMonth: 31,
    };
  },
  {
    confidence: "high",
    financialVerdict: "wait_until_payday",
    firstComfortablyAffordableDate: "2027-02-28",
    headrooms: {
      comfortableMinor: 70_000_00,
      goalMinor: 70_000_00,
      technicalMinor: -5_000_00,
    },
    verdict: "wait_until_payday",
  }
);

const materialRentVariance = variant(
  "material-rent-variance",
  (input) => {
    input.dataIssues.push({
      effect: { maxMinor: 5_000_00, minMinor: -5_000_00 },
      id: "rent-variance",
      label: "Rent variance",
    });
  },
  { ...referencePurchase.expected, confidence: "low", verdict: "insufficient_confidence" }
);

const matchedRefund = variant("matched-refund", (input) => {
  input.financialState.transactions.push({
    accountSourceId: "synthetic-bank",
    amount: { currency: "INR", minor: 2_000_00 },
    canonicalMerchant: "Synthetic Store",
    cashFlowInclusion: "included",
    confidence: "high",
    date: "2026-08-16",
    direction: "credit",
    rawMerchant: "Synthetic Store Refund",
    sochleClassification: "refund",
    sourceCategory: "Refund",
    sourceTransactionId: "matched-refund",
  });
});

const staleSource = variant(
  "stale-required-source",
  (input) => {
    input.financialState.sourceFreshness = input.financialState.sourceFreshness.map((source) => ({
      ...source,
      refreshedAt: "2026-08-16T11:59:59.999Z",
      status: "stale",
    }));
  },
  { ...referencePurchase.expected, confidence: "low", verdict: "insufficient_confidence" }
);

const uncertainMerchantBelow = variant(
  "uncertain-merchant-below-materiality",
  (input) => {
    input.dataIssues.push({
      effect: { maxMinor: 1_000_00, minMinor: -1_000_00 },
      id: "small-merchant",
      label: "Small uncertain merchant",
    });
  },
  { ...referencePurchase.expected, confidence: "medium" }
);

const uncertainMerchantAt = variant(
  "uncertain-merchant-at-materiality",
  (input) => {
    input.dataIssues.push({
      effect: { maxMinor: 4_500_00, minMinor: -4_500_00 },
      id: "material-merchant",
      label: "Material uncertain merchant",
    });
  },
  { ...referencePurchase.expected, confidence: "low", verdict: "insufficient_confidence" }
);

const duplicateEqualCharges = variant(
  "duplicate-equal-price-charges",
  (input) => {
    input.dataIssues.push(
      {
        effect: { maxMinor: 1_000_00, minMinor: -1_000_00 },
        id: "charge-one",
        label: "First equal-price charge",
      },
      {
        effect: { maxMinor: 1_000_00, minMinor: -1_000_00 },
        id: "charge-two",
        label: "Second equal-price charge",
      }
    );
  },
  { ...referencePurchase.expected, confidence: "medium" }
);

const additionalRent = variant(
  "essential-versus-additional-obligation",
  (input) => {
    input.financialState.upcomingObligations[0]!.budgetTreatment = "additional";
  },
  {
    confidence: "high",
    financialVerdict: "requires_reducing_investments",
    firstComfortablyAffordableDate: "2026-08-17",
    headrooms: {
      comfortableMinor: 50_000_00,
      goalMinor: -15_000_00,
      technicalMinor: 75_000_00,
    },
    verdict: "requires_reducing_investments",
  }
);

const investmentOnlyCompromise = variant(
  "investment-target-only-compromise",
  (input) => {
    input.financialState.liquidCash = { currency: "INR", minor: 130_000_00 };
  },
  {
    confidence: "high",
    financialVerdict: "requires_reducing_investments",
    firstComfortablyAffordableDate: "2026-08-17",
    headrooms: {
      comfortableMinor: 30_000_00,
      goalMinor: -15_000_00,
      technicalMinor: 55_000_00,
    },
    verdict: "requires_reducing_investments",
  }
);

const plannedPurchaseTradeoff = variant(
  "planned-purchase-tradeoff",
  (input) => {
    input.plannedPurchases = [
      {
        amount: { currency: "INR", minor: 35_000_00 },
        dueOn: "2026-08-25",
        id: "planned-travel",
      },
    ];
  },
  {
    confidence: "high",
    financialVerdict: "affordable_with_tradeoffs",
    firstComfortablyAffordableDate: "2026-08-17",
    headrooms: {
      comfortableMinor: 50_000_00,
      goalMinor: -25_000_00,
      technicalMinor: 75_000_00,
    },
    verdict: "affordable_with_tradeoffs",
  }
);

export const decisionScenarios: DecisionScenario[] = [
  referencePurchase,
  selfTransfer,
  parentAndAddonCard,
  salaryOnHorizon,
  shortMonthSalary,
  materialRentVariance,
  matchedRefund,
  staleSource,
  uncertainMerchantBelow,
  uncertainMerchantAt,
  duplicateEqualCharges,
  additionalRent,
  investmentOnlyCompromise,
  plannedPurchaseTradeoff,
];
