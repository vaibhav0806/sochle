import { describe, expect, it } from "vitest";

import { buildWeeklyReview } from "./weekly-review";

describe("buildWeeklyReview", () => {
  it("summarizes owner outcomes and progress using integer paise", () => {
    expect(
      buildWeeklyReview({
        decisions: [
          { evaluatedAt: "2026-08-17T09:00:00.000Z", outcome: "skipped", priceMinor: 45_000_00 },
          { evaluatedAt: "2026-08-18T09:00:00.000Z", outcome: "waiting", priceMinor: 12_000_00 },
          { evaluatedAt: "2026-08-19T09:00:00.000Z", outcome: "purchased", priceMinor: 8_000_00 },
        ],
        endDate: "2026-08-23",
        openIssueCount: 2,
        safeToSpendChangeMinor: -5_000_00,
        startDate: "2026-08-17",
      })
    ).toMatchObject({
      confirmedSkippedMinor: 45_000_00,
      decisionCount: 3,
      delayedCount: 1,
      openIssueCount: 2,
      safeToSpendChangeMinor: -5_000_00,
    });
  });

  it("rejects an invalid week range and ignores decisions outside it", () => {
    expect(() =>
      buildWeeklyReview({
        decisions: [],
        endDate: "2026-08-16",
        openIssueCount: 0,
        safeToSpendChangeMinor: 0,
        startDate: "2026-08-17",
      })
    ).toThrow("Weekly review dates are invalid");
  });
});
