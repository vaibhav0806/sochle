import type { NormalizedFinancialState } from "@sochle/domain";
import { randomBytes } from "node:crypto";
import { eq } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { createSochleDatabase } from "./database";
import { FinancialRepository } from "./repository";
import {
  connections,
  financialAccounts,
  normalizedTransactions,
  transactionClassificationRules,
} from "./schema";

const database = createSochleDatabase(
  process.env.TEST_DATABASE_URL ?? "postgresql://sochle:sochle@localhost:65432/sochle_verify"
);
const repository = new FinancialRepository(database.db);

const snapshot: NormalizedFinancialState = {
  accounts: [
    {
      balance: { currency: "INR", minor: 150_000_00 },
      institution: "Demo Bank",
      lastRefreshedAt: "2026-08-17T06:30:00.000Z",
      maskedDisplayName: "Demo Bank ••4242",
      sourceAccountId: "demo_account_1",
      status: "active",
      type: "bank",
    },
  ],
  asOf: "2026-08-17T06:30:00.000Z",
  cardObligations: { currency: "INR", minor: 20_000_00 },
  exclusions: [],
  expectedIncome: [],
  investmentContext: { mutualFunds: null, netWorth: null, stocks: null },
  liquidCash: { currency: "INR", minor: 150_000_00 },
  observedMonthlySpending: { currency: "INR", minor: 35_000_00 },
  reconciliation: [],
  sourceFreshness: [],
  transactions: [
    {
      accountSourceId: "demo_account_1",
      amount: { currency: "INR", minor: 1_250_00 },
      canonicalMerchant: null,
      cashFlowInclusion: "included",
      confidence: "medium",
      date: "2026-08-16",
      direction: "debit",
      rawMerchant: "Demo Store",
      sochleClassification: "unclassified",
      sourceCategory: null,
      sourceTransactionId: "demo_transaction_1",
    },
  ],
  upcomingObligations: [],
};

async function createOpenIssue() {
  const connection = await repository.ensureConnection("fold");
  await repository.persistProjection(connection.id, snapshot);
  const savedSnapshot = await repository.saveSnapshot(connection.id, snapshot, "issue-snapshot");
  const [issue] = await repository.replaceOpenIssues(connection.id, savedSnapshot.id, [
    {
      details: { merchant: "Demo Store" },
      materialityMinor: 650_000,
      relatedEntityId: "demo_transaction_1",
      relatedEntityType: "transaction",
      severity: "blocking",
      type: "large_untagged_transaction",
    },
  ]);
  if (issue === undefined) throw new Error("Expected issue");
  return { connection, issue, savedSnapshot };
}

beforeEach(async () => {
  await database.db.delete(connections);
});

afterAll(async () => {
  await database.close();
});

describe("FinancialRepository", () => {
  it("returns null for provider state that has not been stored", async () => {
    const connection = await repository.ensureConnection("fold");

    await expect(repository.getConnection("missing-provider")).resolves.toBeNull();
    await expect(
      repository.loadAuthorizationState(connection.id, randomBytes(32))
    ).resolves.toBeNull();
    await expect(repository.getIssue("00000000-0000-0000-0000-000000000000")).resolves.toBeNull();
  });

  it("reads and updates a provider connection", async () => {
    const connection = await repository.ensureConnection("fold");

    await repository.setConnectionStatus(connection.id, "authorizing");

    await expect(repository.getConnection("fold")).resolves.toMatchObject({
      id: connection.id,
      status: "authorizing",
    });
  });

  it("upserts accounts and transactions idempotently by provider source ID", async () => {
    const connection = await repository.ensureConnection("fold");

    await repository.persistProjection(connection.id, snapshot);
    await repository.persistProjection(connection.id, {
      ...snapshot,
      accounts: [
        {
          ...snapshot.accounts[0]!,
          balance: { currency: "INR", minor: 175_000_00 },
        },
      ],
      transactions: [
        {
          ...snapshot.transactions[0]!,
          canonicalMerchant: "Demo Store Canonical",
        },
      ],
    });

    const accountRows = await database.db
      .select()
      .from(financialAccounts)
      .where(eq(financialAccounts.connectionId, connection.id));
    const transactionRows = await database.db
      .select()
      .from(normalizedTransactions)
      .where(eq(normalizedTransactions.connectionId, connection.id));

    expect(accountRows).toHaveLength(1);
    expect(accountRows[0]?.currentBalanceMinor).toBe(175_000_00);
    expect(transactionRows).toHaveLength(1);
    expect(transactionRows[0]?.canonicalMerchant).toBe("Demo Store Canonical");
  });

  it("returns the latest immutable financial snapshot", async () => {
    const connection = await repository.ensureConnection("fold");

    await repository.saveSnapshot(connection.id, snapshot, "fingerprint-old");
    await repository.saveSnapshot(
      connection.id,
      { ...snapshot, asOf: "2026-08-17T07:30:00.000Z" },
      "fingerprint-new"
    );

    const latest = await repository.getLatestSnapshot(connection.id);

    expect(latest?.sourceFingerprint).toBe("fingerprint-new");
    expect(latest?.state.asOf).toBe("2026-08-17T07:30:00.000Z");
  });

  it("stores authorization state encrypted at rest", async () => {
    const connection = await repository.ensureConnection("fold");
    const key = randomBytes(32);
    const state = { accessToken: "demo-access", refreshToken: "demo-refresh" };

    await repository.saveAuthorizationState(connection.id, state, key);

    const [stored] = await database.db
      .select({ encryptedAuthorization: connections.encryptedAuthorization })
      .from(connections)
      .where(eq(connections.id, connection.id));
    expect(stored?.encryptedAuthorization?.toString("utf8")).not.toContain("demo-access");
    await expect(repository.loadAuthorizationState(connection.id, key)).resolves.toEqual(state);
  });

  it("enforces one running sync and the minimum successful-sync interval", async () => {
    const connection = await repository.ensureConnection("fold");
    const startedAt = new Date("2026-08-17T06:00:00.000Z");

    const first = await repository.beginSync(connection.id, startedAt, 60 * 60 * 1000);
    expect(first.kind).toBe("started");
    await expect(
      repository.beginSync(connection.id, new Date("2026-08-17T06:01:00.000Z"), 60 * 60 * 1000)
    ).resolves.toMatchObject({ kind: "running" });

    if (first.kind !== "started") throw new Error("Expected sync to start");
    await repository.completeSync(first.runId, connection.id, {
      completedAt: new Date("2026-08-17T06:10:00.000Z"),
      status: "succeeded",
    });

    await expect(
      repository.beginSync(connection.id, new Date("2026-08-17T06:30:00.000Z"), 60 * 60 * 1000)
    ).resolves.toMatchObject({ kind: "throttled" });
    await expect(
      repository.beginSync(connection.id, new Date("2026-08-17T07:11:00.000Z"), 60 * 60 * 1000)
    ).resolves.toMatchObject({ kind: "started" });
  });

  it("backs off after a failed sync", async () => {
    const connection = await repository.ensureConnection("fold");
    const first = await repository.beginSync(
      connection.id,
      new Date("2026-08-17T06:00:00.000Z"),
      60 * 60 * 1000
    );
    if (first.kind !== "started") throw new Error("Expected sync to start");
    await repository.completeSync(first.runId, connection.id, {
      completedAt: new Date("2026-08-17T06:01:00.000Z"),
      failureMessage: "Fold unavailable",
      status: "failed",
    });

    await expect(
      repository.beginSync(connection.id, new Date("2026-08-17T06:01:30.000Z"), 60 * 60 * 1000)
    ).resolves.toMatchObject({ kind: "backed_off" });
  });

  it("persists Money Inbox corrections across later provider projections", async () => {
    const { connection, issue } = await createOpenIssue();

    await repository.resolveIssue(issue.id, {
      action: "classify",
      classification: "consumption",
    });
    await repository.persistProjection(connection.id, snapshot);

    const [transaction] = await database.db
      .select()
      .from(normalizedTransactions)
      .where(eq(normalizedTransactions.sourceTransactionId, "demo_transaction_1"));
    expect(transaction?.sochleClassification).toBe("consumption");
    await expect(repository.listOpenIssues(connection.id)).resolves.toEqual([]);
  });

  it("does not recreate a corrected transaction issue on a later sync", async () => {
    const { connection, issue } = await createOpenIssue();
    await repository.resolveIssue(issue.id, {
      action: "classify",
      classification: "consumption",
    });
    await repository.persistProjection(connection.id, snapshot);
    const nextSnapshot = await repository.saveSnapshot(
      connection.id,
      { ...snapshot, asOf: "2026-08-17T07:30:00.000Z" },
      "after-correction"
    );

    await repository.replaceOpenIssues(connection.id, nextSnapshot.id, [
      {
        details: { merchant: "Demo Store" },
        materialityMinor: 650_000,
        relatedEntityId: "demo_transaction_1",
        relatedEntityType: "transaction",
        severity: "blocking",
        type: "large_untagged_transaction",
      },
    ]);

    await expect(repository.listOpenIssues(connection.id)).resolves.toEqual([]);
  });

  it("applies an opted-in merchant classification rule to later projections", async () => {
    const { connection, issue } = await createOpenIssue();

    await repository.resolveIssue(issue.id, {
      action: "classify",
      applyToFuture: true,
      classification: "investment",
    });
    await repository.persistProjection(connection.id, {
      ...snapshot,
      transactions: [
        {
          ...snapshot.transactions[0]!,
          sourceTransactionId: "demo_transaction_2",
        },
      ],
    });

    await expect(database.db.select().from(transactionClassificationRules)).resolves.toHaveLength(
      1
    );
    const [transaction] = await database.db
      .select()
      .from(normalizedTransactions)
      .where(eq(normalizedTransactions.sourceTransactionId, "demo_transaction_2"));
    expect(transaction?.sochleClassification).toBe("investment");

    const nextSnapshot = await repository.saveSnapshot(
      connection.id,
      { ...snapshot, asOf: "2026-08-17T07:30:00.000Z" },
      "merchant-rule"
    );
    await repository.replaceOpenIssues(connection.id, nextSnapshot.id, [
      {
        details: { merchant: "Demo Store" },
        materialityMinor: 650_000,
        relatedEntityId: "demo_transaction_2",
        relatedEntityType: "transaction",
        severity: "blocking",
        type: "large_untagged_transaction",
      },
    ]);
    await expect(repository.listOpenIssues(connection.id)).resolves.toEqual([]);
  });

  it("persists exclusion corrections across later provider projections", async () => {
    const { connection, issue } = await createOpenIssue();

    await repository.resolveIssue(issue.id, { action: "exclude" });
    await repository.persistProjection(connection.id, snapshot);

    const [transaction] = await database.db
      .select()
      .from(normalizedTransactions)
      .where(eq(normalizedTransactions.sourceTransactionId, "demo_transaction_1"));
    expect(transaction?.cashFlowInclusion).toBe("excluded");
    await expect(repository.getIssue(issue.id)).resolves.toMatchObject({ status: "resolved" });
  });

  it("marks ignore-once corrections as ignored without changing the transaction", async () => {
    const { issue } = await createOpenIssue();

    await repository.resolveIssue(issue.id, { action: "ignore_once" });

    const [transaction] = await database.db
      .select()
      .from(normalizedTransactions)
      .where(eq(normalizedTransactions.sourceTransactionId, "demo_transaction_1"));
    expect(transaction?.sochleClassification).toBe("unclassified");
    await expect(repository.getIssue(issue.id)).resolves.toMatchObject({ status: "ignored" });
  });

  it("replaces the previous open review set atomically", async () => {
    const { connection, issue, savedSnapshot } = await createOpenIssue();

    await repository.replaceOpenIssues(connection.id, savedSnapshot.id, []);

    await expect(repository.listOpenIssues(connection.id)).resolves.toEqual([]);
    await expect(repository.getIssue(issue.id)).resolves.toMatchObject({ status: "resolved" });
  });
});
