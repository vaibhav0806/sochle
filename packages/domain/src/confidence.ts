import type { DataConfidence, FinancialSource, SourceFreshness } from "./financial-state";
import type { FinancialVerdict } from "./verdict";

export const REQUIRED_DECISION_SOURCES = [
  "total_balance",
  "bank_accounts",
  "credit_cards",
  "transactions",
  "recurring_expenses",
  "upcoming_recurring_cycles",
] as const satisfies readonly FinancialSource[];

export type DecisionIssue = {
  effect: { maxMinor: number; minMinor: number } | null;
  id: string;
  label: string;
};

export type ConfidenceReason = {
  code:
    | "assumption_unconfirmed"
    | "issue_below_materiality"
    | "issue_material"
    | "issue_unbounded"
    | "source_aging"
    | "source_invalid"
    | "source_missing"
    | "source_sensitive"
    | "source_stale"
    | "source_unbounded"
    | "verdict_sensitive";
  detail: string;
  issueId?: string;
  source?: FinancialSource;
};

export type SensitivityResult = {
  adjustmentMinor: number;
  issueId: string | "combined";
  verdict: FinancialVerdict;
};

export type ConfidenceAssessment = {
  blockingIssueIds: string[];
  level: DataConfidence;
  reasons: ConfidenceReason[];
  sensitivity: SensitivityResult[];
};

export type ConfidenceInput = {
  assumptionsConfirmed: boolean;
  baseVerdict: FinancialVerdict;
  evaluatedAt: string;
  issues: DecisionIssue[];
  materialityThresholdMinor: number;
  sources: SourceFreshness[];
  verdictForLiquidityAdjustment: (adjustmentMinor: number) => FinancialVerdict;
};

const SIX_HOURS_MS = 6 * 60 * 60 * 1_000;
const TWENTY_FOUR_HOURS_MS = 24 * 60 * 60 * 1_000;
const SEVENTY_TWO_HOURS_MS = 72 * 60 * 60 * 1_000;

export function materialityThresholdMinor(
  priceMinor: number,
  absoluteCapMinor: number,
  purchaseRatioBps: number
): number {
  if (!Number.isSafeInteger(priceMinor) || priceMinor <= 0) {
    throw new Error("Purchase price must be a positive safe integer");
  }
  if (!Number.isSafeInteger(absoluteCapMinor) || absoluteCapMinor < 0) {
    throw new Error("Materiality cap must be a non-negative safe integer");
  }
  if (
    !Number.isSafeInteger(purchaseRatioBps) ||
    purchaseRatioBps < 0 ||
    purchaseRatioBps > 10_000
  ) {
    throw new Error("Materiality ratio must be between 0 and 10000 basis points");
  }
  const ratioAmount = Number((BigInt(priceMinor) * BigInt(purchaseRatioBps)) / 10_000n);
  return Math.min(absoluteCapMinor, ratioAmount);
}

function parseTimestamp(value: string): number | null {
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? timestamp : null;
}

function addSigned(left: number, right: number): number {
  const result = left + right;
  if (!Number.isSafeInteger(result)) throw new Error("Issue effect exceeded safe integer range");
  return result;
}

export function assessConfidence(input: ConfidenceInput): ConfidenceAssessment {
  if (
    !Number.isSafeInteger(input.materialityThresholdMinor) ||
    input.materialityThresholdMinor < 0
  ) {
    throw new Error("Materiality threshold must be a non-negative safe integer");
  }
  const evaluatedTimestamp = parseTimestamp(input.evaluatedAt);
  if (evaluatedTimestamp === null) throw new Error("Evaluation timestamp must be ISO 8601");

  let level: DataConfidence = "high";
  const reasons: ConfidenceReason[] = [];
  const blockingIssueIds = new Set<string>();
  const sensitivity: SensitivityResult[] = [];
  const lowerTo = (next: DataConfidence) => {
    const rank: Record<DataConfidence, number> = { high: 0, medium: 1, low: 2 };
    if (rank[next] > rank[level]) level = next;
  };

  for (const requiredSource of REQUIRED_DECISION_SOURCES) {
    const source = input.sources.find((candidate) => candidate.source === requiredSource);
    if (source?.refreshedAt === null || source === undefined) {
      lowerTo("low");
      reasons.push({
        code: "source_missing",
        detail: `${requiredSource} has no usable refresh timestamp`,
        source: requiredSource,
      });
      continue;
    }
    const refreshedTimestamp = parseTimestamp(source.refreshedAt);
    if (refreshedTimestamp === null || refreshedTimestamp > evaluatedTimestamp) {
      lowerTo("low");
      reasons.push({
        code: "source_invalid",
        detail: `${requiredSource} has an invalid refresh timestamp`,
        source: requiredSource,
      });
      continue;
    }
    const age = evaluatedTimestamp - refreshedTimestamp;
    const agingAfter = requiredSource === "credit_cards" ? TWENTY_FOUR_HOURS_MS : SIX_HOURS_MS;
    const staleAfter =
      requiredSource === "credit_cards" ? SEVENTY_TWO_HOURS_MS : TWENTY_FOUR_HOURS_MS;
    if (age > staleAfter) {
      lowerTo(requiredSource === "credit_cards" ? "medium" : "low");
      reasons.push({
        code: "source_stale",
        detail: `${requiredSource} is older than ${requiredSource === "credit_cards" ? 72 : 24} hours`,
        source: requiredSource,
      });
      if (requiredSource === "credit_cards") {
        const effect = source.uncertaintyEffect;
        if (
          effect === undefined ||
          !Number.isSafeInteger(effect.minMinor) ||
          !Number.isSafeInteger(effect.maxMinor) ||
          effect.minMinor > effect.maxMinor
        ) {
          lowerTo("low");
          reasons.push({
            code: "source_unbounded",
            detail: "credit_cards has no bounded recent-spending exposure",
            source: requiredSource,
          });
        } else {
          const endpointVerdicts = [effect.minMinor, effect.maxMinor].map((adjustmentMinor) => {
            const verdict = input.verdictForLiquidityAdjustment(adjustmentMinor);
            sensitivity.push({
              adjustmentMinor,
              issueId: "source:credit_cards",
              verdict,
            });
            return verdict;
          });
          if (endpointVerdicts.some((verdict) => verdict !== input.baseVerdict)) {
            lowerTo("low");
            reasons.push({
              code: "source_sensitive",
              detail: "credit_cards uncertainty can change the verdict",
              source: requiredSource,
            });
          }
        }
      }
    } else if (age > agingAfter) {
      lowerTo("medium");
      reasons.push({
        code: "source_aging",
        detail: `${requiredSource} is older than ${requiredSource === "credit_cards" ? 24 : 6} hours`,
        source: requiredSource,
      });
    }
  }

  if (!input.assumptionsConfirmed) {
    lowerTo("low");
    reasons.push({
      code: "assumption_unconfirmed",
      detail: "A required financial assumption is unconfirmed",
    });
  }

  let combinedMinimum = 0;
  let combinedMaximum = 0;
  const boundedIssues: DecisionIssue[] = [];
  for (const issue of input.issues) {
    if (issue.effect === null) {
      lowerTo("low");
      blockingIssueIds.add(issue.id);
      reasons.push({
        code: "issue_unbounded",
        detail: `${issue.label} has an unknown financial effect`,
        issueId: issue.id,
      });
      continue;
    }
    const { maxMinor, minMinor } = issue.effect;
    if (!Number.isSafeInteger(minMinor) || !Number.isSafeInteger(maxMinor) || minMinor > maxMinor) {
      throw new Error("Issue effects must be ordered safe integers");
    }
    boundedIssues.push(issue);
    combinedMinimum = addSigned(combinedMinimum, minMinor);
    combinedMaximum = addSigned(combinedMaximum, maxMinor);
    const maximumEffect = Math.max(Math.abs(minMinor), Math.abs(maxMinor));
    const amountIsMaterial = maximumEffect > 0 && maximumEffect >= input.materialityThresholdMinor;
    const endpointVerdicts = [minMinor, maxMinor].map((adjustmentMinor) => {
      const verdict = input.verdictForLiquidityAdjustment(adjustmentMinor);
      sensitivity.push({ adjustmentMinor, issueId: issue.id, verdict });
      return verdict;
    });
    const verdictIsSensitive = endpointVerdicts.some((verdict) => verdict !== input.baseVerdict);

    if (amountIsMaterial || verdictIsSensitive) {
      lowerTo("low");
      blockingIssueIds.add(issue.id);
      reasons.push({
        code: verdictIsSensitive ? "verdict_sensitive" : "issue_material",
        detail: verdictIsSensitive
          ? `${issue.label} can change the verdict`
          : `${issue.label} meets the materiality threshold`,
        issueId: issue.id,
      });
    } else if (maximumEffect > 0) {
      lowerTo("medium");
      reasons.push({
        code: "issue_below_materiality",
        detail: `${issue.label} remains below materiality`,
        issueId: issue.id,
      });
    }
  }

  if (boundedIssues.length > 1) {
    for (const adjustmentMinor of [combinedMinimum, combinedMaximum]) {
      const verdict = input.verdictForLiquidityAdjustment(adjustmentMinor);
      sensitivity.push({ adjustmentMinor, issueId: "combined", verdict });
      if (verdict !== input.baseVerdict) {
        lowerTo("low");
        boundedIssues.forEach((issue) => blockingIssueIds.add(issue.id));
        reasons.push({
          code: "verdict_sensitive",
          detail: "The combined unresolved issues can change the verdict",
        });
        break;
      }
    }
  }

  return { blockingIssueIds: [...blockingIssueIds], level, reasons, sensitivity };
}
