import { describe, expect, it } from "vitest";

import { DEFAULT_RULES, nextSalaryDate, resolveForecastHorizon, validateRuleSet } from "./rules";

const validRules = { ...DEFAULT_RULES, version: 1 };

describe("rule sets", () => {
  it("accepts the default rule set", () => {
    expect(validateRuleSet(validRules, "2026-08-17")).toEqual(validRules);
  });

  it("clamps salary day 31 to the end of February", () => {
    expect(nextSalaryDate(31, "2027-02-01")).toBe("2027-02-28");
    expect(nextSalaryDate(31, "2028-02-01")).toBe("2028-02-29");
  });

  it("moves to the following month when this month's salary date has passed", () => {
    expect(nextSalaryDate(15, "2026-08-15")).toBe("2026-09-15");
  });

  it("caps a distant next salary horizon at 30 days", () => {
    const rules = validateRuleSet(
      {
        ...validRules,
        salary: { ...validRules.salary, dayOfMonth: 31 },
      },
      "2026-08-01"
    );

    expect(resolveForecastHorizon(rules, "2026-08-01T12:00:00.000Z")).toBe("2026-08-31");
  });

  it("resolves rolling, custom, and near salary horizons", () => {
    const rolling = validateRuleSet(
      { ...validRules, forecastHorizon: { kind: "rolling_days", days: 7 } },
      "2026-08-17"
    );
    const custom = validateRuleSet(
      { ...validRules, forecastHorizon: { kind: "custom", endDate: "2026-08-20" } },
      "2026-08-17"
    );
    const salary = validateRuleSet(
      { ...validRules, salary: { ...validRules.salary, dayOfMonth: 20 } },
      "2026-08-17"
    );

    expect(resolveForecastHorizon(rolling, "2026-08-17")).toBe("2026-08-24");
    expect(resolveForecastHorizon(custom, "2026-08-17")).toBe("2026-08-20");
    expect(resolveForecastHorizon(salary, "2026-08-17")).toBe("2026-08-20");
  });

  it("rejects invalid salary and calendar-date arguments", () => {
    expect(() => nextSalaryDate(0, "2026-08-17")).toThrow("Salary day must be between 1 and 31");
    expect(() => nextSalaryDate(15, "2026-02-30")).toThrow("Expected an ISO calendar date");
    expect(() => validateRuleSet(validRules, "not-a-date")).toThrow(
      "Expected an ISO calendar date"
    );
  });

  it("rejects rolling and custom horizons longer than 30 days", () => {
    expect(() =>
      validateRuleSet(
        {
          ...validRules,
          forecastHorizon: { kind: "rolling_days", days: 31 },
        },
        "2026-08-17"
      )
    ).toThrow("Forecast horizon must be at most 30 days");
    expect(() =>
      validateRuleSet(
        {
          ...validRules,
          forecastHorizon: { kind: "custom", endDate: "2026-09-17" },
        },
        "2026-08-17"
      )
    ).toThrow("Custom horizon must be within 30 days");
  });

  it("rejects expired custom horizons", () => {
    expect(() =>
      validateRuleSet(
        {
          ...validRules,
          forecastHorizon: { kind: "custom", endDate: "2026-08-16" },
        },
        "2026-08-17"
      )
    ).toThrow("Custom horizon cannot be before the reference date");
  });

  it.each([
    ["fractional paise", { currency: "INR", minor: 1.5 }],
    ["negative money", { currency: "INR", minor: -1 }],
    ["unsafe money", { currency: "INR", minor: Number.MAX_SAFE_INTEGER + 1 }],
    ["unsupported currency", { currency: "USD", minor: 100 }],
  ])("rejects %s", (_name, minimumBuffer) => {
    expect(() =>
      validateRuleSet(
        {
          ...validRules,
          minimumBuffer,
        },
        "2026-08-17"
      )
    ).toThrow();
  });

  it.each([0, 32, 1.5])("rejects salary day %s", (dayOfMonth) => {
    expect(() =>
      validateRuleSet(
        {
          ...validRules,
          salary: { ...validRules.salary, dayOfMonth },
        },
        "2026-08-17"
      )
    ).toThrow();
  });

  it.each([-1, 10_001, 1.5])("rejects materiality ratio %s", (purchaseRatioBps) => {
    expect(() =>
      validateRuleSet(
        {
          ...validRules,
          materiality: { ...validRules.materiality, purchaseRatioBps },
        },
        "2026-08-17"
      )
    ).toThrow();
  });
});
