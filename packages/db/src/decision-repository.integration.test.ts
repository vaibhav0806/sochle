import {
  DEFAULT_RULES,
  evaluatePurchase,
  REQUIRED_DECISION_SOURCES,
  type NormalizedFinancialState,
  type RuleSet,
} from "@sochle/domain";
import { randomBytes } from "node:crypto";
import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { createSochleDatabase } from "./database";
import { DecisionRepository } from "./decision-repository";
import { FinancialRepository } from "./repository";
import {
  auditEvents,
  connections,
  decisions,
  financialSnapshots,
  purchaseIntents,
  ruleSets,
} from "./schema";

const database = createSochleDatabase(
  process.env.TEST_DATABASE_URL ?? "postgresql://sochle:sochle@localhost:65432/sochle_verify"
);
const repository = new DecisionRepository(database.db);
const financialRepository = new FinancialRepository(database.db);

const evaluatedAt = "2026-08-17T12:00:00.000Z";
const state: NormalizedFinancialState = {
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
};
const rules: RuleSet = {
  ...DEFAULT_RULES,
  minimumBuffer: { currency: "INR", minor: 20_000_00 },
  salary: { amount: { currency: "INR", minor: 0 }, confirmed: true, dayOfMonth: 31 },
  version: 1,
};

beforeEach(async () => {
  await database.db.delete(connections);
});

afterAll(async () => {
  await database.close();
});

async function setupDecision() {
  const connection = await financialRepository.ensureConnection("fold");
  const snapshot = await financialRepository.saveSnapshot(
    connection.id,
    state,
    "decision-snapshot"
  );
  const ruleSet = await repository.createRuleSet(connection.id, rules);
  const result = evaluatePurchase({
    dataIssues: [],
    evaluatedAt,
    financialState: state,
    plannedPurchases: [],
    price: { currency: "INR", minor: 45_000_00 },
    rules,
    snapshotId: snapshot.id,
  });
  const saved = await repository.createPurchaseDecision({
    auditBundle: { input: result.inputs, result },
    connectionId: connection.id,
    description: "Synthetic headphones",
    priceMinor: 45_000_00,
    result,
    ruleSetId: ruleSet.id,
    snapshotId: snapshot.id,
  });
  return { connection, result, ruleSet, saved, snapshot };
}

describe("decision schema", () => {
  it("enforces one rule version per connection", async () => {
    const connection = await financialRepository.ensureConnection("fold");
    await repository.createRuleSet(connection.id, rules);

    await expect(repository.createRuleSet(connection.id, rules)).rejects.toThrow();
  });
});

describe("DecisionRepository", () => {
  it("creates an intent, immutable decision, and audit event atomically", async () => {
    const { connection, result, saved } = await setupDecision();

    expect(saved.intent.status).toBe("considering");
    expect(saved.decision.auditBundle.result.headrooms).toEqual(result.headrooms);
    await expect(repository.getDecision(connection.id, saved.decision.id)).resolves.toMatchObject({
      decision: { id: saved.decision.id },
      intent: { description: "Synthetic headphones" },
    });
    await expect(database.db.select().from(auditEvents)).resolves.toHaveLength(1);
  });

  it("appends recalculation without mutating the previous decision", async () => {
    const { connection, result, ruleSet, saved, snapshot } = await setupDecision();
    const original = structuredClone(saved.decision.auditBundle);
    const second = await repository.appendDecision({
      auditBundle: { input: result.inputs, result },
      connectionId: connection.id,
      previousDecisionId: saved.decision.id,
      purchaseIntentId: saved.intent.id,
      result,
      ruleSetId: ruleSet.id,
      snapshotId: snapshot.id,
    });

    expect(second.previousDecisionId).toBe(saved.decision.id);
    await expect(repository.getDecision(connection.id, saved.decision.id)).resolves.toMatchObject({
      decision: { auditBundle: original },
    });
    await expect(repository.listDecisions(connection.id)).resolves.toHaveLength(1);
    await expect(database.db.select().from(decisions)).resolves.toHaveLength(2);
  });

  it("scopes decision reads and mutations to the connection", async () => {
    const { saved } = await setupDecision();
    const other = await financialRepository.ensureConnection("other");

    await expect(repository.getDecision(other.id, saved.decision.id)).resolves.toBeNull();
    await expect(
      repository.updateIntentStatus(other.id, saved.intent.id, "skipped", null)
    ).rejects.toThrow("Purchase intent not found");
  });

  it("rejects snapshots and rule sets owned by another connection", async () => {
    const { connection, result, saved } = await setupDecision();
    const other = await financialRepository.ensureConnection("other");
    const otherSnapshot = await financialRepository.saveSnapshot(other.id, state, "other-snapshot");
    const otherRuleSet = await repository.createRuleSet(other.id, rules);

    await expect(
      repository.createPurchaseDecision({
        auditBundle: { input: result.inputs, result },
        connectionId: connection.id,
        description: "Cross-connection purchase",
        priceMinor: 45_000_00,
        result,
        ruleSetId: otherRuleSet.id,
        snapshotId: otherSnapshot.id,
      })
    ).rejects.toThrow("Decision context does not belong to connection");
    await expect(
      repository.appendDecision({
        auditBundle: { input: result.inputs, result },
        connectionId: connection.id,
        previousDecisionId: saved.decision.id,
        purchaseIntentId: saved.intent.id,
        result,
        ruleSetId: otherRuleSet.id,
        snapshotId: otherSnapshot.id,
      })
    ).rejects.toThrow("Decision context does not belong to connection");
  });

  it("persists planned dates and returns only planned purchases", async () => {
    const { connection, saved } = await setupDecision();
    const updated = await repository.updateIntentStatus(
      connection.id,
      saved.intent.id,
      "planned",
      "2026-08-25"
    );

    expect(updated.latestDecisionId).toBe(saved.decision.id);
    await expect(repository.listPlannedPurchases(connection.id)).resolves.toEqual([
      {
        amount: { currency: "INR", minor: 45_000_00 },
        dueOn: "2026-08-25",
        id: saved.intent.id,
      },
    ]);
    await expect(
      repository.updateIntentStatus(connection.id, saved.intent.id, "planned", null)
    ).rejects.toThrow("Planned purchases require a date");
    await repository.updateIntentStatus(connection.id, saved.intent.id, "skipped", null);
    await expect(repository.listPlannedPurchases(connection.id)).resolves.toEqual([]);
  });

  it("exports complete decision data without authorization secrets", async () => {
    const { connection } = await setupDecision();
    await repository.createAuditEvent({
      connectionId: connection.id,
      details: {},
      type: "export_created",
    });

    const exported = await repository.exportOwnerData(connection.id);

    expect(exported).toMatchObject({
      schemaVersion: 1,
    });
    expect(Number.isNaN(Date.parse(exported.exportedAt))).toBe(false);
    expect(exported.decisions).toHaveLength(1);
    expect(exported.ruleSets).toHaveLength(1);
    expect(exported.snapshots).toHaveLength(1);
    expect(JSON.stringify(exported)).not.toMatch(
      /encryptedAuthorization|authorizationIv|authorizationTag|accessToken|refreshToken/
    );
  });

  it("deletes authorization and every connection-owned decision record", async () => {
    const { connection } = await setupDecision();
    await financialRepository.saveAuthorizationState(
      connection.id,
      { accessToken: "synthetic-access", refreshToken: "synthetic-refresh" },
      randomBytes(32)
    );

    await repository.deleteOwnerData(connection.id);

    await expect(financialRepository.getConnection("fold")).resolves.toBeNull();
    await expect(database.db.select().from(financialSnapshots)).resolves.toEqual([]);
    await expect(database.db.select().from(ruleSets)).resolves.toEqual([]);
    await expect(database.db.select().from(purchaseIntents)).resolves.toEqual([]);
    await expect(database.db.select().from(decisions)).resolves.toEqual([]);
    await expect(database.db.select().from(auditEvents)).resolves.toEqual([]);
  });
});
