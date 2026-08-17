import { describe, expect, it } from "vitest";

import { buildDailyForecast, calculateHeadrooms } from "./forecast";

describe("calculateHeadrooms", () => {
  it("calculates the three assessments without double counting essential obligations", () => {
    expect(
      calculateHeadrooms({
        additionalObligationsMinor: 10_000_00,
        confirmedObligationsMinor: 30_000_00,
        essentialSpendingMinor: 40_000_00,
        expectedIncomeMinor: 0,
        immediateObligationsMinor: 30_000_00,
        investmentTargetMinor: 20_000_00,
        liquidCashMinor: 150_000_00,
        minimumBufferMinor: 25_000_00,
        plannedPurchasesMinor: 5_000_00,
        purchasePriceMinor: 45_000_00,
      })
    ).toEqual({
      comfortableMinor: 50_000_00,
      goalMinor: 5_000_00,
      technicalMinor: 75_000_00,
    });
  });

  it("treats exactly zero headroom as a valid integer result", () => {
    expect(
      calculateHeadrooms({
        additionalObligationsMinor: 0,
        confirmedObligationsMinor: 0,
        essentialSpendingMinor: 0,
        expectedIncomeMinor: 0,
        immediateObligationsMinor: 0,
        investmentTargetMinor: 0,
        liquidCashMinor: 50_000,
        minimumBufferMinor: 25_000,
        plannedPurchasesMinor: 0,
        purchasePriceMinor: 25_000,
      })
    ).toEqual({ comfortableMinor: 0, goalMinor: 0, technicalMinor: 25_000 });
  });

  it("rejects arithmetic outside the safe integer range", () => {
    expect(() =>
      calculateHeadrooms({
        additionalObligationsMinor: 0,
        confirmedObligationsMinor: 0,
        essentialSpendingMinor: 0,
        expectedIncomeMinor: 1,
        immediateObligationsMinor: 0,
        investmentTargetMinor: 0,
        liquidCashMinor: Number.MAX_SAFE_INTEGER,
        minimumBufferMinor: 0,
        plannedPurchasesMinor: 0,
        purchasePriceMinor: 0,
      })
    ).toThrow("Money calculation exceeded the safe integer range");
  });
});

describe("buildDailyForecast", () => {
  it("applies same-day salary and rent atomically before testing affordability", () => {
    const forecast = buildDailyForecast({
      endDate: "2026-08-31",
      essentialReserveMinor: 0,
      income: [{ amountMinor: 100_000_00, dueOn: "2026-08-31", id: "salary" }],
      investmentReserveMinor: 0,
      liquidCashMinor: 100_000_00,
      minimumBufferMinor: 25_000_00,
      obligations: [
        {
          amountMinor: 80_000_00,
          budgetTreatment: "additional",
          dueOn: "2026-08-31",
          id: "rent",
        },
      ],
      plannedPurchases: [],
      purchasePriceMinor: 45_000_00,
      startDate: "2026-08-30",
    });

    expect(forecast.days).toEqual([
      expect.objectContaining({
        candidateComfortableHeadroomMinor: -50_000_00,
        date: "2026-08-30",
        endingCashMinor: 100_000_00,
      }),
      expect.objectContaining({
        candidateComfortableHeadroomMinor: 50_000_00,
        date: "2026-08-31",
        endingCashMinor: 120_000_00,
      }),
    ]);
    expect(forecast.firstComfortablyAffordableDate).toBe("2026-08-31");
    expect(forecast.minimumCashMinor).toBe(100_000_00);
    expect(forecast.minimumCashDate).toBe("2026-08-30");
  });

  it("spends from the essential reserve without reducing goal availability twice", () => {
    const forecast = buildDailyForecast({
      endDate: "2026-08-20",
      essentialReserveMinor: 40_000_00,
      income: [],
      investmentReserveMinor: 20_000_00,
      liquidCashMinor: 150_000_00,
      minimumBufferMinor: 25_000_00,
      obligations: [
        {
          amountMinor: 30_000_00,
          budgetTreatment: "inside_essential_budget",
          dueOn: "2026-08-18",
          id: "rent",
        },
        {
          amountMinor: 10_000_00,
          budgetTreatment: "additional",
          dueOn: "2026-08-19",
          id: "card",
        },
      ],
      plannedPurchases: [{ amountMinor: 5_000_00, dueOn: "2026-08-20", id: "shoes" }],
      purchasePriceMinor: 45_000_00,
      startDate: "2026-08-17",
    });

    expect(forecast.days.map((day) => day.goalAvailableMinor)).toEqual([
      75_000_00, 75_000_00, 75_000_00, 75_000_00,
    ]);
    expect(forecast.days[1]?.events).toEqual([
      {
        amountMinor: 30_000_00,
        budgetTreatment: "inside_essential_budget",
        id: "rent",
        kind: "obligation",
      },
    ]);
  });

  it("charges only the amount beyond the remaining essential reserve", () => {
    const forecast = buildDailyForecast({
      endDate: "2026-08-18",
      essentialReserveMinor: 40_000_00,
      income: [],
      investmentReserveMinor: 0,
      liquidCashMinor: 150_000_00,
      minimumBufferMinor: 0,
      obligations: [
        {
          amountMinor: 50_000_00,
          budgetTreatment: "inside_essential_budget",
          dueOn: "2026-08-18",
          id: "rent",
        },
      ],
      plannedPurchases: [],
      purchasePriceMinor: 0,
      startDate: "2026-08-17",
    });

    expect(forecast.days.map((day) => day.goalAvailableMinor)).toEqual([110_000_00, 100_000_00]);
  });

  it("returns null when the purchase never becomes comfortable and ignores outside events", () => {
    const forecast = buildDailyForecast({
      endDate: "2026-08-18",
      essentialReserveMinor: 0,
      income: [{ amountMinor: 1_000_000_00, dueOn: "2026-08-19", id: "late-income" }],
      investmentReserveMinor: 0,
      liquidCashMinor: 20_000_00,
      minimumBufferMinor: 10_000_00,
      obligations: [],
      plannedPurchases: [],
      purchasePriceMinor: 15_000_00,
      startDate: "2026-08-17",
    });

    expect(forecast.firstComfortablyAffordableDate).toBeNull();
    expect(forecast.days).toHaveLength(2);
    expect(forecast.days.flatMap((day) => day.events)).toEqual([]);
  });

  it("rejects inverted and overlong date ranges", () => {
    const input = {
      endDate: "2026-08-16",
      essentialReserveMinor: 0,
      income: [],
      investmentReserveMinor: 0,
      liquidCashMinor: 0,
      minimumBufferMinor: 0,
      obligations: [],
      plannedPurchases: [],
      purchasePriceMinor: 0,
      startDate: "2026-08-17",
    };
    expect(() => buildDailyForecast(input)).toThrow(
      "Forecast end date cannot be before start date"
    );
    expect(() => buildDailyForecast({ ...input, endDate: "2026-09-17" })).toThrow(
      "Forecast cannot exceed 30 days"
    );
  });
});
