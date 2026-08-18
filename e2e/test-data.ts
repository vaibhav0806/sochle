import { REQUIRED_DECISION_SOURCES, type NormalizedFinancialState } from "@sochle/domain";
import {
  connections,
  createSochleDatabase,
  DecisionRepository,
  FinancialRepository,
} from "@sochle/db";

export const e2eDatabaseUrl =
  process.env.E2E_DATABASE_URL ??
  process.env.TEST_DATABASE_URL ??
  "postgresql://sochle:sochle@localhost:65432/sochle_verify";

const snapshot: NormalizedFinancialState = {
  accounts: [
    {
      balance: { currency: "INR", minor: 250_000_00 },
      institution: "Synthetic Bank",
      lastRefreshedAt: "2026-08-17T06:30:00.000Z",
      maskedDisplayName: "Synthetic Bank ••4242",
      sourceAccountId: "e2e_account",
      status: "active",
      type: "bank",
    },
  ],
  asOf: "2026-08-17T06:30:00.000Z",
  cardObligations: { currency: "INR", minor: 0 },
  exclusions: [],
  expectedIncome: [],
  investmentContext: { mutualFunds: null, netWorth: null, stocks: null },
  liquidCash: { currency: "INR", minor: 250_000_00 },
  observedMonthlySpending: { currency: "INR", minor: 35_000_00 },
  reconciliation: [],
  sourceFreshness: [],
  transactions: [
    {
      accountSourceId: "e2e_account",
      amount: { currency: "INR", minor: 650_000 },
      canonicalMerchant: null,
      cashFlowInclusion: "included",
      confidence: "medium",
      date: "2026-08-16",
      direction: "debit",
      rawMerchant: "Synthetic Store",
      sochleClassification: "unclassified",
      sourceCategory: null,
      sourceTransactionId: "e2e_transaction",
    },
  ],
  upcomingObligations: [],
};

export async function seedLiveDatabase(): Promise<void> {
  const database = createSochleDatabase(e2eDatabaseUrl);
  try {
    await database.db.delete(connections);
    const repository = new FinancialRepository(database.db);
    const connection = await repository.ensureConnection("fold");
    await repository.persistProjection(connection.id, snapshot);
    const saved = await repository.saveSnapshot(connection.id, snapshot, "e2e-fingerprint");
    await repository.replaceOpenIssues(connection.id, saved.id, [
      {
        details: { merchant: "Synthetic Store" },
        materialityMinor: 650_000,
        relatedEntityId: "e2e_transaction",
        relatedEntityType: "transaction",
        severity: "blocking",
        type: "large_untagged_transaction",
      },
    ]);
  } finally {
    await database.close();
  }
}

function addDays(date: Date, days: number): string {
  const result = new Date(date);
  result.setUTCDate(result.getUTCDate() + days);
  return result.toISOString().slice(0, 10);
}

export async function seedDecisionDatabase(): Promise<void> {
  const database = createSochleDatabase(e2eDatabaseUrl);
  try {
    await database.db.delete(connections);
    const financialRepository = new FinancialRepository(database.db);
    const decisionRepository = new DecisionRepository(database.db);
    const connection = await financialRepository.ensureConnection("fold");
    const now = new Date();
    const refreshedAt = new Date(now.getTime() - 60 * 60 * 1_000).toISOString();
    const decisionState: NormalizedFinancialState = {
      accounts: [],
      asOf: now.toISOString(),
      cardObligations: { currency: "INR", minor: 10_000_00 },
      exclusions: [],
      expectedIncome: [],
      investmentContext: { mutualFunds: null, netWorth: null, stocks: null },
      liquidCash: { currency: "INR", minor: 150_000_00 },
      observedMonthlySpending: { currency: "INR", minor: 40_000_00 },
      reconciliation: [],
      sourceFreshness: REQUIRED_DECISION_SOURCES.map((source) => ({
        refreshedAt,
        source,
        status: "fresh",
      })),
      transactions: [],
      upcomingObligations: [
        {
          amount: { currency: "INR", minor: 20_000_00 },
          budgetTreatment: "inside_essential_budget",
          certainty: "confirmed",
          dueOn: addDays(now, 3),
          id: "e2e-essential",
          name: "Synthetic essential bill",
          source: "recurring_expense",
        },
        {
          amount: { currency: "INR", minor: 10_000_00 },
          budgetTreatment: "additional",
          certainty: "confirmed",
          dueOn: addDays(now, 5),
          id: "e2e-card",
          name: "Synthetic card bill",
          source: "credit_card",
        },
      ],
    };
    await financialRepository.saveSnapshot(connection.id, decisionState, "e2e-decision-snapshot");
    await decisionRepository.createRuleSet(connection.id, {
      essentialMonthlySpending: { currency: "INR", minor: 40_000_00 },
      forecastHorizon: { days: 30, kind: "rolling_days" },
      largePurchaseThreshold: { currency: "INR", minor: 10_000_00 },
      materiality: {
        absoluteCap: { currency: "INR", minor: 5_000_00 },
        purchaseRatioBps: 1_000,
      },
      minimumBuffer: { currency: "INR", minor: 25_000_00 },
      monthlyInvestmentTarget: { currency: "INR", minor: 25_000_00 },
      salary: {
        amount: { currency: "INR", minor: 0 },
        confirmed: true,
        dayOfMonth: 31,
      },
      version: 1,
    });
  } finally {
    await database.close();
  }
}

export async function seedDecisionIssue(): Promise<void> {
  const database = createSochleDatabase(e2eDatabaseUrl);
  try {
    const repository = new FinancialRepository(database.db);
    const connection = await repository.getConnection("fold");
    if (connection === null) throw new Error("E2E financial connection is missing");
    const snapshot = await repository.getLatestSnapshot(connection.id);
    if (snapshot === null) throw new Error("E2E financial snapshot is missing");
    await repository.replaceOpenIssues(connection.id, snapshot.id, [
      {
        details: { merchant: "Synthetic Store" },
        materialityMinor: 45_000_00,
        relatedEntityId: "e2e_decision_issue_transaction",
        relatedEntityType: "transaction",
        severity: "blocking",
        type: "large_untagged_transaction",
      },
    ]);
  } finally {
    await database.close();
  }
}

export async function resetLiveDatabase(): Promise<void> {
  const database = createSochleDatabase(e2eDatabaseUrl);
  try {
    await database.db.delete(connections);
  } finally {
    await database.close();
  }
}
