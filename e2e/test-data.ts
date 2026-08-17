import type { NormalizedFinancialState } from "@sochle/domain";
import { connections, createSochleDatabase, FinancialRepository } from "@sochle/db";

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

export async function resetLiveDatabase(): Promise<void> {
  const database = createSochleDatabase(e2eDatabaseUrl);
  try {
    await database.db.delete(connections);
  } finally {
    await database.close();
  }
}
