import {
  DEFAULT_RULES,
  REQUIRED_DECISION_SOURCES,
  type NormalizedFinancialState,
  type RuleSet,
} from "@sochle/domain";
import { createSochleDatabase, DecisionRepository, FinancialRepository } from "@sochle/db";
import { afterAll, beforeEach, describe, expect, it } from "vitest";

import {
  createDecisionService,
  DecisionPrerequisiteError,
  toDecisionIssue,
} from "./decision-service";

const database = createSochleDatabase(
  process.env.TEST_DATABASE_URL ?? "postgresql://sochle:sochle@localhost:65432/sochle_verify"
);
const financialRepository = new FinancialRepository(database.db);
const decisionRepository = new DecisionRepository(database.db);
const service = createDecisionService(financialRepository, decisionRepository);

const evaluatedAt = "2026-08-17T12:00:00.000Z";
const state: NormalizedFinancialState = {
  accounts: [],
  asOf: evaluatedAt,
  cardObligations: { currency: "INR", minor: 0 },
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
      id: "synthetic-rent",
      name: "Synthetic rent",
      source: "recurring_expense",
    },
    {
      amount: { currency: "INR", minor: 10_000_00 },
      budgetTreatment: "additional",
      certainty: "confirmed",
      dueOn: "2026-08-22",
      id: "synthetic-card",
      name: "Synthetic card bill",
      source: "credit_card",
    },
  ],
};
const rules: RuleSet = {
  ...DEFAULT_RULES,
  essentialMonthlySpending: { currency: "INR", minor: 40_000_00 },
  minimumBuffer: { currency: "INR", minor: 25_000_00 },
  monthlyInvestmentTarget: { currency: "INR", minor: 25_000_00 },
  salary: { amount: { currency: "INR", minor: 0 }, confirmed: true, dayOfMonth: 31 },
  version: 1,
};

beforeEach(async () => {
  const connection = await financialRepository.getConnection("fold");
  if (connection !== null) await decisionRepository.deleteOwnerData(connection.id);
});

afterAll(async () => {
  await database.close();
});

async function seedPrerequisites() {
  const connection = await financialRepository.ensureConnection("fold");
  const oldSnapshot = await financialRepository.saveSnapshot(
    connection.id,
    { ...state, asOf: "2026-08-16T12:00:00.000Z" },
    "old-snapshot"
  );
  const snapshot = await financialRepository.saveSnapshot(connection.id, state, "latest-snapshot");
  const ruleSet = await decisionRepository.createRuleSet(connection.id, rules);
  return { connection, oldSnapshot, ruleSet, snapshot };
}

describe("toDecisionIssue", () => {
  it("accepts ordered safe liquidity bounds", () => {
    expect(
      toDecisionIssue({
        details: { liquidityEffectMaxMinor: 5_000_00, liquidityEffectMinMinor: -2_000_00 },
        id: "issue-1",
        severity: "blocking",
        type: "synthetic_variance",
      })
    ).toEqual({
      effect: { maxMinor: 5_000_00, minMinor: -2_000_00 },
      id: "issue-1",
      label: "synthetic_variance",
    });
  });

  it.each([
    {},
    { liquidityEffectMaxMinor: 100 },
    { liquidityEffectMaxMinor: 100, liquidityEffectMinMinor: 200 },
    { liquidityEffectMaxMinor: 1.5, liquidityEffectMinMinor: 0 },
  ])("treats invalid or absent bounds as unbounded", (details) => {
    expect(
      toDecisionIssue({
        details,
        id: "issue-1",
        severity: "blocking",
        type: "synthetic_variance",
      }).effect
    ).toBeNull();
  });
});

describe("decision service", () => {
  it("evaluates the latest cached snapshot and persists the exact result", async () => {
    const { connection, oldSnapshot, snapshot } = await seedPrerequisites();

    const saved = await service.checkPurchase({
      connectionId: connection.id,
      description: "Synthetic headphones",
      evaluatedAt,
      priceMinor: 45_000_00,
    });

    expect(saved.result.inputs.snapshotId).toBe(snapshot.id);
    expect(saved.result.inputs.snapshotId).not.toBe(oldSnapshot.id);
    expect(saved.decision.auditBundle.result).toEqual(saved.result);
    await expect(
      decisionRepository.getDecision(connection.id, saved.decision.id)
    ).resolves.toMatchObject({
      decision: { auditBundle: { result: saved.result } },
    });
  });

  it("does not let optional review items block purchase confidence", async () => {
    const { connection, snapshot } = await seedPrerequisites();
    const optionalIssues = await financialRepository.replaceOpenIssues(connection.id, snapshot.id, [
      {
        details: {},
        materialityMinor: 45_000_00,
        relatedEntityId: "optional-warning",
        relatedEntityType: "transaction",
        severity: "warning",
        type: "synthetic_optional_review",
      },
      {
        details: {},
        materialityMinor: 45_000_00,
        relatedEntityId: "legacy-large-untagged",
        relatedEntityType: "transaction",
        severity: "blocking",
        type: "large_untagged_transaction",
      },
    ]);

    const saved = await service.checkPurchase({
      connectionId: connection.id,
      description: "Synthetic headphones",
      evaluatedAt,
      priceMinor: 45_000_00,
    });

    expect(optionalIssues).toHaveLength(2);
    for (const issue of optionalIssues) {
      expect(saved.result.confidence.blockingIssueIds).not.toContain(issue.id);
    }
  });

  it("creates a cached-snapshot decision in under five seconds", async () => {
    const { connection } = await seedPrerequisites();
    const startedAt = performance.now();

    await service.checkPurchase({
      connectionId: connection.id,
      description: "Synthetic headphones",
      evaluatedAt,
      priceMinor: 45_000_00,
    });

    expect(performance.now() - startedAt).toBeLessThan(5_000);
  });

  it("appends successors without mutating prior decisions after a correction", async () => {
    const { connection } = await seedPrerequisites();
    const original = await service.checkPurchase({
      connectionId: connection.id,
      description: "Synthetic headphones",
      evaluatedAt,
      priceMinor: 45_000_00,
    });

    const recalculated = await service.recalculateLatestDecisions(connection.id, evaluatedAt);

    expect(recalculated).toEqual([{ previousDecisionId: original.decision.id }]);
    await expect(
      decisionRepository.getDecision(connection.id, original.decision.id)
    ).resolves.toMatchObject({
      decision: { previousDecisionId: null },
    });
    await expect(decisionRepository.listDecisions(connection.id)).resolves.toHaveLength(1);
  });

  it("returns the same pre-purchase goal headroom for Today without creating a decision", async () => {
    const { connection, snapshot } = await seedPrerequisites();

    const today = await service.getTodaySummary(connection.id, evaluatedAt);

    expect(today).toMatchObject({
      immediateObligationsMinor: 30_000_00,
      liquidCashMinor: 150_000_00,
      safeToSpendMinor: 50_000_00,
      snapshotId: snapshot.id,
      upcomingObligationsMinor: 30_000_00,
    });
    await expect(decisionRepository.listDecisions(connection.id)).resolves.toEqual([]);
  });

  it("reports missing snapshot and rules separately", async () => {
    const connection = await financialRepository.ensureConnection("fold");

    await expect(
      service.checkPurchase({
        connectionId: connection.id,
        description: "Synthetic headphones",
        evaluatedAt,
        priceMinor: 45_000_00,
      })
    ).rejects.toEqual(new DecisionPrerequisiteError("snapshot"));

    await financialRepository.saveSnapshot(connection.id, state, "snapshot-without-rules");
    await expect(service.getTodaySummary(connection.id, evaluatedAt)).rejects.toEqual(
      new DecisionPrerequisiteError("rules")
    );
  });

  it("does not require decision prerequisites when there is nothing to recalculate", async () => {
    const connection = await financialRepository.ensureConnection("fold");
    await expect(service.recalculateLatestDecisions(connection.id, evaluatedAt)).resolves.toEqual(
      []
    );
  });
});
