export type WeeklyReviewOutcome = "purchased" | "skipped" | "waiting" | "planned" | null;

export type WeeklyReviewInput = {
  decisions: Array<{ evaluatedAt: string; outcome: WeeklyReviewOutcome; priceMinor: number }>;
  endDate: string;
  openIssueCount: number;
  safeToSpendChangeMinor: number;
  startDate: string;
};

export type WeeklyReview = {
  confirmedSkippedMinor: number;
  decisionCount: number;
  delayedCount: number;
  openIssueCount: number;
  safeToSpendChangeMinor: number;
};

function validDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

export function buildWeeklyReview(input: WeeklyReviewInput): WeeklyReview {
  if (!validDate(input.startDate) || !validDate(input.endDate) || input.startDate > input.endDate) {
    throw new Error("Weekly review dates are invalid");
  }
  if (!Number.isSafeInteger(input.openIssueCount) || input.openIssueCount < 0) {
    throw new Error("Open issue count is invalid");
  }
  if (!Number.isSafeInteger(input.safeToSpendChangeMinor)) {
    throw new Error("Safe to spend change is invalid");
  }

  const decisions = input.decisions.filter((decision) => {
    const date = new Date(decision.evaluatedAt).toISOString().slice(0, 10);
    if (!Number.isSafeInteger(decision.priceMinor) || decision.priceMinor < 0) {
      throw new Error("Decision price is invalid");
    }
    return date >= input.startDate && date <= input.endDate;
  });
  return {
    confirmedSkippedMinor: decisions
      .filter((decision) => decision.outcome === "skipped")
      .reduce((total, decision) => total + decision.priceMinor, 0),
    decisionCount: decisions.length,
    delayedCount: decisions.filter(
      (decision) => decision.outcome === "waiting" || decision.outcome === "planned"
    ).length,
    openIssueCount: input.openIssueCount,
    safeToSpendChangeMinor: input.safeToSpendChangeMinor,
  };
}
