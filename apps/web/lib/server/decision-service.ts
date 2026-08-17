import { calculateTodayPosition, evaluatePurchase, type DecisionIssue } from "@sochle/domain";
import type { DecisionRepository, FinancialRepository } from "@sochle/db";

export type DecisionPrerequisite = "rules" | "snapshot";

export class DecisionPrerequisiteError extends Error {
  constructor(readonly prerequisite: DecisionPrerequisite) {
    super(`Missing decision prerequisite: ${prerequisite}`);
    this.name = "DecisionPrerequisiteError";
  }
}

type StoredIssue = {
  details: Record<string, unknown>;
  id: string;
  type: string;
};

export function toDecisionIssue(issue: StoredIssue): DecisionIssue {
  const minimum = issue.details.liquidityEffectMinMinor;
  const maximum = issue.details.liquidityEffectMaxMinor;
  const bounded =
    typeof minimum === "number" &&
    typeof maximum === "number" &&
    Number.isSafeInteger(minimum) &&
    Number.isSafeInteger(maximum) &&
    minimum <= maximum;
  return {
    effect: bounded ? { maxMinor: maximum as number, minMinor: minimum as number } : null,
    id: issue.id,
    label: issue.type,
  };
}

export function createDecisionService(
  financialRepository: FinancialRepository,
  decisionRepository: DecisionRepository
) {
  async function loadPrerequisites(connectionId: string) {
    const [snapshot, ruleSet, openIssues] = await Promise.all([
      financialRepository.getLatestSnapshot(connectionId),
      decisionRepository.getActiveRuleSet(connectionId),
      financialRepository.listOpenIssues(connectionId),
    ]);
    if (snapshot === null) throw new DecisionPrerequisiteError("snapshot");
    if (ruleSet === null) throw new DecisionPrerequisiteError("rules");
    return {
      issues: openIssues.map(toDecisionIssue),
      plannedPurchases: await decisionRepository.listPlannedPurchases(connectionId),
      ruleSet,
      snapshot,
    };
  }

  return {
    async checkPurchase(input: {
      connectionId: string;
      description: string;
      evaluatedAt: string;
      priceMinor: number;
    }) {
      const { issues, plannedPurchases, ruleSet, snapshot } = await loadPrerequisites(
        input.connectionId
      );
      const result = evaluatePurchase({
        dataIssues: issues,
        evaluatedAt: input.evaluatedAt,
        financialState: snapshot.state,
        plannedPurchases,
        price: { currency: "INR", minor: input.priceMinor },
        rules: ruleSet.rules,
        snapshotId: snapshot.id,
      });
      const saved = await decisionRepository.createPurchaseDecision({
        auditBundle: { input: result.inputs, result },
        connectionId: input.connectionId,
        description: input.description,
        priceMinor: input.priceMinor,
        result,
        ruleSetId: ruleSet.id,
        snapshotId: snapshot.id,
      });
      return { ...saved, result };
    },

    async getTodaySummary(connectionId: string, evaluatedAt: string) {
      const { issues, plannedPurchases, ruleSet, snapshot } = await loadPrerequisites(connectionId);
      const position = calculateTodayPosition({
        dataIssues: issues,
        evaluatedAt,
        financialState: snapshot.state,
        plannedPurchases,
        rules: ruleSet.rules,
        snapshotId: snapshot.id,
      });
      return {
        ...position,
        immediateObligationsMinor:
          snapshot.state.liquidCash.minor - position.headrooms.technicalMinor,
        issues,
        liquidCashMinor: snapshot.state.liquidCash.minor,
        ruleSetVersion: ruleSet.version,
        snapshotAsOf: snapshot.state.asOf,
        snapshotId: snapshot.id,
        upcomingObligationsMinor: position.forecast.days.reduce(
          (total, day) =>
            total +
            day.events
              .filter((event) => event.kind === "obligation")
              .reduce((dayTotal, event) => dayTotal + event.amountMinor, 0),
          0
        ),
      };
    },
  };
}
