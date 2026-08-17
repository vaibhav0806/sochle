import { describe, expect, it } from "vitest";

import type { SourceFreshness } from "./financial-state";
import {
  assessConfidence,
  materialityThresholdMinor,
  REQUIRED_DECISION_SOURCES,
} from "./confidence";

const evaluatedAt = "2026-08-17T12:00:00.000Z";
const freshSources: SourceFreshness[] = REQUIRED_DECISION_SOURCES.map((source) => ({
  refreshedAt: "2026-08-17T06:00:00.000Z",
  source,
  status: "fresh",
}));
const baseInput = {
  assumptionsConfirmed: true,
  baseVerdict: "comfortably_affordable" as const,
  evaluatedAt,
  issues: [],
  materialityThresholdMinor: 500_000,
  sources: freshSources,
  verdictForLiquidityAdjustment: () => "comfortably_affordable" as const,
};

describe("materialityThresholdMinor", () => {
  it("uses the lower of ₹5,000 and 10% of purchase price", () => {
    expect(materialityThresholdMinor(45_000_00, 5_000_00, 1_000)).toBe(4_500_00);
    expect(materialityThresholdMinor(100_000_00, 5_000_00, 1_000)).toBe(5_000_00);
  });

  it("rounds down to zero paise for a one-paise purchase", () => {
    expect(materialityThresholdMinor(1, 5_000_00, 1_000)).toBe(0);
  });

  it("rejects invalid money and basis points", () => {
    expect(() => materialityThresholdMinor(0, 5_000_00, 1_000)).toThrow();
    expect(() => materialityThresholdMinor(100, 5_000_00, 10_001)).toThrow();
  });
});

describe("assessConfidence", () => {
  it("keeps the six-hour boundary high and the 24-hour boundary medium", () => {
    expect(assessConfidence(baseInput).level).toBe("high");
    expect(
      assessConfidence({
        ...baseInput,
        sources: freshSources.map((source) => ({
          ...source,
          refreshedAt: "2026-08-16T12:00:00.000Z",
        })),
      }).level
    ).toBe("medium");
  });

  it.each([
    ["older than 24 hours", "2026-08-16T11:59:59.999Z"],
    ["future-dated", "2026-08-17T12:00:00.001Z"],
  ])("marks a %s required source low", (_name, refreshedAt) => {
    expect(
      assessConfidence({
        ...baseInput,
        sources: freshSources.map((source) => ({ ...source, refreshedAt })),
      }).level
    ).toBe("low");
  });

  it("marks a missing required source and unconfirmed assumptions low", () => {
    expect(assessConfidence({ ...baseInput, sources: freshSources.slice(1) }).level).toBe("low");
    expect(assessConfidence({ ...baseInput, assumptionsConfirmed: false }).level).toBe("low");
  });

  it("marks a below-threshold stable issue medium", () => {
    const result = assessConfidence({
      ...baseInput,
      issues: [
        {
          effect: { maxMinor: 499_999, minMinor: -499_999 },
          id: "small-issue",
          label: "Small unknown debit",
        },
      ],
    });

    expect(result.level).toBe("medium");
    expect(result.blockingIssueIds).toEqual([]);
  });

  it("marks threshold equality and unbounded issues low", () => {
    expect(
      assessConfidence({
        ...baseInput,
        issues: [
          {
            effect: { maxMinor: 500_000, minMinor: 0 },
            id: "material-issue",
            label: "Material debit",
          },
        ],
      }).level
    ).toBe("low");
    expect(
      assessConfidence({
        ...baseInput,
        issues: [{ effect: null, id: "unknown-issue", label: "Unknown debit" }],
      }).blockingIssueIds
    ).toEqual(["unknown-issue"]);
  });

  it("ignores a proven zero-effect issue at a zero threshold", () => {
    expect(
      assessConfidence({
        ...baseInput,
        issues: [{ effect: { maxMinor: 0, minMinor: 0 }, id: "zero", label: "No effect" }],
        materialityThresholdMinor: 0,
      }).level
    ).toBe("high");
  });

  it("detects verdict sensitivity below the amount threshold", () => {
    expect(
      assessConfidence({
        ...baseInput,
        issues: [
          {
            effect: { maxMinor: 100, minMinor: -100 },
            id: "sensitive",
            label: "Boundary debit",
          },
        ],
        verdictForLiquidityAdjustment: (adjustment) =>
          adjustment < 0 ? "affordable_with_tradeoffs" : "comfortably_affordable",
      }).level
    ).toBe("low");
  });

  it("detects the combined effect of individually small issues", () => {
    expect(
      assessConfidence({
        ...baseInput,
        issues: [
          { effect: { maxMinor: 100, minMinor: -100 }, id: "one", label: "Issue one" },
          { effect: { maxMinor: 100, minMinor: -100 }, id: "two", label: "Issue two" },
        ],
        verdictForLiquidityAdjustment: (adjustment) =>
          adjustment <= -200 ? "affordable_with_tradeoffs" : "comfortably_affordable",
      }).level
    ).toBe("low");
  });
});
