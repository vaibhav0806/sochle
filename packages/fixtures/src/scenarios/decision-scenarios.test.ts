import { evaluatePurchase } from "@sochle/domain";
import { describe, expect, it } from "vitest";

import { decisionScenarios } from "./decision-scenarios";

describe("decision scenarios", () => {
  it.each(decisionScenarios)("reproduces $id", (scenario) => {
    const result = evaluatePurchase(scenario.input);

    expect(result.headrooms).toEqual(scenario.expected.headrooms);
    expect(result.financialVerdict).toBe(scenario.expected.financialVerdict);
    expect(result.confidence.level).toBe(scenario.expected.confidence);
    expect(result.verdict).toBe(scenario.expected.verdict);
    expect(result.firstComfortablyAffordableDate).toBe(
      scenario.expected.firstComfortablyAffordableDate
    );
    expect(result.formulaVersion).toBe(1);
  });
});
