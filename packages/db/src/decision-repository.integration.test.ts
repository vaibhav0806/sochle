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
import { ExtensionRepository } from "./extension-repository";
import { FinancialRepository } from "./repository";
import {
  auditEvents,
  connections,
  decisions,
  extensionPairingRequests,
  extensionPairings,
  financialSnapshots,
  purchaseIntents,
  ruleSets,
  transactionClassificationRules,
} from "./schema";

const database = createSochleDatabase(
  process.env.TEST_DATABASE_URL ?? "postgresql://sochle:sochle@localhost:65432/sochle_verify"
);
const repository = new DecisionRepository(database.db);
const extensionRepository = new ExtensionRepository(database.db);
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
  await database.db.delete(extensionPairingRequests);
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

async function setupPairing(connectionId: string, hashCharacter: string) {
  const request = await extensionRepository.createPairingRequest({
    callbackUrl: "https://abcdefghijklmnopabcdefghijklmnop.chromiumapp.org/pair",
    createdAt: new Date("2026-08-18T08:00:00.000Z"),
    credentialHash: hashCharacter.repeat(64),
    expiresAt: new Date("2026-08-18T08:10:00.000Z"),
    extensionOrigin: "chrome-extension://abcdefghijklmnopabcdefghijklmnop",
  });
  return extensionRepository.approvePairingRequest(
    request.id,
    connectionId,
    new Date("2026-08-18T08:05:00.000Z")
  );
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

  it("persists extension provenance and returns one decision for an idempotent retry", async () => {
    const { connection, result, ruleSet, snapshot } = await setupDecision();
    const pairing = await setupPairing(connection.id, "e");
    const extensionContext = {
      canonicalUrl: "https://www.amazon.in/dp/SYNTHETIC",
      extractedPriceMinor: 49_000_00,
      extractedTitle: "Synthetic headphones MRP title",
      extractionConfidence: "high" as const,
      idempotencyKey: "10000000-0000-4000-8000-000000000001",
      merchant: "amazon.in" as const,
      pairingId: pairing.id,
    };
    const input = {
      auditBundle: { input: result.inputs, result },
      connectionId: connection.id,
      description: "Synthetic headphones, corrected",
      extensionContext,
      priceMinor: 45_000_00,
      result,
      ruleSetId: ruleSet.id,
      snapshotId: snapshot.id,
    };

    const first = await repository.createPurchaseDecision(input);
    const retry = await repository.createPurchaseDecision(input);

    expect(retry).toEqual(first);
    expect(first.intent).toMatchObject({
      canonicalUrl: extensionContext.canonicalUrl,
      description: "Synthetic headphones, corrected",
      extractedPriceMinor: 49_000_00,
      extractedTitle: extensionContext.extractedTitle,
      extractionConfidence: "high",
      idempotencyKey: extensionContext.idempotencyKey,
      merchant: "amazon.in",
      pairingId: pairing.id,
      priceMinor: 45_000_00,
      source: "extension",
    });
    await expect(database.db.select().from(purchaseIntents)).resolves.toHaveLength(2);
    await expect(database.db.select().from(decisions)).resolves.toHaveLength(2);
  });

  it("allows the same request key on another pairing but scopes extension outcomes", async () => {
    const { connection, result, ruleSet, snapshot } = await setupDecision();
    const firstPairing = await setupPairing(connection.id, "f");
    const secondPairing = await setupPairing(connection.id, "1");
    const extensionContext = {
      canonicalUrl: "https://www.flipkart.com/synthetic/p/item",
      extractedPriceMinor: 45_000_00,
      extractedTitle: "Synthetic headphones",
      extractionConfidence: "medium" as const,
      idempotencyKey: "20000000-0000-4000-8000-000000000001",
      merchant: "flipkart.com" as const,
    };
    const createForPairing = (pairingId: string) =>
      repository.createPurchaseDecision({
        auditBundle: { input: result.inputs, result },
        connectionId: connection.id,
        description: "Synthetic headphones",
        extensionContext: { ...extensionContext, pairingId },
        priceMinor: 45_000_00,
        result,
        ruleSetId: ruleSet.id,
        snapshotId: snapshot.id,
      });

    const first = await createForPairing(firstPairing.id);
    const second = await createForPairing(secondPairing.id);
    expect(second.intent.id).not.toBe(first.intent.id);

    await expect(
      repository.updateExtensionIntentStatus(
        connection.id,
        secondPairing.id,
        first.intent.id,
        "waiting"
      )
    ).rejects.toThrow("Purchase intent not found");
    await expect(
      repository.updateExtensionIntentStatus(
        connection.id,
        firstPairing.id,
        first.intent.id,
        "waiting"
      )
    ).resolves.toEqual({ latestDecisionId: first.decision.id, status: "waiting" });
    await expect(repository.getDecision(connection.id, first.decision.id)).resolves.toMatchObject({
      intent: { plannedFor: null, status: "waiting" },
    });
  });

  it("exports complete decision data without authorization secrets", async () => {
    const { connection } = await setupDecision();
    const pairing = await setupPairing(connection.id, "c");
    await database.db.insert(transactionClassificationRules).values({
      classification: "investment",
      connectionId: connection.id,
      merchantKey: "synthetic store",
    });
    await repository.createAuditEvent({
      connectionId: connection.id,
      details: {},
      type: "export_created",
    });

    const exported = await repository.exportOwnerData(connection.id);

    expect(exported).toMatchObject({
      extensionPairings: [
        {
          extensionOrigin: "chrome-extension://abcdefghijklmnopabcdefghijklmnop",
          id: pairing.id,
        },
      ],
      schemaVersion: 3,
      transactionClassificationRules: [
        {
          classification: "investment",
          merchantKey: "synthetic store",
        },
      ],
    });
    expect(Number.isNaN(Date.parse(exported.exportedAt))).toBe(false);
    expect(exported.decisions).toHaveLength(1);
    expect(exported.ruleSets).toHaveLength(1);
    expect(exported.snapshots).toHaveLength(1);
    expect(JSON.stringify(exported)).not.toMatch(
      /credentialHash|encryptedAuthorization|authorizationIv|authorizationTag|accessToken|refreshToken/
    );
    const roundTripped = JSON.parse(JSON.stringify(exported)) as typeof exported;
    expect(roundTripped.decisions[0]?.auditBundle).toEqual(exported.decisions[0]?.auditBundle);
  });

  it("deletes authorization and every connection-owned decision record", async () => {
    const { connection } = await setupDecision();
    await setupPairing(connection.id, "d");
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
    await expect(database.db.select().from(extensionPairings)).resolves.toEqual([]);
    await expect(database.db.select().from(extensionPairingRequests)).resolves.toEqual([]);
  });
});
