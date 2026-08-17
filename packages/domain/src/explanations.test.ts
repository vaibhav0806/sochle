import { describe, expect, it } from "vitest";

import type { DataConfidence } from "./financial-state";
import { buildExplanation } from "./explanations";
import type { Verdict } from "./verdict";

const financialVerdicts = [
  "comfortably_affordable",
  "affordable_with_tradeoffs",
  "wait_until_payday",
  "requires_reducing_investments",
  "technically_possible_financially_tight",
  "not_affordable",
] as const;

const input = {
  blockingIssueLabels: [],
  bufferShortfallMinor: 5_000_00,
  firstComfortablyAffordableDate: "2026-08-31",
  goalHeadroomMinor: -10_000_00,
  investmentReductionMinor: 10_000_00,
  technicalHeadroomMinor: -15_000_00,
};

describe("buildExplanation", () => {
  it.each(
    financialVerdicts.flatMap((verdict) =>
      (["high", "medium"] as const).map((confidence) => [verdict, confidence] as const)
    )
  )("renders versioned %s/%s copy", (verdict, confidence) => {
    const explanation = buildExplanation({ ...input, confidence, verdict });

    expect(explanation.templateId).toBe(`${confidence}.${verdict}.v1`);
    expect(explanation.templateVersion).toBe(1);
    expect(explanation.headline.length).toBeGreaterThan(0);
    expect(explanation.reason.length).toBeGreaterThan(0);
  });

  it("keeps low-confidence copy protective and names the blocker", () => {
    const explanation = buildExplanation({
      ...input,
      blockingIssueLabels: ["Unknown debit"],
      confidence: "low",
      verdict: "insufficient_confidence",
    });

    expect(explanation).toMatchObject({
      headline: "Pehle data sort karte hain, phir decision.",
      templateId: "low.insufficient_confidence.v1",
      templateVersion: 1,
    });
    expect(explanation.reason).toContain("Unknown debit");
    expect(explanation.headline).not.toMatch(/fits|affordable|go for it/i);
  });

  it("does not make a medium negative verdict sound positive", () => {
    const explanation = buildExplanation({
      ...input,
      confidence: "medium",
      verdict: "not_affordable",
    });

    expect(explanation.headline).toBe("Abhi no lag raha hai—but ek input needs a quick check.");
    expect(explanation.headline).not.toMatch(/doable|fits|go for it/i);
  });

  it("uses a safe payday fallback and rejects fractional paise", () => {
    expect(
      buildExplanation({
        ...input,
        confidence: "high",
        firstComfortablyAffordableDate: null,
        verdict: "wait_until_payday",
      }).reason
    ).toContain("confirmed payday");
    expect(() =>
      buildExplanation({
        ...input,
        confidence: "high",
        technicalHeadroomMinor: 1.5,
        verdict: "not_affordable",
      })
    ).toThrow("Explanation money must use safe integer paise");
  });

  it.each<[Verdict, DataConfidence]>([
    ["insufficient_confidence", "high"],
    ["comfortably_affordable", "low"],
  ])("rejects incompatible %s/%s pairs", (verdict, confidence) => {
    expect(() => buildExplanation({ ...input, confidence, verdict })).toThrow(
      "Verdict and confidence do not match"
    );
  });
});
