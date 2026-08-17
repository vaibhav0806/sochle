import { describe, expect, it } from "vitest";

import { formatMinorAsRupees, parseNonNegativeRupeesToMinor, parseRupeesToMinor } from "./money";

describe("parseRupeesToMinor", () => {
  it.each([
    ["45000", 45_000_00],
    ["45000.50", 45_000_50],
    ["0.01", 1],
  ])("parses %s without floating point arithmetic", (input, expected) => {
    expect(parseRupeesToMinor(input)).toBe(expected);
  });

  it.each(["0", "-1", "1.001", "₹45,000", "abc", " 45000 ", "90071992547410"])(
    "rejects %s",
    (input) => {
      expect(() => parseRupeesToMinor(input)).toThrow();
    }
  );
});

describe("parseNonNegativeRupeesToMinor", () => {
  it("allows zero-valued financial rules", () => {
    expect(parseNonNegativeRupeesToMinor("0")).toBe(0);
  });

  it("retains exact paise validation", () => {
    expect(parseNonNegativeRupeesToMinor("45000.50")).toBe(45_000_50);
    expect(() => parseNonNegativeRupeesToMinor("-1")).toThrow();
  });
});

describe("formatMinorAsRupees", () => {
  it.each([
    [45_000_00, "₹45,000.00"],
    [1, "₹0.01"],
    [-1_23_456_78, "-₹1,23,456.78"],
  ])("formats %d paise as %s", (input, expected) => {
    expect(formatMinorAsRupees(input)).toBe(expected);
  });

  it("rejects fractional paise", () => {
    expect(() => formatMinorAsRupees(1.5)).toThrow();
  });
});
