import { describe, expect, it } from "vitest";

import type { FinancialVerdictInput } from "./verdict";
import { selectFinancialVerdict } from "./verdict";

const base: FinancialVerdictInput = {
  comfortableHeadroomMinor: 1,
  currentComfortableHeadroomMinor: 1,
  firstComfortablyAffordableDate: "2026-08-17",
  goalHeadroomMinor: 1,
  investmentTargetMinor: 0,
  nextSalaryDate: "2026-08-31",
  technicalHeadroomMinor: 1,
};

describe("selectFinancialVerdict", () => {
  it.each<[string, FinancialVerdictInput, string]>([
    [
      "payday wins before a horizon-positive goal",
      {
        ...base,
        currentComfortableHeadroomMinor: -1,
        firstComfortablyAffordableDate: "2026-08-31",
      },
      "wait_until_payday",
    ],
    [
      "zero goal headroom is comfortable",
      { ...base, goalHeadroomMinor: 0 },
      "comfortably_affordable",
    ],
    [
      "investment reduction restores the goal",
      { ...base, goalHeadroomMinor: -10, investmentTargetMinor: 10 },
      "requires_reducing_investments",
    ],
    [
      "the buffer survives another compromised goal",
      { ...base, comfortableHeadroomMinor: 0, goalHeadroomMinor: -11, investmentTargetMinor: 10 },
      "affordable_with_tradeoffs",
    ],
    [
      "cash exists but the buffer breaks",
      { ...base, comfortableHeadroomMinor: -1, goalHeadroomMinor: -1, technicalHeadroomMinor: 0 },
      "technically_possible_financially_tight",
    ],
    [
      "cash cannot cover the purchase",
      { ...base, comfortableHeadroomMinor: -1, goalHeadroomMinor: -1, technicalHeadroomMinor: -1 },
      "not_affordable",
    ],
  ])("%s", (_name, input, expected) => {
    expect(selectFinancialVerdict(input)).toBe(expected);
  });

  it("does not recommend payday without an exact confirmed salary-date match", () => {
    expect(
      selectFinancialVerdict({
        ...base,
        currentComfortableHeadroomMinor: -1,
        firstComfortablyAffordableDate: "2026-08-30",
      })
    ).toBe("comfortably_affordable");
    expect(
      selectFinancialVerdict({
        ...base,
        currentComfortableHeadroomMinor: -1,
        firstComfortablyAffordableDate: "2026-08-31",
        nextSalaryDate: null,
      })
    ).toBe("comfortably_affordable");
  });
});
